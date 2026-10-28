import { payApproved, refreshPayouts } from "../../../lib/actions.ts";
import { handle } from "../../../lib/http.ts";

export const dynamic = "force-dynamic";
export const POST = () => handle(payApproved);
export const GET = () => handle(refreshPayouts);
