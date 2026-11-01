// Triage eval: runs every labelled report in eval/reports.json through the same steps as a filed report
// (judge, then decide with the demo's rules, then the instructsAi hold) and scores the calls.
// With ANTHROPIC_API_KEY set this calls Claude (about 50 calls); without it, the keyword rules.
import { readFileSync } from "node:fs";
import { judge, type Judgement } from "../lib/triage.ts";
import { decide, instructsAi } from "../lib/policy.ts";
import { seed } from "../lib/seed.ts";
import type { Severity, Verdict } from "../lib/types.ts";

export interface Labelled {
  id: string; kind: string; title: string; body: string; device: string;
  verdict: Verdict | Verdict[]; severity?: Severity; duplicateOf?: string; payable: boolean;
}
export interface Call { r: Labelled; j: Judgement; autopay: boolean }

export const data = JSON.parse(readFileSync(new URL("./reports.json", import.meta.url), "utf8")) as { synthetic: boolean; reports: Labelled[] };

const accepts = (r: Labelled, v: Verdict) => ([] as Verdict[]).concat(r.verdict).includes(v);

export function score(calls: Call[]) {
  const n = (f: (c: Call) => boolean) => calls.filter(f).length;
  const valid = calls.filter((c) => c.r.severity && c.j.verdict === "valid");
  const dups = calls.filter((c) => c.r.duplicateOf);
  return {
    reports: calls.length,
    verdictRight: n((c) => accepts(c.r, c.j.verdict)),
    severityRight: `${valid.filter((c) => c.j.severity === c.r.severity).length}/${valid.length}`,
    duplicatesCaught: `${dups.filter((c) => c.j.verdict === "duplicate" && c.j.duplicateOf === c.r.duplicateOf).length}/${dups.length}`,
    // money going where it shouldn't, and real bugs it would leave unpaid
    wrongAutopays: n((c) => c.autopay && !c.r.payable),
    calledValidButNotPayable: n((c) => c.j.verdict === "valid" && !c.r.payable && !accepts(c.r, "valid")),
    realBugsMissed: n((c) => c.r.payable && c.j.verdict !== "valid"),
  };
}

async function main() {
  const db = seed();
  const rules = db.campaign.rules;
  const todo = [...data.reports];
  const calls: Call[] = [];
  const t0 = Date.now();
  // 4 at a time; each report is judged on its own against the seeded playtest, like the first report after a reset
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let r; (r = todo.shift());) {
      const j = await judge(db.campaign, db.reports, { title: r.title, body: r.body, device: r.device, build: db.campaign.build });
      const d = decide(j, rules, 0, Infinity);
      calls.push({ r, j, autopay: d.decision === "auto_pay" && !instructsAi(`${r.title}\n${r.body}`) });
    }
  }));
  calls.sort((a, b) => a.r.id.localeCompare(b.r.id));
  const by = [...new Set(calls.map((c) => c.j.by))].join(", ");
  console.log(`${data.synthetic ? "SYNTHETIC set" : "Real set"}, ${calls.length} reports, judged by ${by}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.table(score(calls));
  for (const c of calls) {
    const ok = accepts(c.r, c.j.verdict) && (!c.r.severity || c.j.verdict !== "valid" || c.j.severity === c.r.severity)
      && (!c.r.duplicateOf || c.j.duplicateOf === c.r.duplicateOf) && !(c.autopay && !c.r.payable);
    if (!ok) console.log(`miss ${c.r.id} ${c.r.kind}: expected ${[c.r.verdict].flat().join("/")} ${c.r.severity ?? c.r.duplicateOf ?? ""}, got ${c.j.verdict} ${c.j.severity ?? c.j.duplicateOf ?? ""} (${Math.round(c.j.confidence * 100)}%${c.autopay ? ", autopaid" : ""})`);
  }
}

if (import.meta.main) await main();
