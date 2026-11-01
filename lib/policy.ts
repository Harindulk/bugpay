// Money rules live in code, not in the model: Claude judges the report, these functions decide what gets paid.
import type { Db, Report, Rules, Severity, Triage, Verdict } from "./types.ts";

export const cents = (n: number) => Math.round(n * 100) / 100;

// PayPal item statuses after which the money never reached the tester.
export const FAILED = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"]);

export function bountyFor(verdict: Verdict, severity: Severity | null, rules: Rules): number {
  return verdict === "valid" && severity ? rules.prices[severity] : 0;
}

export function pool(db: Db) {
  const funded = cents(db.funding.reduce((s, f) => s + f.amount, 0));
  const paid = cents(db.reports.filter((r) => r.status === "paid").reduce((s, r) => s + r.bounty, 0));
  const approved = cents(db.reports.filter((r) => r.status === "approved").reduce((s, r) => s + r.bounty, 0));
  const left = cents(funded - paid - approved);
  return { funded, paid, approved, left };
}

const sameDay = (a: string, b: Date) => new Date(a).toDateString() === b.toDateString();

// What autopilot and the agent sent today; both answer to the one daily cap. The studio's own Pay button does not count.
export function autopaidToday(db: Db, now = new Date()): number {
  return cents(
    db.batches
      .filter((b) => b.trigger !== "studio" && sameDay(b.createdAt, now))
      .flatMap((b) => b.items)
      .filter((i) => !FAILED.has(i.status))
      .reduce((s, i) => s + i.amount, 0),
  );
}

type Judgement = Omit<Triage, "bounty" | "decision" | "decisionReason">;

export function decide(j: Judgement, rules: Rules, usedToday: number, left: number): Pick<Triage, "bounty" | "decision" | "decisionReason"> {
  const bounty = bountyFor(j.verdict, j.severity, rules);
  const review = (why: string) => ({ bounty, decision: "review" as const, decisionReason: why });
  if (j.verdict !== "valid") return review(`Marked ${j.verdict.replace(/_/g, " ")}, so a person decides`);
  if (bounty <= 0) return review("No severity, so no price to pay");
  if (!rules.autopilot) return review("Autopilot is off");
  if (j.confidence < rules.minConfidence) return review(`Confidence ${Math.round(j.confidence * 100)}% is under ${Math.round(rules.minConfidence * 100)}%`);
  if (bounty > rules.perBugCap) return review(`$${bounty} is over the $${rules.perBugCap} per-bug cap`);
  if (usedToday + bounty > rules.dailyCap) return review(`Would pass the $${rules.dailyCap} daily cap ($${usedToday} used)`);
  if (bounty > left) return review(`Pool has only $${left} left`);
  return { bounty, decision: "auto_pay", decisionReason: `Valid ${j.severity}, ${Math.round(j.confidence * 100)}% sure, inside both caps` };
}

export function nextId(reports: Report[]): string {
  const n = reports.reduce((m, r) => Math.max(m, Number(r.id.slice(4))), 140) + 1;
  return `BUG-${String(n).padStart(4, "0")}`;
}
