// What the API routes do: file a report (triage + autopilot), decide on one, pay the approved ones, fund the pool.
// Every write runs inside locked(), which hands it a fresh copy of the store.
import crypto from "node:crypto";
import { autopaidToday, cents, decide, FAILED, nextId, pool } from "./policy.ts";
import { captureOrder, createOrder, PayPalError, payoutStatus, sendPayouts, type PayoutLine } from "./paypal.ts";
import { load, locked, save } from "./store.ts";
import { judge } from "./triage.ts";
import type { Db, PayoutBatch, Report, Rules, Tester } from "./types.ts";

const FINAL = new Set([...FAILED, "SUCCESS"]);

const linesFor = (db: Db, b: PayoutBatch): PayoutLine[] => b.items.map((i) => {
  const r = db.reports.find((x) => x.id === i.reportId)!;
  return { senderItemId: `${i.reportId}-item`, email: i.email, amount: i.amount, note: `${db.campaign.game} ${db.campaign.build}: ${r.id} ${r.title} (${r.triage.severity ?? "bounty"})` };
});

// Send a recorded batch. Safe to call again for the same batch: the sender id never changes, so PayPal pays it once.
async function send(db: Db, b: PayoutBatch) {
  const res = await sendPayouts(b.senderBatchId!, linesFor(db, b));
  b.paypalBatchId = res.paypalBatchId;
  b.status = res.status;
  for (const i of b.items) i.status = res.status === "SUCCESS" ? "SUCCESS" : "PENDING";
}

// PayPal said no to a batch's first and only send, so no money moved: put its reports back in the queue as owed.
function refused(db: Db, b: PayoutBatch) {
  b.status = "DENIED";
  for (const i of b.items) {
    i.status = "DENIED";
    const r = db.reports.find((x) => x.id === i.reportId);
    if (r && r.status === "paid") {
      r.status = "approved";
      r.payoutItem = undefined;
    }
  }
}

// Records the batch and marks the reports paid BEFORE calling PayPal, then saves, so an answer lost in transit
// can never lead to a second batch for the same bugs: the ledger shows it as Sending and Check statuses retries it.
async function pay(db: Db, reports: Report[], trigger: PayoutBatch["trigger"]): Promise<PayoutBatch> {
  const id = `PB-${String(db.batches.length + 1).padStart(4, "0")}`;
  const hash = crypto.createHash("sha1").update(reports.map((r) => `${r.id}:${r.bounty}`).sort().join(",")).digest("hex").slice(0, 8);
  const batch: PayoutBatch = {
    id, senderBatchId: `${db.ledgerId}-${id}-${hash}`, paypalBatchId: "", createdAt: new Date().toISOString(), status: "SENDING", trigger,
    items: reports.map((r) => ({ reportId: r.id, email: r.tester.email, amount: r.bounty, status: "SENDING" })),
  };
  db.batches.push(batch);
  for (const r of reports) {
    r.status = "paid";
    r.payoutItem = `${r.id}-item`;
  }
  save(db);
  try {
    await send(db, batch);
  } catch (e) {
    if (e instanceof PayPalError && e.refused) {
      refused(db, batch);
      save(db);
      throw new Error(`PayPal refused batch ${id}, nothing was sent: ${e.message.slice(0, 160)}`);
    }
    save(db);
    throw new Error(`PayPal didn't confirm batch ${id} (${(e as Error).message.slice(0, 100)}). It's marked Sending; use Check statuses on Payouts to retry it safely.`);
  }
  save(db);
  return batch;
}

export interface Filed { title: string; body: string; device: string; build?: string; tester: Tester }

export async function fileReport(f: Filed) {
  const snap = load(); // Claude reads a snapshot; the decision below uses a fresh copy taken after it answers
  const build = f.build || snap.campaign.build;
  const j = await judge(snap.campaign, snap.reports, { ...f, build });
  return locked(async (db) => {
    let d = decide(j, db.campaign.rules, autopaidToday(db), pool(db).left);
    if (d.decision === "auto_pay" && db.reports.length > snap.reports.length) {
      // Claude couldn't compare against reports filed while it was thinking; one of them may be the same bug
      d = { ...d, decision: "review", decisionReason: "Another report arrived while Claude was judging this one" };
    }
    const report: Report = {
      id: nextId(db.reports), title: j.title || f.title, body: f.body, build, device: f.device,
      tester: f.tester, createdAt: new Date().toISOString(), triage: { ...j, ...d }, status: "review", bounty: d.bounty,
    };
    db.reports.push(report);
    save(db);
    if (d.decision === "auto_pay") {
      try {
        await pay(db, [report], "autopilot");
      } catch (e) {
        Object.assign(report.triage, { decisionReason: (e as Error).message });
        save(db);
      }
    }
    return report;
  });
}

