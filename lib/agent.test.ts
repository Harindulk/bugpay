import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The store writes data/db.json under cwd: run in a temp dir so the repo's data is untouched.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "bugpay-")));
const { agentTools } = await import("./agent.ts");
const { review } = await import("./actions.ts");
const { load } = await import("./store.ts");

const call = async (tools: ReturnType<typeof agentTools>, name: string, input: unknown) =>
  (tools.find((t) => t.name === name) as unknown as { run: (i: unknown) => Promise<string> }).run(input);

test("agent cannot set a bounty above twice the price table", async () => {
  const actions: never[] = [];
  const tools = agentTools(actions);
  const out = await call(tools, "approve_report", { id: "BUG-0148", bounty: 500 });
  assert.match(out, /^Refused/);
  assert.equal(load().reports.find((r) => r.id === "BUG-0148")!.status, "review");
});

test("agent refuses to approve a report with no severity", async () => {
  assert.match(await call(agentTools([]), "approve_report", { id: "BUG-0149", bounty: 3 }), /^Refused: BUG-0149 has no severity/);
  assert.equal(load().reports.find((r) => r.id === "BUG-0149")!.status, "review");
});

test("what the agent pays counts against the daily cap it shares with autopilot, across commands", async () => {
  const tools = agentTools([]);
  assert.doesNotMatch(await call(tools, "approve_report", { id: "BUG-0148", bounty: 20 }), /^Refused/);
  const paid = JSON.parse(await call(tools, "pay_approved", {})); // BUG-0146 $20 + BUG-0148 $20, plus autopilot's $8 today = $48 of $50
  assert.equal(paid.items.length, 2);
  assert.equal(load().reports.filter((r) => r.status === "paid").length, 7);
  assert.equal(load().batches.at(-1)!.trigger, "agent");
  // a new command gets no fresh allowance: $15 more would pass the $50 cap for the day
  await review("BUG-0147", "approve", 15);
  assert.match(await call(agentTools([]), "pay_approved", {}), /^Refused: \$15 would pass the \$50 daily cap/);
  assert.equal(load().reports.find((r) => r.id === "BUG-0147")!.status, "approved");
  assert.match(await call(agentTools([]), "get_pool", {}), /"agentMaySendToday":[0-9.]+/);
});

test("agent cannot pay a report twice", async () => {
  assert.match(await call(agentTools([]), "approve_report", { id: "BUG-0141", bounty: null }), /already paid/);
});
