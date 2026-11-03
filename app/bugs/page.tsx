"use client";
// Tester side: every bug filed with one PayPal email, with Claude's call, why, and where the money is.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, Mark, PayoutPill, SevPill, StatusPill, usd, useStateApi, verdictWords } from "../../components/ui.tsx";

const EMAIL_KEY = "bugpay-tester-email";

export default function MyBugs() {
  const { s, err } = useStateApi();
  const [email, setEmail] = useState("");
  useEffect(() => setEmail(new URLSearchParams(location.search).get("email") ?? localStorage.getItem(EMAIL_KEY) ?? ""), []);

  const mine = s && email ? s.reports.filter((r) => r.tester.email.toLowerCase() === email.trim().toLowerCase()).reverse() : [];
  const item = (id: string) => s?.batches.flatMap((b) => b.items.map((i) => ({ ...i, batch: b.paypalBatchId }))).filter((i) => i.reportId === id).at(-1);
  const paid = mine.filter((r) => r.status === "paid").reduce((a, r) => a + r.bounty, 0);

  return (
    <div className="public">
      <main className="sheet">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Mark size={32} />
          <div>
            <h1>My bugs</h1>
            <p className="muted" style={{ margin: 0 }}>What happened to each report you filed, and where your bounty is.</p>
          </div>
        </div>
        <form className="form" onSubmit={(e) => { e.preventDefault(); localStorage.setItem(EMAIL_KEY, email.trim()); }}>
          <div className="field"><label htmlFor="email">PayPal email you reported with</label><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        </form>
        {err && <p className="error">{err}</p>}
        {s && email && (
          <p style={{ margin: 0 }}>{mine.length ? <><b>{mine.length} {mine.length === 1 ? "report" : "reports"}</b>, <b className="num">{usd(paid)}</b> sent to your PayPal.</> : "No reports with this email yet."}</p>
        )}
        {mine.map((r) => {
          const i = item(r.id);
          const first = r.triage.duplicateOf ? s!.reports.find((x) => x.id === r.triage.duplicateOf) : undefined;
          return (
            <section key={r.id} className="card result" aria-labelledby={`t-${r.id}`}>
              <div className="detail-head"><span className="call-line"><span className="id">{r.id}</span>{r.status === "review" ? <span className="pill warning">With the studio</span> : <StatusPill s={r.status} />}{i && <PayoutPill s={i.status} />}</span><span className="muted">{ago(r.createdAt)}</span></div>
              <h2 id={`t-${r.id}`}>{r.title}</h2>
              <div className="call-line">
                {r.triage.verdict === "valid" ? <SevPill s={r.triage.severity} /> : <span className="pill neutral">{verdictWords[r.triage.verdict]}</span>}
                <span className="muted">{r.triage.reasoning}</span>
              </div>
              {first && <p style={{ margin: 0 }}>Someone reported this first: <span className="id">{first.id}</span> {first.title}, filed {new Date(first.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. The bounty goes to the first finder.</p>}
              <p style={{ margin: 0 }}>
                {r.status === "paid" ? <><b className="num">{usd(r.bounty)}</b> sent to {r.tester.email}{i?.status === "UNCLAIMED" ? ". PayPal is holding it until you sign up with this email" : ""}{i?.batch ? <> (PayPal payout <span className="id">{i.batch}</span>)</> : ""}.</>
                  : r.status === "rejected" ? "Closed by the studio, no bounty."
                    : r.status === "approved" ? <>Approved at <b className="num">{usd(r.bounty)}</b>, in the next payout.</>
                      : <>With the studio. {r.triage.decisionReason}.</>}
              </p>
            </section>
          );
        })}
        <Link href="/submit" className="btn" style={{ alignSelf: "flex-start", textDecoration: "none" }}>Report a bug</Link>
      </main>
    </div>
  );
}