export function review(id: string, action: "approve" | "reject" | "reopen", bounty?: number) {
  return locked((db) => {
    const r = db.reports.find((x) => x.id === id);
    if (!r) throw new Error(`No report ${id}`);
    if (r.status === "paid") throw new Error(`${id} is already paid`);
    if (action === "approve") {
      if (bounty !== undefined) {
        if (!(bounty >= 0 && bounty <= 500)) throw new Error("Bounty must be between $0 and $500");
        r.bounty = cents(bounty);
      }
      if (r.bounty <= 0) throw new Error("Set a bounty above $0 to approve");
      const { left } = pool({ ...db, reports: db.reports.filter((x) => x.id !== id) });
      if (r.bounty > left) throw new Error(`Only $${left} left in the pool`);
      r.status = "approved";
    } else r.status = action === "reject" ? "rejected" : "review";
    save(db);
    return r;
  });
}

// The agent shares the daily cap with autopilot, checked inside the lock so back-to-back commands can't both pass it.
export function payApproved(by: "studio" | "agent" = "studio") {
  return locked(async (db) => {
    const due = db.reports.filter((r) => r.status === "approved");
    if (!due.length) throw new Error("Nothing approved to pay");
    const total = cents(due.reduce((s, r) => s + r.bounty, 0));
    if (by === "agent") {
      const used = autopaidToday(db);
      const cap = db.campaign.rules.dailyCap;
      if (cents(used + total) > cap) throw new Error(`$${total} would pass the $${cap} daily cap ($${used} already sent today by autopilot and the agent); the studio can press Pay instead`);
    }
    return pay(db, due, by);
  });
}

export function refreshPayouts() {
  return locked(async (db) => {
    const errors: string[] = [];
    for (const b of db.batches.filter((x) => x.status === "SENDING")) {
      try {
        await send(db, b); // same sender id as the first try
      } catch (e) {
        // Never put bugs back in the queue from here: the first send may have gone through, and a 4xx now
        // (duplicate id, funds spent by that first send) doesn't prove otherwise. A person checks in PayPal.
        errors.push(`${b.id}: still not confirmed. Look up sender_batch_id ${b.senderBatchId} in the PayPal dashboard before paying these bugs again (${(e as Error).message.slice(0, 100)})`);
      }
    }
    save(db);
    const open = db.batches.filter((b) => b.paypalBatchId && (!FINAL.has(b.status) || b.items.some((i) => !FINAL.has(i.status))));
    for (const b of open) {
      let s;
      try {
        s = await payoutStatus(b.paypalBatchId);
      } catch (e) {
        errors.push(`${b.id}: ${(e as Error).message.slice(0, 120)}`);
        continue;
      }
      if (!s) continue;
      b.status = s.status;
      for (const i of b.items) {
        const was = i.status;
        const m = s.items.find((x) => x.senderItemId === `${i.reportId}-item`);
        if (m) Object.assign(i, { status: m.status, paypalItemId: m.paypalItemId });
        else if (s.status === "DENIED") i.status = "DENIED";
        const r = db.reports.find((x) => x.id === i.reportId);
        if (r && r.status === "paid" && FAILED.has(i.status) && !FAILED.has(was)) {
          r.status = "approved"; // PayPal didn't deliver it: back in the queue, counted as owed
          r.payoutItem = undefined;
        }
      }
    }
    save(db);
    return { batches: db.batches, errors };
  });
}

export async function startFunding(amount: number) {
  if (!(amount >= 1 && amount <= 5000)) throw new Error("Fund between $1 and $5,000");
  const db = load();
  return createOrder(amount, `${db.campaign.studio}: ${db.campaign.game} playtest bounty pool`);
}

export async function finishFunding(orderId: string, mockAmount: number) {
  if (!/^[A-Z0-9]{8,40}$/.test(orderId)) throw new Error("That isn't a PayPal order id");
  return locked(async (db) => {
    if (db.funding.some((f) => f.orderId === orderId)) throw new Error("Order already captured");
    const c = await captureOrder(orderId, mockAmount);
    db.funding.push({ orderId, captureId: c.captureId, amount: c.amount, capturedAt: new Date().toISOString() });
    save(db);
    return pool(db);
  });
}

const money = (v: unknown) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Math.max(0, cents(Number(v))));

// tightenOnly: for the agent, which reads tester-written text and so may only make autopilot stricter.
export function setRules(patch: Partial<Record<keyof Rules, unknown>>, tightenOnly = false) {
  return locked((db) => {
    const r = db.campaign.rules;
    const bug = money(patch.perBugCap);
    const day = money(patch.dailyCap);
    const conf = money(patch.minConfidence);
    if (tightenOnly) {
      if (patch.autopilot === true && !r.autopilot) throw new Error("only the studio can turn autopilot on");
      if (bug !== undefined && bug > r.perBugCap) throw new Error(`only the studio can raise the per-bug cap above $${r.perBugCap}`);
      if (day !== undefined && day > r.dailyCap) throw new Error(`only the studio can raise the daily cap above $${r.dailyCap}`);
      if (conf !== undefined && conf < r.minConfidence) throw new Error("only the studio can lower the confidence Claude needs");
    }
    if (typeof patch.autopilot === "boolean") r.autopilot = patch.autopilot;
    if (bug !== undefined) r.perBugCap = bug;
    if (day !== undefined) r.dailyCap = day;
    if (conf !== undefined) r.minConfidence = Math.min(1, conf);
    save(db);
    return r;
  });
}
