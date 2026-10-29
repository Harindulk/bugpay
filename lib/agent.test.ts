import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The store writes data/db.json under cwd: run in a temp dir so the repo's data is untouched.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "bugpay-")));
const { agentTools } = await import("./agent.ts");
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

test("agent approves and pays inside the per-command limit, then is stopped", async () => {
  const tools = agentTools([]);
  assert.doesNotMatch(await call(tools, "approve_report", { id: "BUG-0148", bounty: 20 }), /^Refused/);
  const paid = JSON.parse(await call(tools, "pay_approved", {})); // BUG-0146 $20 + BUG-0148 $20 = $40 of $50
  assert.equal(paid.items.length, 2);
  assert.equal(load().reports.filter((r) => r.status === "paid").length, 7);
  // $40 sent; approving another $20 and paying would pass $50 in this command
  await call(tools, "approve_report", { id: "BUG-0147", bounty: 20 });
  assert.match(await call(tools, "pay_approved", {}), /^Refused: \$20 would pass/);
  assert.equal(load().reports.find((r) => r.id === "BUG-0147")!.status, "approved");
});

test("agent cannot pay a report twice", async () => {
  assert.match(await call(agentTools([]), "approve_report", { id: "BUG-0141", bounty: null }), /already paid/);
});
