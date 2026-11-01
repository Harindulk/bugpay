import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "bugpay-")));
const { payApproved, refreshPayouts, returnUnclaimed, review } = await import("./actions.ts");
const { pool } = await import("./policy.ts");
const { load } = await import("./store.ts");

test("an unclaimed bounty can be taken back into the pool, once", async () => {
  const before = pool(load()).left;
  const r = await returnUnclaimed("BUG-0143"); // seeded: Lena's email has no PayPal account yet
  assert.equal(r.status, "review");
  assert.match(r.triage.decisionReason, /back in the pool/);
  const db = load();
  assert.equal(pool(db).left, before + 8);
  assert.equal(db.batches.flatMap((b) => b.items).find((i) => i.reportId === "BUG-0143")!.status, "RETURNED");
  await assert.rejects(() => returnUnclaimed("BUG-0143"), /no payout to return/);
  await assert.rejects(() => returnUnclaimed("BUG-0142"), /success, not unclaimed/);
});

test("sandbox: item states come from PayPal; returned goes to the pool, unclaimed can be cancelled", async () => {
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  const cancels: { url: string; requestId: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (url.endsWith("/v1/oauth2/token")) return json({ access_token: "tok", expires_in: 3600 });
    if (url.endsWith("/v1/payments/payouts")) return json({ batch_header: { payout_batch_id: "REALB", batch_status: "PENDING" } });
    if (url.includes("/v1/payments/payouts/REALB")) {
      return json({ batch_header: { batch_status: "SUCCESS" }, items: [
        { payout_item_id: "ITEM6", transaction_status: "RETURNED", payout_item: { sender_item_id: "BUG-0146-item" } },
        { payout_item_id: "ITEM8", transaction_status: "UNCLAIMED", payout_item: { sender_item_id: "BUG-0148-item" } },
      ] });
    }
    if (url.includes("/v1/payments/payouts-item/")) {
      cancels.push({ url, requestId: (init.headers as Record<string, string>)["PayPal-Request-Id"] });
      return json({ transaction_status: "RETURNED" });
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  try {
    await review("BUG-0148", "approve", 20); // BUG-0146 is already approved at $20
    await payApproved();
    await refreshPayouts();
    let db = load();
    assert.equal(db.reports.find((r) => r.id === "BUG-0146")!.status, "review"); // PayPal sent it back: in the pool, not owed
    assert.equal(db.reports.find((r) => r.id === "BUG-0148")!.status, "paid"); // unclaimed still counts as paid
    await returnUnclaimed("BUG-0148");
    assert.match(cancels[0].url, /\/v1\/payments\/payouts-item\/ITEM8\/cancel$/);
    assert.equal(cancels[0].requestId, "cancel-ITEM8");
    db = load();
    assert.equal(db.reports.find((r) => r.id === "BUG-0148")!.status, "review");
    await refreshPayouts(); // PayPal still reports the old states; nothing moves twice
    assert.equal(cancels.length, 1);
    db = load();
    assert.equal(db.reports.find((r) => r.id === "BUG-0148")!.status, "review");
    assert.equal(db.batches.flatMap((b) => b.items).find((i) => i.reportId === "BUG-0148")!.status, "RETURNED");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  }
});
