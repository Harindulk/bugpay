// Bugpay's six studio tools as an MCP server (stdio), so Claude Desktop, Claude Code or any MCP client can run
// the triage queue and pay testers. PayPal's Agent Toolkit has no payouts tools; these do, with the same caps as
// the in-app agent: the daily cap, tighten-only rules, no approving severity-less or instruction-carrying reports.
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { agentTools, SYSTEM, type AgentAction } from "../lib/agent.ts";

process.chdir(fileURLToPath(new URL("..", import.meta.url))); // the ledger lives in <repo>/data whatever the client's cwd

export function bugpayServer() {
  const actions: AgentAction[] = [];
  // all six are betaZodTool custom tools; the SDK's union type also covers built-ins without these fields
  const tools = agentTools(actions) as unknown as { name: string; description: string; input_schema: { type: "object" }; parse: (a: unknown) => unknown; run: (i: never) => unknown }[];
  const server = new Server({ name: "bugpay", version: "0.1.0" }, { capabilities: { tools: {} }, instructions: SYSTEM });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const t = tools.find((x) => x.name === params.name);
    if (!t) return { content: [{ type: "text", text: `No tool ${params.name}` }], isError: true };
    let input;
    try {
      input = t.parse(params.arguments ?? {});
    } catch (e) {
      return { content: [{ type: "text", text: `Bad input: ${(e as Error).message}` }], isError: true };
    }
    const text = String(await t.run(input as never)); // run() turns refusals into "Refused: ..." text
    return { content: [{ type: "text", text }], isError: text.startsWith("Refused:") };
  });
  return server;
}

if (import.meta.main) await bugpayServer().connect(new StdioServerTransport());
