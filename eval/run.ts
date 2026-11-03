// Triage eval: runs every labelled report in eval/reports.json through the same steps as a filed report
// (judge, then decide with the demo's rules, then the instructsAi hold) and scores the calls.
// With ANTHROPIC_API_KEY set this calls Claude (about 50 calls); without it, the keyword rules.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { judge, type Judgement } from "../lib/triage.ts";
import { decide, instructsAi } from "../lib/policy.ts";
import { seed } from "../lib/seed.ts";
import type { Severity, Verdict } from "../lib/types.ts";

export interface Labelled {
  id: string; kind: string; title: string; body: string; device: string;
  verdict: Verdict | Verdict[]; severity?: Severity; duplicateOf?: string; payable: boolean;
}
export interface Call { r: Labelled; j: Judgement; autopay: boolean; bounty?: number }

export const data = JSON.parse(readFileSync(new URL("./reports.json", import.meta.url), "utf8")) as { synthetic: boolean; reports: Labelled[] };

const accepts = (r: Labelled, v: Verdict) => ([] as Verdict[]).concat(r.verdict).includes(v);

export function score(calls: Call[]) {
  const n = (f: (c: Call) => boolean) => calls.filter(f).length;
  const valid = calls.filter((c) => c.r.severity && c.j.verdict === "valid");
  const dups = calls.filter((c) => c.r.duplicateOf);
  return {
    reports: calls.length,
    verdictRight: `${n((c) => accepts(c.r, c.j.verdict))}/${calls.length}`,
    severityRight: `${valid.filter((c) => c.j.severity === c.r.severity).length}/${valid.length}`,
    duplicatesCaught: `${dups.filter((c) => c.j.verdict === "duplicate" && c.j.duplicateOf === c.r.duplicateOf).length}/${dups.length}`,
    // money going where it shouldn't, and real bugs it would leave unpaid
    wrongAutopays: n((c) => c.autopay && !c.r.payable),
    dollarsWronglyAutopaid: calls.filter((c) => c.autopay && !c.r.payable).reduce((s, c) => s + (c.bounty ?? 0), 0),
    realBugsAutopaid: `${n((c) => c.autopay && c.r.payable)}/${n((c) => c.r.payable)}`,
    copiesFlagged: `${n((c) => c.r.kind === "duplicate" && c.j.verdict === "duplicate")}/${n((c) => c.r.kind === "duplicate")}`,
    slopAndVagueFlagged: `${n((c) => ["slop", "vague"].includes(c.r.kind) && c.j.verdict !== "valid")}/${n((c) => ["slop", "vague"].includes(c.r.kind))}`,
    calledValidButNotPayable: n((c) => c.j.verdict === "valid" && !c.r.payable && !accepts(c.r, "valid")),
    realBugsMissed: n((c) => c.r.payable && c.j.verdict !== "valid"),
    injectionsHeld: `${n((c) => c.r.kind === "injection" && !c.autopay)}/${n((c) => c.r.kind === "injection")}`,
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
      calls.push({ r, j, bounty: d.bounty, autopay: d.decision === "auto_pay" && !instructsAi(`${r.title}\n${r.body}`) });
    }
  }));
  calls.sort((a, b) => a.r.id.localeCompare(b.r.id));
  const by = [...new Set(calls.map((c) => c.j.by))].join(", ");
  const head = `${data.synthetic ? "SYNTHETIC set" : "Real set"}, ${calls.length} reports, judged by ${by}, ${((Date.now() - t0) / 1000).toFixed(0)} s, ${new Date().toISOString().slice(0, 10)}`;
  const s = score(calls);
  console.log(head);
  console.table(s);
  const misses: string[] = [];
  for (const c of calls) {
    const ok = accepts(c.r, c.j.verdict) && (!c.r.severity || c.j.verdict !== "valid" || c.j.severity === c.r.severity)
      && (!c.r.duplicateOf || c.j.duplicateOf === c.r.duplicateOf) && !(c.autopay && !c.r.payable);
    if (!ok) misses.push(`miss ${c.r.id} ${c.r.kind}: expected ${[c.r.verdict].flat().join("/")} ${c.r.severity ?? c.r.duplicateOf ?? ""}, got ${c.j.verdict} ${c.j.severity ?? c.j.duplicateOf ?? ""} (${Math.round(c.j.confidence * 100)}%${c.autopay ? ", autopaid" : ""})`);
  }
  for (const m of misses) console.log(m);
  // one file per judge, so the keyword baseline and the Claude run sit side by side in docs/
  const file = `docs/eval-${by.startsWith("rules") ? "rules" : "claude"}.md`;
  mkdirSync("docs", { recursive: true });
  writeFileSync(file, [`# Triage eval: ${by.startsWith("rules") ? "keyword rules (no Claude key)" : "Claude"}`, ``,
    `${head}. Made by \`npm run eval\` from eval/reports.json${data.synthetic ? ", which is **synthetic**: written for this eval, not filed by real testers" : ""}.`, ``,
    `| metric | result |`, `|---|---|`, ...Object.entries(s).map(([k, v]) => `| ${k} | ${v} |`), ``,
    misses.length ? `## Misses (${misses.length})\n\n${misses.map((m) => `- ${m.slice(5)}`).join("\n")}` : "No misses.", ``].join("\n"));
  console.log(`Wrote ${file}`);
}

if (import.meta.main) await main();
