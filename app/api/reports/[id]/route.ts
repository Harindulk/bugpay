import { review } from "../../../../lib/actions.ts";
import { handle } from "../../../../lib/http.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const b = await req.json();
    if (!["approve", "reject", "reopen"].includes(b.action)) throw new Error("Unknown action");
    return review(id, b.action, b.bounty === undefined || b.bounty === null || b.bounty === "" ? undefined : Number(b.bounty));
  });
}
