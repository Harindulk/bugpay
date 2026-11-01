# Bugpay

Pay playtesters for each bug they find without paying for junk. Claude reads every report, code sets the price, and PayPal Payouts sends the money.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Harindulk/bugpay)

![Mock mode, start to finish: a tester files a crash on the public form, triage grades it S1 and holds it for the studio, the studio approves and pays, and the payout shows up in the ledger](docs/mock-flow.gif)

Demo video (3 min): [coming before the Devpost close]

## Why per-bug pay needs triage

Paying for each accepted bug is how crowd QA already works: uTest and Test IO pay per approved bug and nothing for duplicates ([Test IO Academy](https://academy.test.io/en/articles/6184452-new-payout-system)). The catch is that cash per report draws junk, and AI has made junk cheap to write.

- HackerOne says "60-80% of vulnerability submissions are invalid" and sells AI triage to filter them ([HackerOne](https://www.hackerone.com/platform/triage)).
- curl ended its bug bounty at the end of January 2026 after a flood of AI-generated reports. Daniel Stenberg said the goal was to "remove the incentive for people to submit crap and non-well researched reports to us. AI generated or not." ([The Register, 21 Jan 2026](https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/))
- Reports on Bugcrowd more than quadrupled over three weeks in March 2026, most of them fake, according to the Financial Times as reported by [Decrypt](https://decrypt.co/368309/ai-slop-floods-bug-bounty-programs-fake-reports).
- For games, BetaHub already uses AI to merge duplicate reports and rank them, but its feature list says nothing about paying testers ([BetaHub](https://betahub.io/features/)). HackerOne does triage and pay, at enterprise prices.

So a small game studio that wants to pay testers per bug has to read every report, spot the duplicates, guess the severity and then send dozens of small cross-border payments by hand. Most end up paying a flat fee, which rewards whoever sends the most reports, or nothing at all.

Bugpay pays only for bugs that survive triage. A duplicate names the original, so only the first finder is paid. Vague or made-up reports wait for a person. A report that tries to give the AI orders is held. Autopilot pays only inside caps written in code, and PayPal Payouts reaches testers in 156+ countries with no fee on their side ([Payouts FAQ](https://developer.paypal.com/payouts/faqs)).

## How it works

```mermaid
flowchart LR
  S[Studio] -- PayPal Checkout --> P[(Bounty pool)]
  T[Tester] -- report + PayPal email --> C{Claude triage}
  C -- duplicate, not a bug, needs info --> Q[Triage queue]
  C -- valid, S1 to S4 --> R[Price table and caps<br/>lib/policy.ts]
  R -- sure enough, under both caps --> A[Autopilot]
  R -- otherwise --> Q
  Q -- studio or agent approves --> B[Payouts batch]
  A --> B
  P -.-> B
  B -- PayPal Payouts --> T
```

1. The studio funds a bounty pool with **PayPal Checkout**.
2. Testers file bugs on a public form with their PayPal email.
3. **Claude** checks each report against the playtest brief, the known issues and every earlier report. It decides whether the bug is valid, a duplicate (and of which bug), not a bug, or missing information. It grades severity S1 to S4, writes clean repro steps and explains its call in a sentence a tester would accept.
4. The studio's price table sets the bounty. Claude never picks the amount.
5. **Autopilot** pays a valid bug on the spot through **PayPal Payouts** when Claude is sure enough and the bounty fits under a per-bug cap and a daily cap. Everything else waits in the triage queue.
6. The studio approves or edits the rest in the queue and sends them as one Payouts batch. The ledger tracks every payout's PayPal status, plus the pool against what was funded. A failed payout goes back to the queue as owed; one PayPal returns, or one nobody claimed that the studio takes back, goes back into the pool.
7. Or the studio tells the **agent**: "approve Lena's handbrake bug at $20, close the feature request and pay everything approved". Claude reads the queue and uses the same approve, close and pay actions as the buttons.

## PayPal APIs used

| Where | API |
|---|---|
| Funding the pool | Orders v2 (`POST /v2/checkout/orders`, `POST /v2/checkout/orders/{id}/capture`) with the PayPal JavaScript SDK buttons |
| Paying testers | Payouts v1 (`POST /v1/payments/payouts`), one item per bug, `sender_item_id` = the bug id |
| Payout status | `GET /v1/payments/payouts/{batch_id}` from the ledger's "Check statuses with PayPal"; each bug shows its own item state (received, unclaimed, failed, returned) |
| Unclaimed bounties | `POST /v1/payments/payouts-item/{item_id}/cancel` takes back a payout nobody claimed, so the bounty goes back into the pool instead of waiting PayPal's 30 days |
| Auth | OAuth 2.0 client credentials (`POST /v1/oauth2/token`) |

Two guards stop double payment: every capture and payout call sends a `PayPal-Request-Id`, and every batch gets a unique `sender_batch_id`, which PayPal refuses to reuse.

## How AI is used

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`) through the Anthropic TypeScript SDK, with structured outputs (a Zod schema via `betaZodOutputFormat`), so the verdict comes back as typed JSON. Server-side refusal fallback is on.
- **What it decides:** verdict, duplicate-of, severity, confidence, a clean title, repro steps and the reasoning shown to the studio and the tester.
- **What it does not decide:** the money. `lib/policy.ts` turns the judgement into a bounty from the price table and decides auto-pay or review, with unit tests for the caps.
- **The agent** (`lib/agent.ts`) runs Claude with the SDK's tool runner and six strict tools: list the queue, read the pool, approve, close, pay approved, change autopilot. Tester-written text reaches it, so its limits live in the tools, not the prompt: it can't approve a report that has no severity, it can't set a bounty above twice the price table, and everything it pays counts against the same daily cap as autopilot, across commands. All three limits are unit tested.
- **Testers can try to give the AI orders.** The demo data has one (BUG-0151 asks for $500 and a bigger cap). A check in `lib/policy.ts` holds any report that talks to the AI for a person, the agent's approve tool refuses it even when the studio's command says to do what it asks, and the caps hold either way.
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

To host it for free, connect the repo to [Render](https://render.com) as a Blueprint (`render.yaml`) and add the three keys as environment variables, plus `STUDIO_PASSCODE`. With a passcode set, anyone can file bugs on the tester form, but paying, approving, funding, the autopilot rules, the agent and **Reset demo** ask for it, and an address that guesses wrong ten times is locked out for an hour. The JSON store is on the instance's disk, so the demo data also resets when the service restarts.

Tests (bounty rules, pool arithmetic, fallback triage, the agent's limits, the eval labels):

```bash
npm test
```

## Triage eval

`eval/reports.json` holds 50 labelled bug reports for the demo playtest. **They are synthetic**: they were written for this eval, because Drive Away has not had a human playtest yet, so there are no real tester reports to use. The mix: 19 new bugs (one shouting "CRITICAL" about a typo), 10 reworded duplicates of the seeded bugs, 7 feature requests, opinions and known issues, 5 vague reports, 6 AI-style reports about features the game doesn't have, and 3 that try to instruct the AI.

```bash
npm run eval
```

Each report goes through the same steps as a real one (triage, then the price table and caps, then the injection hold) against the seeded playtest. The script prints how many verdicts were right, severities right, duplicates caught with the right original, wrong autopays and real bugs missed, then lists every miss. With `ANTHROPIC_API_KEY` in `.env.local` it calls Claude about 50 times; without it, it scores the keyword rules.

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
eval/                 labelled synthetic reports and npm run eval
```

Built with Next.js, AG Grid Community and the Anthropic SDK.

## Limits

- One studio and one playtest per install, stored in a JSON file.
- No login: the studio screens are open to anyone who can reach the server. Put it behind auth before using it with real money.
- Sandbox only. `lib/paypal.ts` hard-codes the sandbox host.

## Licence

MIT, see [LICENSE](LICENSE).

GitHub topics: `paypal` `paypal-payouts` `claude` `anthropic` `ag-grid` `nextjs` `bug-bounty` `playtesting` `game-development` `ai-agents`
