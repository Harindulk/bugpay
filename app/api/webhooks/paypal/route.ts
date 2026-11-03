// PayPal pushes payout status changes here (register https://<host>/api/webhooks/paypal in the sandbox app,
// put its id in PAYPAL_WEBHOOK_ID). Every event is checked with PayPal before it touches the ledger.
import { applyWebhook, type PayoutEvent } from "../../../../lib/actions.ts";
import { verifyWebhook, webhooks } from "../../../../lib/paypal.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!webhooks()) return Response.json({ error: "Webhooks are off (no PAYPAL_WEBHOOK_ID)" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 100_000) return Response.json({ error: "Too large" }, { status: 413 });
  let event: PayoutEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Not JSON" }, { status: 400 });
  }
  if (!(await verifyWebhook(req.headers, raw).catch(() => false))) return Response.json({ error: "Signature check failed" }, { status: 401 });
  // 200 even for events we skip, so PayPal doesn't retry them for days
  return Response.json(await applyWebhook(event));
}
