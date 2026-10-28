"use client";
import { useState } from "react";
import { api, Mark, SevPill, usd, useStateApi, verdictWords } from "../../components/ui.tsx";
import type { Report } from "../../lib/types.ts";

export default function Submit() {
  const { s } = useStateApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Report | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      setDone(await api<Report>("/api/reports", Object.fromEntries(new FormData(e.currentTarget))));
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  const p = s?.campaign.rules.prices;
  return (
    <div className="public">
      <main className="sheet">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Mark size={32} />
          <div>
            <h1>Report a bug in {s ? `${s.campaign.game.split(":")[0]} ${s.campaign.build}` : "the playtest"}</h1>
            <p className="muted" style={{ margin: 0 }}>{s?.campaign.studio} pays per accepted bug, straight to your PayPal.</p>
          </div>
        </div>
        {s && <p style={{ margin: 0 }}>{s.campaign.brief}</p>}
        {p && (
          <div className="prices" aria-label="What each bug pays">
            <span>Crash or lost progress <b className="num">{usd(p.S1)}</b></span>
            <span>Blocks play <b className="num">{usd(p.S2)}</b></span>
            <span>Glitch <b className="num">{usd(p.S3)}</b></span>
            <span>Typo or cosmetic <b className="num">{usd(p.S4)}</b></span>
          </div>
        )}

        {done ? (
          <section className="card result" aria-live="polite">
            <div className="detail-head"><span className="id">{done.id}</span>{done.status === "paid" ? <span className="pill positive">Paid</span> : <span className="pill warning">With the studio</span>}</div>
            <h2>{done.title}</h2>
            <div className="call-line">
              {done.triage.verdict === "valid" ? <SevPill s={done.triage.severity} /> : <span className="pill neutral">{verdictWords[done.triage.verdict]}</span>}
              <span className="muted">{done.triage.reasoning}</span>
            </div>
            <p style={{ margin: 0 }}>
              {done.status === "paid"
                ? <>We sent <b className="num">{usd(done.bounty)}</b> to {done.tester.email} through PayPal. Thank you.</>
                : done.triage.verdict === "valid"
                  ? <>Worth <b className="num">{usd(done.bounty)}</b> if the studio agrees. {done.triage.decisionReason}.</>
                  : <>The studio will take a look. {done.triage.decisionReason}.</>}
            </p>
            <button className="btn" onClick={() => setDone(null)}>Report another bug</button>
          </section>
        ) : (
          <form className="form" onSubmit={submit}>
            <div className="two">
              <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" className="input" required maxLength={80} autoComplete="name" /></div>
              <div className="field"><label htmlFor="email">PayPal email</label><input id="email" name="email" type="email" className="input" required maxLength={254} autoComplete="email" /></div>
            </div>
            <div className="two">
              <div className="field"><label htmlFor="device">Phone or tablet</label><input id="device" name="device" className="input" required maxLength={80} placeholder="Galaxy A14, Android 14" /></div>
              <div className="field"><label htmlFor="country">Country code</label><input id="country" name="country" className="input" maxLength={2} placeholder="LK" /></div>
            </div>
            <div className="field"><label htmlFor="title">What went wrong, in one line</label><input id="title" name="title" className="input" required maxLength={140} /></div>
            <div className="field"><label htmlFor="body">What you did and what happened</label><textarea id="body" name="body" className="input" required maxLength={4000} /></div>
            {err && <p className="error" role="alert">{err}</p>}
            <button className="btn primary" disabled={busy} style={{ justifySelf: "start" }}>{busy ? "Claude is reading your report" : "Send report"}</button>
          </form>
        )}
      </main>
    </div>
  );
}
