import { NextResponse } from "next/server";
import { autopaidToday, pool } from "../../../lib/policy.ts";
import { mock } from "../../../lib/paypal.ts";
import { load } from "../../../lib/store.ts";

export const dynamic = "force-dynamic";

export function GET() {
  const db = load();
  return NextResponse.json({
    ...db,
    pool: pool(db),
    autopaidToday: autopaidToday(db),
    mode: { paypal: mock() ? "mock" : "sandbox", ai: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "claude" : "rules" },
    paypalClientId: mock() ? null : process.env.PAYPAL_CLIENT_ID,
  });
}
