// Claude reads a new report against the campaign and every earlier report, and returns a structured judgement.
// The bounty and the pay/review decision are added afterwards by policy.ts.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Campaign, Report, Severity, Verdict } from "./types.ts";

export const MODEL = "claude-opus-5-5";

const Judgement = z.object({
  verdict: z.enum(["valid", "duplicate", "not_a_bug", "needs_info"]),
  severity: z.enum(["S1", "S2", "S3", "S4"]).nullable(),
  duplicateOf: z.string().nullable(),
  confidence: z.number(),
  title: z.string(),
  repro: z.array(z.string()),
  reasoning: z.string(),
});
export type Judgement = z.infer<typeof Judgement> & { by: string };

interface NewReport { title: string; body: string; device: string; build: string }

const SYSTEM = `You triage playtest bug reports for a small game studio that pays testers a bounty per accepted bug.
Be fair to testers and careful with the studio's money.

Verdicts:
- valid: a real defect in this build, described well enough to act on.
- duplicate: the same defect as an earlier report (same trigger and symptom, even if worded differently). Set duplicateOf to that report's id. The earliest report of a bug is the valid one.
- not_a_bug: a feature request, opinion, intended behaviour, or a listed known issue.
- needs_info: might be a bug but nobody could reproduce it from what was written.

Severity (only for valid):
- S1: crash, freeze, lost progress or purchases.
- S2: blocks or unfairly ends a run or a mission; wrong rewards.
- S3: visible glitch or wrong behaviour that does not block play (layout, audio, display).
- S4: cosmetic: typos, small text or colour issues.

confidence is how sure you are of the verdict and severity together, from 0 to 1.
title: a clear one-line title in plain words. repro: the shortest numbered steps a developer could follow, empty if unknown.
reasoning: one or two sentences a tester would accept as fair.`;

// What a new report is compared against: everything the studio paid or approved, then Claude's valid calls,
// newest first, capped so a flood of reports can't blow up every call.
function history(earlier: Report[], cap = 150): Report[] {
  const counts = (e: Report) => e.status === "paid" || e.status === "approved";
  const kept = [...earlier.filter(counts), ...earlier.filter((e) => !counts(e) && e.triage.verdict === "valid" && e.status !== "rejected").reverse()];
  return kept.slice(0, cap).sort((a, b) => a.id.localeCompare(b.id));
}

export async function judge(campaign: Campaign, earlier: Report[], r: NewReport): Promise<Judgement> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return rules(earlier, r, campaign);
  const context = [
    `Game: ${campaign.game}, build ${campaign.build}.`,
    `Playtest brief: ${campaign.brief}`,
    `Known issues (not bugs for bounty purposes):\n${campaign.knownIssues.map((k) => `- ${k}`).join("\n")}`,
    `Earlier reports that are bugs:\n${history(earlier).map((e) => `${e.id} [${e.triage.severity ?? "?"}] ${e.title}: ${e.body.slice(0, 300)}`).join("\n") || "(none)"}`,
  ].join("\n\n");
  try {
    const client = new Anthropic();
    const format = betaZodOutputFormat(Judgement);
    // The SDK moves `enum` into the description; put it back so the API constrains the values.
    const props = (format.schema as { properties: Record<string, { enum?: string[]; anyOf?: { enum?: string[] }[] }> }).properties;
    props.verdict.enum = [...Judgement.shape.verdict.options];
    props.severity.anyOf![0].enum = [...Judgement.shape.severity.unwrap().options];
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format },
      messages: [{
        role: "user",
        content: `${context}\n\nNew report\nTitle: ${r.title}\nDevice: ${r.device}\nBuild: ${r.build}\n\n${r.body}`,
      }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return { ...rules(earlier, r, campaign), reasoning: "Claude could not judge this one; rules made a first guess for the studio to check." };
    const j = res.parsed_output;
    const known = new Set(earlier.map((e) => e.id));
    const verdict = j.verdict === "valid" && !j.severity ? "needs_info" : j.verdict; // no severity means no price
    return {
      ...j,
      verdict,
      confidence: Math.min(1, Math.max(0, j.confidence)),
      severity: verdict === "valid" ? j.severity : null,
      duplicateOf: verdict === "duplicate" && j.duplicateOf && known.has(j.duplicateOf) ? j.duplicateOf : null,
      by: res.model,
    };
  } catch (e) {
    // AnthropicError covers API errors and structured outputs that fail to parse; either way the report is kept
    if (e instanceof Anthropic.AnthropicError) {
      console.error("Claude triage failed, using rules:", e.message);
      return { ...rules(earlier, r, campaign), reasoning: "Claude couldn't judge this one; rules made a first guess for the studio to check." };
    }
    throw e;
  }
}

// Keyword rules: used when no Anthropic key is set, so the demo runs with no accounts at all.
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

export function rules(earlier: Report[], r: NewReport, campaign?: Campaign): Judgement {
  const text = `${r.title} ${r.body}`.toLowerCase();
  const w = words(text);
  const dup = earlier
    .filter((e) => e.triage.verdict === "valid")
    .map((e) => {
      const o = words(`${e.title} ${e.body}`);
      return { id: e.id, score: [...w].filter((x) => o.has(x)).length / Math.max(1, Math.min(w.size, o.size)) };
    })
    .sort((a, b) => b.score - a.score)[0];
  const known = campaign?.knownIssues.some((k) => [...words(k)].filter((x) => w.has(x)).length >= 3);
  let verdict: Verdict = "valid";
  let severity: Severity | null = null;
  if (/would be nice|please add|feature|suggest/.test(text)) verdict = "not_a_bug";
  else if (known) verdict = "not_a_bug";
  else if (dup && dup.score >= 0.5) verdict = "duplicate";
  else if (r.body.trim().length < 25) verdict = "needs_info";
  else severity = /crash|freez|stopped responding|lost (my )?(run|progress|save)|purchase/.test(text) ? "S1"
    : /stuck|can't|cannot|fail|ends? the run|fell|falls through|wrong reward/.test(text) ? "S2"
    : /typo|spelling|misspel|colou?r|font/.test(text) ? "S4" : "S3";
  return {
    verdict,
    severity,
    duplicateOf: verdict === "duplicate" ? dup!.id : null,
    confidence: 0.6, // rules are never sure enough for autopilot
    title: r.title.trim(),
    repro: [],
    reasoning: verdict === "duplicate" ? `Looks like ${dup!.id}.` : known ? "Matches a known issue." : "Keyword rules (no Claude key set).",
    by: "rules",
  };
}
