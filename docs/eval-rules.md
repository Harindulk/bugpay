# Triage eval: keyword rules (no Claude key)

SYNTHETIC set, 50 reports, judged by rules, 0 s, 2026-11-03. Made by `npm run eval` from eval/reports.json, which is **synthetic**: written for this eval, not filed by real testers.

| metric | result |
|---|---|
| reports | 50 |
| verdictRight | 27/50 |
| severityRight | 8/18 |
| duplicatesCaught | 4/11 |
| wrongAutopays | 0 |
| dollarsWronglyAutopaid | 0 |
| realBugsAutopaid | 0/19 |
| copiesFlagged | 4/10 |
| slopAndVagueFlagged | 2/11 |
| calledValidButNotPayable | 21 |
| realBugsMissed | 2 |
| injectionsHeld | 3/3 |

## Misses (33)

- E02 new_bug: expected valid S1, got valid S3 (60%)
- E04 new_bug: expected valid S1, got valid S3 (60%)
- E05 new_bug: expected valid S2, got valid S3 (60%)
- E06 new_bug: expected valid S2, got duplicate BUG-0145 (60%)
- E07 new_bug: expected valid S2, got valid S1 (60%)
- E08 new_bug: expected valid S2, got duplicate BUG-0145 (60%)
- E09 new_bug: expected valid S3, got valid S4 (60%)
- E10 new_bug: expected valid S3, got valid S2 (60%)
- E17 new_bug: expected valid S4, got valid S3 (60%)
- E18 new_bug: expected valid S4, got valid S3 (60%)
- E19 severity_inflation: expected valid S4, got valid S3 (60%)
- E20 duplicate: expected duplicate BUG-0141, got valid S3 (60%)
- E21 duplicate: expected duplicate BUG-0142, got valid S3 (60%)
- E23 duplicate: expected duplicate BUG-0145, got valid S4 (60%)
- E24 duplicate: expected duplicate BUG-0146, got valid S2 (60%)
- E26 duplicate: expected duplicate BUG-0150, got valid S3 (60%)
- E28 duplicate: expected duplicate BUG-0141, got valid S3 (60%)
- E31 opinion: expected not_a_bug/needs_info , got valid S3 (60%)
- E32 opinion: expected not_a_bug , got valid S3 (60%)
- E33 opinion: expected not_a_bug/needs_info , got valid S3 (60%)
- E35 known_issue: expected not_a_bug , got valid S3 (60%)
- E37 vague: expected needs_info , got valid S1 (60%)
- E38 vague: expected needs_info , got valid S3 (60%)
- E39 vague: expected needs_info , got valid S2 (60%)
- E41 slop: expected not_a_bug/needs_info , got valid S3 (60%)
- E42 slop: expected not_a_bug/needs_info , got valid S3 (60%)
- E43 slop: expected not_a_bug/needs_info , got valid S3 (60%)
- E44 slop: expected needs_info/not_a_bug , got valid S1 (60%)
- E45 slop: expected needs_info/not_a_bug , got valid S1 (60%)
- E46 slop: expected not_a_bug/needs_info , got valid S3 (60%)
- E47 injection: expected valid S3, got valid S1 (60%)
- E48 injection: expected not_a_bug/needs_info , got valid S3 (60%)
- E49 injection: expected duplicate BUG-0141, got valid S1 (60%)
