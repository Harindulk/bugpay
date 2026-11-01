import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "bugpay-")));
const { payApproved, refreshPayouts, review } = await import("./actions.ts");
const { agentTools } = await import("./agent.ts");
const { allow } = await import("./ratelimit.ts");
const { load } = await import("./store.ts");

const run = (tools: ReturnType<typeof agentTools>, name: string, input: unknown) =>
  (tools.find((t) => t.name === name) as unknown as { run: (i: unknown) => Promise<string> }).run(input);

test("the daily cap holds across agent pay calls queued back to back", async () => {
  const tools = agentTools([]); // daily cap $50, autopilot already sent $8 today
  await run(tools, "approve_report", { id: "BUG-0148", bounty: 22 }); // + BUG-0146 already approved at $20 = $42
  const [first, , second] = await Promise.all([
    run(tools, "pay_approved", {}),
    review("BUG-0147", "approve", 20),
    run(agentTools([]), "pay_approved", {}),
  ]);
  assert.doesNotMatch(first, /^Refused/);
  assert.match(second, /^Refused: \$20 would pass the \$50 daily cap/);
  assert.equal(load().reports.find((r) => r.id === "BUG-0147")!.status, "approved");
});

test("a payout PayPal never confirmed is retried with the same id, not paid again under a new one", async () => {
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  const posts: { body: string; requestId: string }[] = [];
  let fail = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (url.endsWith("/v1/oauth2/token")) return json({ access_token: "tok", expires_in: 3600 });
    if (url.endsWith("/v1/payments/payouts")) {
      posts.push({ body: init.body as string, requestId: (init.headers as Record<string, string>)["PayPal-Request-Id"] });
      if (fail) throw new TypeError("fetch failed"); // PayPal may or may not have received it
      return json({ batch_header: { payout_batch_id: "REALBATCH9", batch_status: "PENDING" } });
    }
    return json({ batch_header: { batch_status: "PENDING" }, items: [] });
  }) as typeof fetch;
  try {
    await assert.rejects(() => payApproved(), /didn't confirm/);
    let db = load();
    const b = db.batches.at(-1)!;
    assert.equal(b.status, "SENDING");
    assert.equal(db.reports.find((r) => r.id === "BUG-0147")!.status, "paid"); // not approved, so Pay can't send it twice
    await assert.rejects(() => review("BUG-0147", "approve", 20), /already paid/);

    fail = false;
    const { errors } = await refreshPayouts();
    assert.deepEqual(errors, []);
    db = load();
    assert.equal(db.batches.at(-1)!.paypalBatchId, "REALBATCH9");
    assert.equal(posts.length, 2);
    assert.equal(JSON.parse(posts[0].body).sender_batch_header.sender_batch_id, JSON.parse(posts[1].body).sender_batch_header.sender_batch_id);
    assert.equal(posts[0].requestId, posts[1].requestId);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  }
});

test("rate limit lets a burst through up to the cap, then refuses", () => {
  const ok = Array.from({ length: 4 }, () => allow([["t", 3]], 60_000));
  assert.deepEqual(ok, [true, true, true, false]);
});

test("a batch PayPal refuses outright goes back to the queue instead of sticking as Sending", async () => {
  await review("BUG-0149", "approve", 3);
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify({ name: "INSUFFICIENT_FUNDS" }), { status: 422 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => payApproved(), /refused/);
    const db = load();
    assert.equal(db.batches.at(-1)!.status, "DENIED");
    assert.equal(db.reports.find((r) => r.id === "BUG-0149")!.status, "approved"); // owed, and payable again
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  }
});

test("a 4xx on a retry never puts an unconfirmed batch's bugs back in the queue", async () => {
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  let call = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    call += 1;
    if (call === 1) throw new TypeError("fetch failed"); // first send: answer lost, PayPal may have paid
    return new Response(JSON.stringify({ name: "USER_BUSINESS_ERROR", message: "Batch with given sender_batch_id already exists" }), { status: 400 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => payApproved(), /didn't confirm/);
    const { errors } = await refreshPayouts();
    assert.match(errors[0], /still not confirmed/);
    const db = load();
    assert.equal(db.batches.at(-1)!.status, "SENDING");
    assert.equal(db.reports.find((r) => r.id === "BUG-0149")!.status, "paid"); // stays counted as paid until a person checks
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  }
});
