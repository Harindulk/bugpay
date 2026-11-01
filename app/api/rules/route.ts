import { setRules } from "../../../lib/actions.ts";
import { handle, studio } from "../../../lib/http.ts";

export async function POST(req: Request) {
  return handle(async () => {
    studio(req);
    return setRules(await req.json());
  });
}
