import { setRules } from "../../../lib/actions.ts";
import { handle } from "../../../lib/http.ts";

export async function POST(req: Request) {
  return handle(async () => setRules(await req.json()));
}
