import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bugpay-"));
const { bugpayServer } = await import("./server.ts");
process.chdir(tmp); // the import moved to the repo; keep the test's ledger out of it

test("MCP: lists the six studio tools and keeps the agent's limits", async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await bugpayServer().connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["list_reports", "get_pool", "approve_report", "close_report", "pay_approved", "set_autopilot"]);

  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<{ content: { text: string }[]; isError?: boolean }>;
  const inj = await call("approve_report", { id: "BUG-0151", bounty: null }); // seeded prompt-injection report
  assert.equal(inj.isError, true);
  assert.match(inj.content[0].text, /instructions/);
  const loosen = await call("set_autopilot", { autopilot: null, perBugCap: 1000, dailyCap: null });
  assert.equal(loosen.isError, true);
  const listed = JSON.parse((await call("list_reports", { status: "approved" })).content[0].text);
  assert.ok(listed.length >= 1);
  assert.equal((await call("approve_report", { id: 5 })).isError, true); // bad input never reaches the store
  await client.close();
});
