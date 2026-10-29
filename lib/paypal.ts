// PayPal REST (sandbox only): Orders v2 to fund the pool, Payouts v1 to pay testers.
// With no PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET it runs in mock mode and returns MOCK ids.
const BASE = "https://api-m.sandbox.paypal.com";

export const mock = () => !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET;
const money = (n: number) => n.toFixed(2);
const mockId = (p: string) => `MOCK${p}${Date.now().toString(36).toUpperCase()}`;

// A PayPal answer with an HTTP status. 4xx (bar 408/409/429) means PayPal looked at the request and said no.
export class PayPalError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
  get refused() { return this.status >= 400 && this.status < 500 && ![408, 409, 429].includes(this.status); }
}

let token: { value: string; until: number } | null = null;

async function auth(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed: ${res.status} ${await res.text()}`, 0); // bad keys: fix them and retry, the batch isn't refused
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
  return token.value;
}

async function call<T>(method: string, url: string, body?: unknown, idem?: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${await auth()}`,
      "Content-Type": "application/json",
      ...(idem ? { "PayPal-Request-Id": idem } : {}), // retries never double-pay
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000), // calls run inside the store lock; never hold it for minutes
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError(`PayPal ${method} ${url} failed: ${res.status} ${text.slice(0, 300)}`, res.status);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createOrder(amount: number, description: string): Promise<string> {
  if (mock()) return mockId("ORDER");
  const o = await call<{ id: string }>("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ amount: { currency_code: "USD", value: money(amount) }, description }],
  });
  return o.id;
}

export async function captureOrder(orderId: string, mockAmount = 0): Promise<{ captureId: string; amount: number }> {
  if (mock()) return { captureId: mockId("CAPTURE"), amount: mockAmount };
  const o = await call<{ purchase_units: { payments: { captures: { id: string; status: string; amount: { value: string } }[] } }[] }>(
    "POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`,
  );
  const c = o.purchase_units[0].payments.captures[0];
  if (c.status !== "COMPLETED") throw new Error(`Capture ${c.id} is ${c.status}`);
  return { captureId: c.id, amount: Number(c.amount.value) };
}

export interface PayoutLine { senderItemId: string; email: string; amount: number; note: string }

export async function sendPayouts(senderBatchId: string, lines: PayoutLine[]): Promise<{ paypalBatchId: string; status: string }> {
  if (mock()) return { paypalBatchId: mockId("BATCH"), status: "SUCCESS" };
  const r = await call<{ batch_header: { payout_batch_id: string; batch_status: string } }>("POST", "/v1/payments/payouts", {
    sender_batch_header: {
      sender_batch_id: senderBatchId, // PayPal rejects a reused id, a second guard against paying twice
      email_subject: "You got a bug bounty",
      email_message: "Thanks for testing. Your bounty is attached.",
    },
    items: lines.map((l) => ({
      recipient_type: "EMAIL",
      receiver: l.email,
      amount: { value: money(l.amount), currency: "USD" },
      note: l.note,
      sender_item_id: l.senderItemId,
    })),
  }, senderBatchId);
  return { paypalBatchId: r.batch_header.payout_batch_id, status: r.batch_header.batch_status };
}

export async function payoutStatus(paypalBatchId: string) {
  if (mock() || paypalBatchId.startsWith("MOCK")) return null;
  const r = await call<{
    batch_header: { batch_status: string };
    items: { payout_item_id: string; transaction_status: string; payout_item: { sender_item_id: string } }[];
  }>("GET", `/v1/payments/payouts/${encodeURIComponent(paypalBatchId)}`);
  return {
    status: r.batch_header.batch_status,
    items: r.items.map((i) => ({ senderItemId: i.payout_item.sender_item_id, paypalItemId: i.payout_item_id, status: i.transaction_status })),
  };
}
