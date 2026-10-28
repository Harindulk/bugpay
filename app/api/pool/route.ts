import { finishFunding, startFunding } from "../../../lib/actions.ts";
import { handle, str } from "../../../lib/http.ts";

// Two steps, matching PayPal Checkout: create the order, then capture it after the buyer approves.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await req.json();
    if (b.step === "order") return { id: await startFunding(Number(b.amount)) };
    if (b.step === "capture") return finishFunding(str(b.orderId, "orderId", 64), Number(b.amount) || 0);
    throw new Error("Unknown step");
  });
}
