import { test } from "node:test";
import assert from "node:assert/strict";
import { data, score, type Call } from "./run.ts";
import { seed } from "../lib/seed.ts";

test("eval set is labelled synthetic, 40-60 reports, and every label points at something real", () => {
  assert.equal(data.synthetic, true);
  assert.ok(data.reports.length >= 40 && data.reports.length <= 60);
  const seeded = new Set(seed().reports.filter((r) => r.triage.verdict === "valid").map((r) => r.id));
  for (const r of data.reports) {
    const verdicts = [r.verdict].flat();
    assert.ok(verdicts.every((v) => ["valid", "duplicate", "not_a_bug", "needs_info"].includes(v)), r.id);
    if (r.severity) assert.ok(verdicts.includes("valid"), `${r.id} has a severity but isn't valid`);
    if (r.duplicateOf) assert.ok(seeded.has(r.duplicateOf), `${r.id} points at ${r.duplicateOf}, which triage never sees`);
    if (r.payable) assert.ok(r.severity && verdicts.length === 1, `${r.id} payable but not a clean valid bug`);
  }
  assert.equal(new Set(data.reports.map((r) => r.id)).size, data.reports.length);
});

test("score counts a wrong autopay and a caught duplicate", () => {
  const [bug, dup] = [data.reports.find((r) => r.payable)!, data.reports.find((r) => r.duplicateOf)!];
  const j = (verdict: Call["j"]["verdict"], duplicateOf: string | null = null) =>
    ({ verdict, severity: null, duplicateOf, confidence: 0.9, title: "", repro: [], reasoning: "", by: "test" });
  const s = score([
    { r: bug, j: j("needs_info"), autopay: false },
    { r: dup, j: j("duplicate", dup.duplicateOf), autopay: false },
    { r: { ...dup, id: "X" }, j: j("valid"), autopay: true },
  ]);
  assert.equal(s.duplicatesCaught, "1/2");
  assert.equal(s.wrongAutopays, 1);
  assert.equal(s.realBugsMissed, 1);
});
