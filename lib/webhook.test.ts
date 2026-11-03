import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "bugpay-")));
process.env.PAYPAL_CLIENT_ID = "id";
process.env.PAYPAL_CLIENT_SECRET = "secret";
process.env.PAYPAL_WEBHOOK_ID = "WH-1";
const verified: string[] = [];
let answer = "SUCCESS";
globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  if (url.endsWith("/v1/oauth2/token")) return json({ access_token: "tok", expires_in: 3600 });
  if (url.endsWith("/v1/payments/payouts")) return json({ batch_header: { payout_batch_id: "LIVEB", batch_status: "PENDING" } });
  if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
    verified.push(String(init.body));
    return json({ verification_status: answer });
  }
  throw new Error(`unexpected ${url}`);
}) as typeof fetch;

const { payApproved, review } = await import("./actions.ts");
const { load } = await import("./store.ts");
const { POST } = await import("../app/api/webhooks/paypal/route.ts");

const hook = (event: unknown) => POST(new Request("http://x/api/webhooks/paypal", {
  method: "POST", body: JSON.stringify(event),
  headers: { "paypal-transmission-id": "t1", "paypal-transmission-sig": "sig", "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/c", "paypal-transmission-time": "now" },
}));
const item = (id: string, status: string) => ({
  event_type: `PAYMENT.PAYOUTS-ITEM.${status}`,
  resource: { payout_batch_id: "LIVEB", payout_item_id: `I-${id}`, transaction_status: status, payout_item: { sender_item_id: `${id}-item` } },
});

test("verified payout webhooks update the ledger; a failed item goes back to the queue and never reopens", async () => {
  const extra = load().reports.find((r) => r.status === "review" && r.bounty > 0 && !/instructions/.test(r.triage.decisionReason))!;
  await review(extra.id, "approve");
  const b = await payApproved();
  const [ok, bad] = b.items.map((i) => i.reportId);
  assert.ok(ok && bad, "seed has two approved reports");

  assert.deepEqual(await (await hook(item(ok, "SUCCESS"))).json(), { applied: true, batch: b.id });
  assert.match(verified[0], /"webhook_id":"WH-1","webhook_event":\{"event_type"/); // the event is sent back as it came
  await hook(item(bad, "FAILED"));
  await hook(item(bad, "SUCCESS")); // late or replayed event
  const db = load();
  const items = db.batches.at(-1)!.items;
  assert.equal(items.find((i) => i.reportId === ok)!.status, "SUCCESS");
  assert.equal(items.find((i) => i.reportId === ok)!.paypalItemId, `I-${ok}`);
  assert.equal(items.find((i) => i.reportId === bad)!.status, "FAILED");
  assert.equal(db.reports.find((r) => r.id === bad)!.status, "approved");
});

test("a webhook PayPal won't vouch for changes nothing", async () => {
  answer = "FAILURE";
  const before = JSON.stringify(load().batches);
  const res = await hook(item("BUG-0142", "RETURNED"));
  assert.equal(res.status, 401);
  assert.equal(JSON.stringify(load().batches), before);
});
