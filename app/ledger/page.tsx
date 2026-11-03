"use client";
import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useState } from "react";
import { gridTheme } from "../../components/grid.ts";
import { api, PayoutPill, Shell, usd, useStateApi } from "../../components/ui.tsx";

interface Line { batch: string; paypalBatchId: string; sent: string; trigger: string; reportId: string; tester: string; country: string; email: string; amount: number; status: string }


export default function Ledger() {
  const { s, err, reload } = useStateApi();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const lines = useMemo<Line[]>(() => {
    if (!s) return [];
    return [...s.batches].reverse().flatMap((b) => b.items.map((i) => {
      const r = s.reports.find((x) => x.id === i.reportId)!;
      return { batch: b.id, paypalBatchId: b.paypalBatchId, sent: b.createdAt, trigger: b.trigger === "autopilot" ? "Autopilot" : b.trigger === "agent" ? "Agent" : "Studio", reportId: i.reportId, tester: r.tester.name, country: r.tester.country, email: i.email, amount: i.amount, status: i.status };
    }));
  }, [s]);

  // webhooks change the ledger on the server; poll while a payout is still on its way so it shows up live
  const moving = !!s?.batches.some((b) => b.items.some((i) => ["SENDING", "PENDING", "ONHOLD"].includes(i.status)));
  useEffect(() => {
    if (!moving || !s?.mode.webhooks) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [moving, s?.mode.webhooks, reload]);

  const cols = useMemo<ColDef<Line>[]>(() => [
    { field: "sent", headerName: "Sent", width: 150, valueFormatter: (p) => new Date(p.value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
    { field: "reportId", headerName: "Bug", width: 104, cellClass: "id" },
    { field: "tester", headerName: "Tester", flex: 1, minWidth: 140, valueFormatter: (p) => `${p.value} (${p.data!.country})` },
    { field: "email", headerName: "PayPal email", flex: 1, minWidth: 200 },
    { field: "trigger", headerName: "Paid by", width: 110 },
    { field: "amount", headerName: "Amount", width: 110, type: "rightAligned", valueFormatter: (p) => usd(p.value), cellClass: ["num", "ag-right-aligned-cell"] },
    { field: "status", headerName: "PayPal status", width: 140, cellRenderer: (p: { value: string }) => <PayoutPill s={p.value} /> },
    { field: "paypalBatchId", headerName: "Payout batch", width: 200, cellClass: "id" },
  ], []);

  if (!s) return <Shell s={null} crumb="Payouts"><p className={err ? "error" : "muted"}>{err || "Loading payouts"}</p></Shell>;
  const failed = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"]);
  const delivered = lines.filter((l) => !failed.has(l.status)); // a failed payout goes back to the queue, so it isn't counted as sent
  const total = delivered.reduce((a, l) => a + l.amount, 0);
  const countries = new Set(delivered.map((l) => l.country)).size;
  const auto = delivered.filter((l) => l.trigger === "Autopilot");
  const unclaimed = lines.filter((l) => l.status === "UNCLAIMED");
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
          <p className="finding"><b>{usd(total)} sent to {new Set(delivered.map((l) => l.email)).size} testers in {countries} countries</b> over {delivered.length} PayPal payouts{lines.length > delivered.length ? ` (${lines.length - delivered.length} failed or came back, and went back to the queue)` : ""}. Autopilot sent {auto.length} of them ({usd(auto.reduce((a, l) => a + l.amount, 0))}).{unclaimed.length > 0 && <> {unclaimed.length} unclaimed ({usd(unclaimed.reduce((a, l) => a + l.amount, 0))}): {unclaimed.map((l) => l.reportId).join(", ")}, which you can take back into the pool from the queue.</>}</p>
        </div>
        <div className="actions">
          {s.mode.webhooks && <span className="pill positive" title="PayPal pushes each payout's status here, checked with PayPal's signature service">Live from PayPal webhooks</span>}
          <button className="btn" onClick={() => api<{ errors: string[] }>("/api/payouts").then((r) => { reload(); setMsg(r.errors.length ? { text: `Some batches couldn't be checked: ${r.errors.join("; ")}`, bad: true } : { text: "Statuses checked with PayPal", bad: false }); }, (e) => setMsg({ text: e.message, bad: true }))}>{s.mode.webhooks ? "Re-check now" : "Check statuses with PayPal"}</button>
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
