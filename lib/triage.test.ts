import { test } from "node:test";
import assert from "node:assert/strict";
import { rules } from "./triage.ts";
import { seed } from "./seed.ts";

const db = seed();
const file = (title: string, body: string) => rules(db.reports, { title, body, device: "Pixel 7", build: "1.4.0 beta" }, db.campaign);

test("rules catch a duplicate of an earlier valid report", () => {
  const j = file("Garage freeze", "Opened the garage during a near miss combo and the screen froze, had to kill the app.");
  assert.equal(j.verdict, "duplicate");
  assert.equal(j.duplicateOf, "BUG-0141");
});

test("rules grade a new crash S1 and never claim enough confidence for autopilot", () => {
  const j = file("Crash on the desert route", "The game crashed when the sandstorm started on the desert route, lost my run.");
  assert.equal(j.verdict, "valid");
  assert.equal(j.severity, "S1");
  assert.ok(j.confidence < db.campaign.rules.minConfidence);
});

test("feature requests and known issues are not bugs", () => {
  assert.equal(file("Night mode", "Would be nice to have a night driving mode.").verdict, "not_a_bug");
  assert.equal(file("No ad", "Rewarded ads show NO AD RIGHT NOW on a fresh install every time.").verdict, "not_a_bug");
});
