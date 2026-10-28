// What the API routes do: file a report (triage + autopilot), decide on one, pay the approved ones, fund the pool.
import { autopaidToday, cents, decide, nextId, pool } from "./policy.ts";
import { captureOrder, createOrder, payoutStatus, sendPayouts } from "./paypal.ts";
import { load, save } from "./store.ts";
import { judge } from "./triage.ts";
import type { Db, PayoutBatch, Report, Tester } from "./types.ts";

const batchId = (db: Db) => `PB-${String(db.batches.length + 1).padStart(4, "0")}`;

async function pay(db: Db, reports: Report[], trigger: PayoutBatch["trigger"]): Promise<PayoutBatch> {
  const id = batchId(db);
  const lines = reports.map((r) => ({
    senderItemId: `${r.id}-item`,
    email: r.tester.email,
    amount: r.bounty,
    note: `${db.campaign.game} ${db.campaign.build}: ${r.id} ${r.title} (${r.triage.severity})`,
  }));
  const res = await sendPayouts(id, lines);
  const batch: PayoutBatch = {
    id, paypalBatchId: res.paypalBatchId, createdAt: new Date().toISOString(), status: res.status, trigger,
    items: reports.map((r) => ({ reportId: r.id, email: r.tester.email, amount: r.bounty, status: res.status === "SUCCESS" ? "SUCCESS" : "PENDING" })),
  };
  db.batches.push(batch);
  for (const r of reports) {
    r.status = "paid";
    r.payoutItem = `${r.id}-item`;
  }
  return batch;
}

export interface Filed { title: string; body: string; device: string; build?: string; tester: Tester }

export async function fileReport(f: Filed) {
  const db = load();
  const j = await judge(db.campaign, db.reports, { ...f, build: f.build || db.campaign.build });
  const d = decide(j, db.campaign.rules, autopaidToday(db), pool(db).left);
  const report: Report = {
    id: nextId(db.reports), title: j.title || f.title, body: f.body, build: f.build || db.campaign.build, device: f.device,
    tester: f.tester, createdAt: new Date().toISOString(), triage: { ...j, ...d }, status: "review", bounty: d.bounty,
  };
  db.reports.push(report);
  if (d.decision === "auto_pay") {
    try {
      await pay(db, [report], "autopilot");
    } catch (e) {
      // keep the report; a person retries the payment from the queue
      Object.assign(report.triage, { decision: "review", decisionReason: `Autopilot payout failed: ${(e as Error).message.slice(0, 120)}` });
    }
  }
  save(db);
  return report;
}

export function review(id: string, action: "approve" | "reject" | "reopen", bounty?: number) {
  const db = load();
  const r = db.reports.find((x) => x.id === id);
  if (!r) throw new Error(`No report ${id}`);
  if (r.status === "paid") throw new Error(`${id} is already paid`);
  if (bounty !== undefined) {
    if (!(bounty >= 0 && bounty <= 500)) throw new Error("Bounty must be between $0 and $500");
    r.bounty = cents(bounty);
  }
  if (action === "approve") {
    if (r.bounty <= 0) throw new Error("Set a bounty above $0 to approve");
    const { left } = pool(db);
    const already = r.status === "approved" ? r.bounty : 0;
    if (r.bounty - already > left) throw new Error(`Only $${left} left in the pool`);
    r.status = "approved";
  } else r.status = action === "reject" ? "rejected" : "review";
  save(db);
  return r;
}

export async function payApproved() {
  const db = load();
  const due = db.reports.filter((r) => r.status === "approved");
  if (!due.length) throw new Error("Nothing approved to pay");
  const batch = await pay(db, due, "studio");
  save(db);
  return batch;
}

export async function refreshPayouts() {
  const db = load();
  for (const b of db.batches.filter((x) => !["SUCCESS", "DENIED"].includes(x.status))) {
    const s = await payoutStatus(b.paypalBatchId);
    if (!s) continue;
    b.status = s.status;
    for (const i of b.items) {
      const m = s.items.find((x) => x.senderItemId === `${i.reportId}-item`);
      if (m) Object.assign(i, { status: m.status, paypalItemId: m.paypalItemId });
    }
  }
  save(db);
  return db.batches;
}

export async function startFunding(amount: number) {
  if (!(amount >= 1 && amount <= 5000)) throw new Error("Fund between $1 and $5,000");
  const db = load();
  return createOrder(amount, `${db.campaign.studio}: ${db.campaign.game} playtest bounty pool`);
}

export async function finishFunding(orderId: string, mockAmount: number) {
  const db = load();
  if (db.funding.some((f) => f.orderId === orderId)) throw new Error("Order already captured");
  const c = await captureOrder(orderId, mockAmount);
  db.funding.push({ orderId, captureId: c.captureId, amount: c.amount, capturedAt: new Date().toISOString() });
  save(db);
  return pool(db);
}

export function setRules(patch: Partial<Db["campaign"]["rules"]>) {
  const db = load();
  const r = db.campaign.rules;
  if (patch.autopilot !== undefined) r.autopilot = !!patch.autopilot;
  if (patch.perBugCap !== undefined) r.perBugCap = Math.max(0, cents(Number(patch.perBugCap)));
  if (patch.dailyCap !== undefined) r.dailyCap = Math.max(0, cents(Number(patch.dailyCap)));
  if (patch.minConfidence !== undefined) r.minConfidence = Math.min(1, Math.max(0, Number(patch.minConfidence)));
  save(db);
  return r;
}
