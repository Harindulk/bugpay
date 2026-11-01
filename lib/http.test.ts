import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "bugpay-")));
const { handle, studio } = await import("./http.ts");
const { resetDemo, review } = await import("./actions.ts");
const { load, save } = await import("./store.ts");

const req = (pass?: string, ip = "1.2.3.4") =>
  new Request("http://x/api/payouts", { headers: { "cf-connecting-ip": ip, ...(pass === undefined ? {} : { "x-studio-passcode": pass }) } });

test("with no passcode set, studio routes are open", () => {
  delete process.env.STUDIO_PASSCODE;
  assert.doesNotThrow(() => studio(req()));
});

test("with a passcode set, money routes need it, and guessing is cut off", async () => {
  process.env.STUDIO_PASSCODE = "pit-lane-42";
  try {
    assert.doesNotThrow(() => studio(req("pit-lane-42")));
    const res = await handle(() => studio(req("wrong")));
    assert.equal(res.status, 401);
    for (let i = 0; i < 9; i++) assert.throws(() => studio(req(`guess${i}`)), /passcode/);
    assert.throws(() => studio(req("pit-lane-42")), /Too many/); // even the right one, from that address
    assert.doesNotThrow(() => studio(req("pit-lane-42", "5.6.7.8")));
  } finally {
    delete process.env.STUDIO_PASSCODE;
  }
});

test("reset puts the seeded playtest back, but never while a batch is unconfirmed", async () => {
  await review("BUG-0148", "approve", 20);
  const db = load();
  const ledger = db.ledgerId;
  db.batches.push({ id: "PB-0099", senderBatchId: "x", paypalBatchId: "", createdAt: new Date().toISOString(), status: "SENDING", trigger: "studio", items: [] });
  save(db);
  await assert.rejects(() => resetDemo(), /PB-0099 isn't confirmed/);
  db.batches.pop();
  save(db);
  await resetDemo();
  const fresh = load();
  assert.equal(fresh.reports.find((r) => r.id === "BUG-0148")!.status, "review");
  assert.notEqual(fresh.ledgerId, ledger); // new PayPal batch ids after a reset
});
