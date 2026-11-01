import { resetDemo } from "../../../lib/actions.ts";
import { handle, studio } from "../../../lib/http.ts";

export const POST = (req: Request) => handle(() => { studio(req); return resetDemo(); });
