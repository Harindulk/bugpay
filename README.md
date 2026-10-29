# Bugpay

Pay your playtesters per bug. Claude reads every report, PayPal pays the ones you accept.

Small game studios run playtests with testers in many countries. Paying per bug is fair and keeps testers looking, but in practice it means reading every report, spotting duplicates, guessing severity and then sending dozens of small cross-border payments by hand. Most small studios end up paying a flat fee, or nothing.

Bugpay does the reading and the paying:

1. The studio funds a bounty pool with **PayPal Checkout**.
2. Testers file bugs on a public form with their PayPal email.
3. **Claude** checks each report against the playtest brief, the known issues and every earlier report. It decides whether the bug is valid, a duplicate (and of which bug), not a bug, or missing information. It grades severity S1 to S4, writes clean repro steps and explains its call in a sentence a tester would accept.
4. The studio's price table sets the bounty. Claude never picks the amount.
5. **Autopilot** pays a valid bug on the spot through **PayPal Payouts** when Claude is sure enough and the bounty fits under a per-bug cap and a daily cap. Everything else waits in the triage queue.
6. The studio approves or edits the rest in the queue and sends them as one Payouts batch. The ledger tracks every payout's PayPal status, plus the pool against what was funded.
7. Or the studio tells the **agent**: "approve Lena's handbrake bug at $20, close the feature request and pay everything approved". Claude reads the queue and uses the same approve, close and pay actions as the buttons.

## PayPal APIs used

| Where | API |
|---|---|
| Funding the pool | Orders v2 (`POST /v2/checkout/orders`, `POST /v2/checkout/orders/{id}/capture`) with the PayPal JavaScript SDK buttons |
| Paying testers | Payouts v1 (`POST /v1/payments/payouts`), one item per bug, `sender_item_id` = the bug id |
| Payout status | `GET /v1/payments/payouts/{batch_id}` from the ledger's "Check statuses with PayPal" |
| Auth | OAuth 2.0 client credentials (`POST /v1/oauth2/token`) |

Two guards stop double payment: every capture and payout call sends a `PayPal-Request-Id`, and every batch gets a unique `sender_batch_id`, which PayPal refuses to reuse.

## How AI is used

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`) through the Anthropic TypeScript SDK, with structured outputs (a Zod schema via `betaZodOutputFormat`), so the verdict comes back as typed JSON. Server-side refusal fallback is on.
- **What it decides:** verdict, duplicate-of, severity, confidence, a clean title, repro steps and the reasoning shown to the studio and the tester.
- **What it does not decide:** the money. `lib/policy.ts` turns the judgement into a bounty from the price table and decides auto-pay or review, with unit tests for the caps.
- **The agent** (`lib/agent.ts`) runs Claude with the SDK's tool runner and six strict tools: list the queue, read the pool, approve, close, pay approved, change autopilot. Tester-written text reaches it, so its limits live in the tools, not the prompt: it can't set a bounty above twice the price table, and it can't send more than the daily cap in one command. Both limits are unit tested.
- **No key?** Triage falls back to keyword rules (`rules()` in `lib/triage.ts`). Rules are never sure enough to trigger autopilot.

## Run it

Needs Node 22 or newer.

```bash
npm install
npm run build && npm start
```

Open http://localhost:3000. With no keys it runs fully in **mock mode**: PayPal calls return mock ids and triage uses keyword rules, so you can click through every flow. Demo data (a playtest of StarFun Games' *Drive Away: Endless Road Trip*) is written to `data/db.json` on first load; delete that file to reset.

To run against the real PayPal sandbox and Claude:

1. At [developer.paypal.com](https://developer.paypal.com/dashboard/), open Apps & Credentials, switch to **Sandbox**, create an app and make sure **Payouts** is ticked under its features.
2. Copy `.env.example` to `.env.local` and fill in `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `ANTHROPIC_API_KEY`.
3. `npm run build && npm start`. "Add funds" now shows real PayPal buttons; log in with a sandbox personal account (Sandbox > Accounts) to pay. Payouts to tester emails that aren't sandbox accounts show as Unclaimed, which is PayPal's normal behaviour.

To host it for free, connect the repo to [Render](https://render.com) as a Blueprint (`render.yaml`) and add the three keys as environment variables. The JSON store is on the instance's disk, so the demo data resets when the service restarts.

Tests (bounty rules, pool arithmetic, fallback triage, the agent's limits):

```bash
npm test
```

## Layout

```
app/page.tsx          triage queue: pool, autopilot rules, AG Grid queue, report detail
app/ledger/page.tsx   payouts ledger and pool funding
app/submit/page.tsx   public tester form
app/api/*             state, reports, review, payouts, pool funding, rules, agent
lib/triage.ts         Claude triage and the keyword fallback
lib/agent.ts          Claude agent: tools and their money limits
lib/policy.ts         price table, caps, pool maths (no AI)
lib/paypal.ts         Orders, Payouts and OAuth, with mock mode
lib/store.ts          JSON file store (single studio)
```

Built with Next.js, AG Grid Community and the Anthropic SDK.

## Limits

- One studio and one playtest per install, stored in a JSON file.
- No login: the studio screens are open to anyone who can reach the server. Put it behind auth before using it with real money.
- Sandbox only. `lib/paypal.ts` hard-codes the sandbox host.

## Licence

MIT
