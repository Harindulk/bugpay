import { payApproved, refreshPayouts } from "../../../lib/actions.ts";
import { handle, studio } from "../../../lib/http.ts";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => handle(() => { studio(req); return payApproved(); });
export const GET = (req: Request) => handle(() => { studio(req); return refreshPayouts(); });
