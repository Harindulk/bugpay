import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, nextId, pool } from "./policy.ts";
import { seed } from "./seed.ts";

const rules = seed().campaign.rules;
const j = { verdict: "valid" as const, severity: "S3" as const, duplicateOf: null, confidence: 0.9, title: "t", repro: [], reasoning: "", by: "rules" };

test("autopilot pays a confident small bug", () => {
  assert.equal(decide(j, rules, 0, 100).decision, "auto_pay");
});

test("caps and doubt send it to review", () => {
  assert.equal(decide({ ...j, severity: "S1" }, rules, 0, 100).decision, "review"); // over per-bug cap
  assert.equal(decide(j, rules, rules.dailyCap, 100).decision, "review"); // daily cap used
  assert.equal(decide({ ...j, confidence: 0.5 }, rules, 0, 100).decision, "review");
  assert.equal(decide(j, rules, 0, 1).decision, "review"); // pool empty
  assert.equal(decide(j, { ...rules, autopilot: false }, 0, 100).decision, "review");
});

test("duplicates are never paid by the rules", () => {
  const d = decide({ ...j, verdict: "duplicate", duplicateOf: "BUG-0141" }, rules, 0, 100);
  assert.equal(d.bounty, 0);
  assert.equal(d.decision, "review");
});

test("seed pool adds up", () => {
  const db = seed();
  const p = pool(db);
  assert.equal(p.funded, 300);
  assert.equal(Math.round((p.paid + p.approved + p.left) * 100), 30000);
  const batchTotal = db.batches.flatMap((b) => b.items).reduce((s, i) => s + i.amount, 0);
  assert.equal(batchTotal, p.paid); // every paid report is in exactly one batch
  assert.equal(nextId(db.reports), "BUG-0" + (140 + db.reports.length + 1));
});
