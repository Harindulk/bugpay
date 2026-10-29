"use client";
import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Fund } from "../components/Fund.tsx";
import { gridTheme } from "../components/grid.ts";
import { ago, api, SevPill, Shell, StatusPill, usd, useStateApi, verdictWords, type State } from "../components/ui.tsx";
import { FAILED } from "../lib/policy.ts";
import type { Report, ReportStatus } from "../lib/types.ts";


const tabs: { key: ReportStatus | "all"; label: string }[] = [
  { key: "review", label: "Needs your call" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Closed" },
  { key: "all", label: "All" },
];

export default function Queue() {
  const { s, err, reload } = useStateApi();
  const [tab, setTab] = useState<ReportStatus | "all">("review");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const grid = useRef<AgGridReact<Report>>(null);

  const rows = useMemo(() => (s ? [...s.reports].reverse().filter((r) => tab === "all" || r.status === tab) : []), [s, tab]);
  const current = s?.reports.find((r) => r.id === sel) ?? rows[0] ?? null;

  // Keep the grid's highlighted row on the report the detail panel shows.
  useEffect(() => {
    grid.current?.api?.forEachNode((n) => n.setSelected(n.id === current?.id, false, "api"));
  }, [current?.id, rows]);

  const cols = useMemo<ColDef<Report>[]>(() => [
    { field: "id", headerName: "Bug", width: 104, cellClass: "id" },
    {
      field: "title", headerName: "Report", flex: 2, minWidth: 220,
      cellRenderer: (p: { data: Report }) => (
        <div className="cell2"><span>{p.data.title}</span><small>{p.data.tester.name} · {p.data.device}</small></div>
      ),
    },
    {
      headerName: "Claude's call", flex: 1, minWidth: 150, valueGetter: (p) => p.data!.triage.verdict,
      cellRenderer: (p: { data: Report }) => p.data.triage.verdict === "valid"
        ? <SevPill s={p.data.triage.severity} />
        : <span className="muted">{verdictWords[p.data.triage.verdict]}{p.data.triage.duplicateOf ? ` of ${p.data.triage.duplicateOf}` : ""}</span>,
    },
    { headerName: "Sure", width: 80, type: "rightAligned", valueGetter: (p) => p.data!.triage.confidence, valueFormatter: (p) => `${Math.round(p.value * 100)}%`, cellClass: ["num", "ag-right-aligned-cell"] },
    { field: "bounty", headerName: "Bounty", width: 100, type: "rightAligned", valueFormatter: (p) => (p.value ? usd(p.value) : "-"), cellClass: ["num", "ag-right-aligned-cell"] },
    { field: "status", headerName: "Status", width: 150, cellRenderer: (p: { data: Report }) => <StatusPill s={p.data.status} /> },
    { field: "createdAt", headerName: "Filed", width: 104, type: "rightAligned", valueFormatter: (p) => ago(p.value) },
  ], []);

  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setMsg(null);
    try { await fn(); await reload(); if (done) setMsg({ text: done, bad: false }); } catch (e) { setMsg({ text: (e as Error).message, bad: true }); } finally { setBusy(""); }
  };

  if (!s) return <Shell s={null} crumb="Triage queue"><p className={err ? "error" : "muted"}>{err || "Loading the playtest"}</p></Shell>;

  const count = (k: ReportStatus | "all") => (k === "all" ? s.reports.length : s.reports.filter((r) => r.status === k).length);
  const approved = s.reports.filter((r) => r.status === "approved");
  const autoToday = s.batches
    .filter((b) => b.trigger === "autopilot" && new Date(b.createdAt).toDateString() === new Date().toDateString())
    .flatMap((b) => b.items).filter((i) => !FAILED.has(i.status)).length; // same items autopaidToday counts

  return (
    <Shell s={s} crumb="Triage queue">
      <div className="titlerow">
        <div>
          <h1>{s.campaign.game.split(":")[0]} {s.campaign.build} playtest</h1>
          <p className="finding">
            <b>{count("review")} {count("review") === 1 ? "report needs" : "reports need"} your call.</b>{" "}
            Autopilot paid {autoToday} {autoToday === 1 ? "bug" : "bugs"} today ({usd(s.autopaidToday)} of the {usd(s.campaign.rules.dailyCap)} daily cap).
          </p>
        </div>
        <div className="actions">
          <Fund clientId={s.paypalClientId} onDone={() => { reload(); setMsg({ text: "Pool topped up", bad: false }); }} />
          <button className="btn primary" disabled={!approved.length || !!busy}
            onClick={() => act("pay", () => api("/api/payouts", {}), `Sent ${approved.length} PayPal payout${approved.length === 1 ? "" : "s"}`)}>
            {busy === "pay" ? "Sending payouts" : approved.length ? `Pay ${approved.length} approved · ${usd(s.pool.approved)}` : "Nothing approved to pay"}
          </button>
        </div>
      </div>
      {msg && <p className={msg.bad ? "error" : "muted"} role="status" style={{ margin: "-12px 0 0" }}>{msg.text}</p>}

      <div className="row2">
        <PoolCard s={s} />
        <Autopilot s={s} onChange={reload} />
      </div>

      <AgentBox ai={s.mode.ai} onDone={reload} />

      <div className="row2">
        <section className="queue" aria-labelledby="q-title">
          <h2 id="q-title" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Reports</h2>
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} role="tab" className="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setSel(null); }}>
                {t.label}<span className="num">{count(t.key)}</span>
              </button>
            ))}
          </div>
          <div className="grid">
            <AgGridReact<Report>
              ref={grid}
              theme={gridTheme}
              rowData={rows}
              columnDefs={cols}
              domLayout="autoHeight"
              getRowId={(p) => p.data.id}
              rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
              onSelectionChanged={(e) => {
                if (e.source === "api") return;
                const r = e.api.getSelectedRows()[0];
                if (r) setSel(r.id);
                else e.api.forEachNode((n) => n.setSelected(n.id === current?.id, false, "api")); // a ctrl-click can't empty the selection
              }}
              onFirstDataRendered={(e) => e.api.forEachNode((n) => n.setSelected(n.id === current?.id, false, "api"))}
              overlayNoRowsTemplate={tab === "review" ? "Nothing waiting. Autopilot and you are caught up." : "No reports here yet."}
            />
          </div>
        </section>
        <Detail key={current ? `${current.id}:${current.status}:${current.bounty}` : "none"} r={current} s={s} busy={busy} act={act} onOpen={(id) => { setTab("all"); setSel(id); }} />
      </div>
    </Shell>
  );
}

