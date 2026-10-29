import { runAgent } from "../../../lib/agent.ts";
import { handle, str } from "../../../lib/http.ts";

export async function POST(req: Request) {
  return handle(async () => runAgent(str((await req.json()).command, "Command", 500)));
}
