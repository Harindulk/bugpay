"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Db, ReportStatus, Severity, Verdict } from "../lib/types.ts";

export type State = Db & {
  pool: { funded: number; paid: number; approved: number; left: number };
  autopaidToday: number;
  mode: { paypal: "mock" | "sandbox"; ai: "claude" | "rules" };
  paypalClientId: string | null;
};

export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ago(iso: string, now = Date.now()) {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return h < 48 ? "Yesterday" : `${Math.round(h / 24)} days`;
}

export async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j as T;
}

export function useStateApi() {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const reload = useCallback(() => api<State>("/api/state").then(setS, (e) => setErr(e.message)), []);
  useEffect(() => {
    reload();
    // pick up changes made in another tab or by the agent elsewhere
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => { document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, [reload]);
  return { s, err, reload };
}

const statusPill: Record<ReportStatus, [string, string]> = {
  review: ["warning", "Needs your call"],
  approved: ["accent", "Approved"],
  paid: ["positive", "Paid"],
  rejected: ["neutral", "Closed"],
};
export const StatusPill = ({ s }: { s: ReportStatus }) => <span className={`pill ${statusPill[s][0]}`}>{statusPill[s][1]}</span>;

const sevName: Record<Severity, string> = { S1: "S1 crash", S2: "S2 blocks play", S3: "S3 glitch", S4: "S4 cosmetic" };
export const SevPill = ({ s }: { s: Severity | null }) =>
  s ? <span className={`pill ${s === "S1" ? "negative" : s === "S2" ? "warning" : "neutral"}`}>{sevName[s]}</span> : <span className="muted">-</span>;

export const verdictWords: Record<Verdict, string> = { valid: "Valid", duplicate: "Duplicate", not_a_bug: "Not a bug", needs_info: "Needs info" };

// The mark: a coin with a bug on it.
export const Mark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="14" fill="var(--accent)" />
    <ellipse cx="14" cy="15.5" rx="4.6" ry="6" fill="#fff" />
    <circle cx="14" cy="8.6" r="2.4" fill="#fff" />
    <path d="M14 10.5v11M9.4 12.5 6.5 10.5M18.6 12.5l2.9-2M9.2 16H6M18.8 16H22M9.6 19.5l-2.6 2.2M18.4 19.5l2.6 2.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M14 10.5v11" stroke="var(--accent)" strokeWidth="1" />
  </svg>
);

const I = {
  queue: <path d="M3 4.5h10M3 8h10M3 11.5h6" />,
  ledger: <path d="M3.5 2.5h9v11h-9zM6 5.5h4M6 8h4M6 10.5h2" />,
  form: <path d="M3 13l1-3 6.5-6.5 2 2L6 12zM9.5 4.5l2 2" />,
};
const Icon = ({ d }: { d: React.ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export function Shell({ s, crumb, children }: { s: State | null; crumb: string; children: React.ReactNode }) {
  const path = usePathname();
  const nav = [
    { href: "/", label: "Triage queue", icon: I.queue },
    { href: "/ledger", label: "Payouts", icon: I.ledger },
    { href: "/submit", label: "Tester form", icon: I.form },
  ];
  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" href="/">
          <Mark />
          <span>Bugpay<small>{s?.campaign.studio ?? "Loading"}</small></span>
        </Link>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="nav" aria-current={path === n.href ? "page" : undefined}>
            <Icon d={n.icon} />{n.label}
          </Link>
        ))}
        {s && (
          <div className="side-foot">
            <span>PayPal: {s.mode.paypal === "mock" ? "mock (no sandbox keys)" : "sandbox"}</span>
            <span>Triage: {s.mode.ai === "claude" ? "Claude Opus 5.5" : "keyword rules (no Claude key)"}</span>
          </div>
        )}
      </aside>
      <header className="top">
        <span className="crumb">{s ? <>{s.campaign.game} <b>/ {crumb}</b></> : crumb}</span>
      </header>
      <main className="sheet">{children}</main>
    </div>
  );
}