interface AgentResult { reply: string; actions: { tool: string; input: unknown; ok: boolean; result: string }[] }

const toolWords: Record<string, string> = {
  list_reports: "Read the queue", get_pool: "Checked the pool", approve_report: "Approved", close_report: "Closed",
  pay_approved: "Sent a PayPal payout batch", set_autopilot: "Changed autopilot",
};

function AgentBox({ ai, onDone }: { ai: State["mode"]["ai"]; onDone: () => void }) {
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AgentResult | null>(null);
  const [err, setErr] = useState("");
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmd.trim()) return;
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await api<AgentResult>("/api/agent", { command: cmd })); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); onDone(); }
  };
  const shown = res?.actions.filter((a) => !["list_reports", "get_pool"].includes(a.tool) || !a.ok) ?? [];
  return (
    <section className="card agent" aria-labelledby="agent-title">
      <form className="agent-form" onSubmit={run}>
        <h2 id="agent-title"><label htmlFor="agent-cmd">Tell the agent</label></h2>
        <input id="agent-cmd" className="input" value={cmd} onChange={(e) => setCmd(e.target.value)} maxLength={500}
          placeholder="Approve Lena's handbrake bug at $20, close the feature request, then pay everything approved" disabled={busy} />
        <button className="btn primary" disabled={busy || !cmd.trim()}>{busy ? "Working" : "Run"}</button>
      </form>
      {ai === "rules" && !res && !err && <p className="muted small" style={{ margin: 0 }}>Needs a Claude key in .env.local. It can approve, close and pay, up to the daily cap per command.</p>}
      {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
      {res && (
        <div className="agent-out" aria-live="polite">
          <p style={{ margin: 0 }}>{res.reply}</p>
          {shown.length > 0 && (
            <ul className="agent-steps">
              {shown.map((a, i) => {
                const id = (a.input as { id?: string })?.id;
                return <li key={i} className={a.ok ? "" : "error"}>{a.ok ? toolWords[a.tool] ?? a.tool : a.result}{a.ok && id ? <> <span className="id">{id}</span></> : null}</li>;
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function PoolCard({ s }: { s: State }) {
  const paid = s.reports.filter((r) => r.status === "paid");
  const testers = new Set(paid.map((r) => r.tester.email)).size;
  const total = Math.max(s.pool.funded, 0.01);
  return (
    <section className="card pool" aria-labelledby="pool-title">
      <h2 id="pool-title">Bounty pool</h2>
      <dl className="pool-figs" style={{ margin: 0 }}>
        <div className="fig lead"><dt>Left to pay out</dt><dd>{usd(s.pool.left)}</dd></div>
        <div className="fig"><dt>Paid to {testers} {testers === 1 ? "tester" : "testers"}</dt><dd>{usd(s.pool.paid)}</dd></div>
        <div className="fig"><dt>Approved, not sent</dt><dd>{usd(s.pool.approved)}</dd></div>
        <div className="fig"><dt>Funded through PayPal</dt><dd>{usd(s.pool.funded)}</dd></div>
      </dl>
      <div className="bar" role="img" aria-label={`${usd(s.pool.paid)} paid, ${usd(s.pool.approved)} approved, ${usd(s.pool.left)} left of ${usd(s.pool.funded)}`}>
        {paid.map((r) => <span key={r.id} className="seg" style={{ flexGrow: r.bounty / total }} title={`${r.id} ${r.tester.name}: ${usd(r.bounty)}`} />)}
        {s.reports.filter((r) => r.status === "approved").map((r) => <span key={r.id} className="seg approved" style={{ flexGrow: r.bounty / total }} title={`${r.id} approved: ${usd(r.bounty)}`} />)}
        {s.pool.left > 0 && <span className="seg left" style={{ flexGrow: s.pool.left / total }} />}
      </div>
      <div className="legend"><span><i />Paid, one block per bug</span><span><i className="approved" />Approved</span><span><i className="left" />Left</span></div>
    </section>
  );
}

function Autopilot({ s, onChange }: { s: State; onChange: () => void }) {
  const r = s.campaign.rules;
  const [err, setErr] = useState("");
  const set = (patch: object) => api("/api/rules", patch).then(onChange, (e) => setErr(e.message));
  // An empty or negative cap is a half-typed value, not a decision: put the saved number back.
  const keep = (el: HTMLInputElement, saved: number) => {
    const ok = el.value !== "" && Number(el.value) >= 0;
    if (!ok) el.value = String(saved);
    return ok && Number(el.value) !== saved;
  };
  return (
    <section className="card auto" aria-labelledby="auto-title">
      <div className="auto-head">
        <h2 id="auto-title">Autopilot</h2>
        <label className="switch"><input type="checkbox" checked={r.autopilot} onChange={(e) => set({ autopilot: e.target.checked })} />{r.autopilot ? "On" : "Off"}</label>
      </div>
      <p className="muted" style={{ margin: 0 }}>Pays a valid bug the moment Claude files it, if it is sure enough and inside both caps. Everything else waits for you.</p>
      <dl className="kv">
        <dt><label htmlFor="cap-bug">Most per bug</label></dt>
        <dd><span className="money"><span>$</span><input key={`bug-${r.perBugCap}`} id="cap-bug" className="input" type="number" min={0} step={1} defaultValue={r.perBugCap} onBlur={(e) => keep(e.target, r.perBugCap) && set({ perBugCap: e.target.value })} /></span></dd>
        <dt><label htmlFor="cap-day">Most per day</label></dt>
        <dd><span className="money"><span>$</span><input key={`day-${r.dailyCap}`} id="cap-day" className="input" type="number" min={0} step={5} defaultValue={r.dailyCap} onBlur={(e) => keep(e.target, r.dailyCap) && set({ dailyCap: e.target.value })} /></span></dd>
        <dt>Claude at least</dt><dd>{Math.round(r.minConfidence * 100)}% sure</dd>
      </dl>
      <div className="prices" aria-label="Price per severity">
        {(["S1", "S2", "S3", "S4"] as const).map((k) => <span key={k}>{k} <b className="num">{usd(r.prices[k])}</b></span>)}
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function Detail({ r, s, busy, act, onOpen }: {
  r: Report | null; s: State; busy: string;
  act: (label: string, fn: () => Promise<unknown>, done?: string) => void; onOpen: (id: string) => void;
}) {
  const [bounty, setBounty] = useState(r ? String(r.bounty || (r.triage.severity ? s.campaign.rules.prices[r.triage.severity] : 0)) : "0");
  if (!r) return <aside className="card empty"><b>No report selected</b><span>Pick a row to see Claude's reasoning.</span></aside>;
  const t = r.triage;
  const send = (action: string) => act(action, () => api(`/api/reports/${r.id}`, action === "approve" ? { action, bounty: Number(bounty) } : { action }));
  return (
    <aside className="card detail" aria-labelledby="d-title">
      <div className="detail-head"><span className="id">{r.id}</span><StatusPill s={r.status} /></div>
      <div>
        <h2 id="d-title">{r.title}</h2>
        <p className="muted small" style={{ margin: "4px 0 0" }}>{r.tester.name} ({r.tester.country}) · {r.device} · {r.build} · {ago(r.createdAt)}</p>
      </div>
      <p className="quote">{r.body}</p>
      <div className="call">
        <div className="call-line">
          <b>Claude's call</b>
          {t.verdict === "valid" ? <SevPill s={t.severity} /> : <span className="pill neutral">{verdictWords[t.verdict]}</span>}
          <span className="muted num">{Math.round(t.confidence * 100)}% sure</span>
        </div>
        <p style={{ margin: 0 }}>{t.reasoning}</p>
        {t.duplicateOf && <p style={{ margin: 0 }}>Same bug as <button className="linkish id" onClick={() => onOpen(t.duplicateOf!)}>{t.duplicateOf}</button></p>}
        {t.repro.length > 0 && <ol className="repro">{t.repro.map((x, i) => <li key={i}>{x}</li>)}</ol>}
        <p className="muted small" style={{ margin: 0 }}>{t.decision === "auto_pay" ? "Autopilot paid it: " : "Held for you: "}{t.decisionReason}.</p>
      </div>
      {r.status === "paid" ? (
        <p style={{ margin: 0 }}>Paid <b className="num">{usd(r.bounty)}</b> to {r.tester.email} through PayPal Payouts.</p>
      ) : r.status === "rejected" ? (
        <div className="decide" style={{ gridTemplateColumns: "1fr" }}><button className="btn" disabled={!!busy} onClick={() => send("reopen")}>Reopen</button></div>
      ) : (
        <div className="decide">
          <div className="field">
            <label htmlFor="bounty">Bounty</label>
            <span className="money"><span>$</span><input id="bounty" className="input" type="number" min={0} step={1} value={bounty} onChange={(e) => setBounty(e.target.value)} /></span>
          </div>
          <button className="btn danger" disabled={!!busy} onClick={() => send("reject")}>Close, no pay</button>
          {r.status === "approved" && Number(bounty) === r.bounty
            ? <button className="btn primary" disabled>Approved</button>
            : <button className="btn primary" disabled={!!busy} onClick={() => send("approve")}>{r.status === "approved" ? "Update bounty" : "Approve"}</button>}
        </div>
      )}
    </aside>
  );
}
