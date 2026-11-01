import { runAgent } from "../../../lib/agent.ts";
import { handle, str, studio } from "../../../lib/http.ts";

export async function POST(req: Request) {
  return handle(async () => {
    studio(req);
    return runAgent(str((await req.json()).command, "Command", 500));
  });
}
