"use client";
import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";
import { gridTheme } from "../../components/grid.ts";
import { api, Shell, usd, useStateApi } from "../../components/ui.tsx";

interface Line { batch: string; paypalBatchId: string; sent: string; trigger: string; reportId: string; tester: string; country: string; email: string; amount: number; status: string }

const statusClass = (s: string) => (s === "SUCCESS" ? "positive" : ["FAILED", "DENIED", "RETURNED", "BLOCKED"].includes(s) ? "negative" : s === "UNCLAIMED" || s === "SENDING" ? "warning" : "neutral");
const statusWords: Record<string, string> = { SENDING: "Not confirmed", SUCCESS: "Received", PENDING: "Sending", UNCLAIMED: "Unclaimed", FAILED: "Failed", DENIED: "Denied", RETURNED: "Returned", ONHOLD: "On hold", BLOCKED: "Blocked" };

export default function Ledger() {
  const { s, err, reload } = useStateApi();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const lines = useMemo<Line[]>(() => {
    if (!s) return [];
    return [...s.batches].reverse().flatMap((b) => b.items.map((i) => {
      const r = s.reports.find((x) => x.id === i.reportId)!;
      return { batch: b.id, paypalBatchId: b.paypalBatchId, sent: b.createdAt, trigger: b.trigger === "autopilot" ? "Autopilot" : "Studio", reportId: i.reportId, tester: r.tester.name, country: r.tester.country, email: i.email, amount: i.amount, status: i.status };
    }));
  }, [s]);

  const cols = useMemo<ColDef<Line>[]>(() => [
    { field: "sent", headerName: "Sent", width: 150, valueFormatter: (p) => new Date(p.value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
    { field: "reportId", headerName: "Bug", width: 104, cellClass: "id" },
    { field: "tester", headerName: "Tester", flex: 1, minWidth: 140, valueFormatter: (p) => `${p.value} (${p.data!.country})` },
    { field: "email", headerName: "PayPal email", flex: 1, minWidth: 200 },
    { field: "trigger", headerName: "Paid by", width: 110 },
    { field: "amount", headerName: "Amount", width: 110, type: "rightAligned", valueFormatter: (p) => usd(p.value), cellClass: ["num", "ag-right-aligned-cell"] },
    { field: "status", headerName: "PayPal status", width: 140, cellRenderer: (p: { value: string }) => <span className={`pill ${statusClass(p.value)}`}>{statusWords[p.value] ?? p.value}</span> },
    { field: "paypalBatchId", headerName: "Payout batch", width: 200, cellClass: "id" },
  ], []);

  if (!s) return <Shell s={null} crumb="Payouts"><p className={err ? "error" : "muted"}>{err || "Loading payouts"}</p></Shell>;
  const failed = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"]);
  const delivered = lines.filter((l) => !failed.has(l.status)); // a failed payout goes back to the queue, so it isn't counted as sent
  const total = delivered.reduce((a, l) => a + l.amount, 0);
  const countries = new Set(delivered.map((l) => l.country)).size;
  const auto = delivered.filter((l) => l.trigger === "Autopilot");
  const byTester = Object.values(delivered.reduce<Record<string, { name: string; country: string; email: string; bugs: number; amount: number }>>((m, l) => {
    const t = (m[l.email] ??= { name: l.tester, country: l.country, email: l.email, bugs: 0, amount: 0 });
    t.bugs += 1;
    t.amount += l.amount;
    return m;
  }, {})).sort((a, b) => b.amount - a.amount);

  return (
    <Shell s={s} crumb="Payouts">
      <div className="titlerow">
        <div>
          <h1>Payouts</h1>
          <p className="finding"><b>{usd(total)} sent to {new Set(delivered.map((l) => l.email)).size} testers in {countries} countries</b> over {delivered.length} PayPal payouts{lines.length > delivered.length ? ` (${lines.length - delivered.length} failed and went back to the queue)` : ""}. Autopilot sent {auto.length} of them ({usd(auto.reduce((a, l) => a + l.amount, 0))}).</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => api<{ errors: string[] }>("/api/payouts").then((r) => { reload(); setMsg(r.errors.length ? { text: `Some batches couldn't be checked: ${r.errors.join("; ")}`, bad: true } : { text: "Statuses checked with PayPal", bad: false }); }, (e) => setMsg({ text: e.message, bad: true }))}>Check statuses with PayPal</button>
        </div>
      </div>
      {msg && <p className={msg.bad ? "error" : "muted"} role="status" style={{ margin: "-12px 0 0" }}>{msg.text}</p>}
      <div className="grid">
        <AgGridReact<Line> theme={gridTheme} domLayout="autoHeight" rowData={lines} columnDefs={cols} overlayNoRowsTemplate="No payouts yet. Approve a report and press Pay." />
      </div>
      <div className="row-half">
        <section className="card" aria-labelledby="f-title">
          <h2 id="f-title">Pool funding</h2>
          <dl className="kv" style={{ marginTop: 12 }}>
            {s.funding.map((f) => (
              <div key={f.orderId} style={{ display: "contents" }}>
                <dt>{new Date(f.capturedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · PayPal order <span className="id">{f.orderId}</span></dt>
                <dd>{usd(f.amount)}</dd>
              </div>
            ))}
            <dt><b>Funded</b></dt><dd><b>{usd(s.pool.funded)}</b></dd>
          </dl>
        </section>
        <section className="card" aria-labelledby="t-title">
          <h2 id="t-title">By tester</h2>
          <dl className="kv" style={{ marginTop: 12 }}>
            {byTester.map((t) => (
              <div key={t.email} style={{ display: "contents" }}>
                <dt>{t.name} ({t.country}) · {t.bugs} {t.bugs === 1 ? "bug" : "bugs"}</dt>
                <dd>{usd(t.amount)}</dd>
              </div>
            ))}
            <dt><b>Total</b></dt><dd><b>{usd(total)}</b></dd>
          </dl>
        </section>
      </div>
    </Shell>
  );
}
