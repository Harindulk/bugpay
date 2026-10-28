// Demo playtest for StarFun Games' Drive Away. Dates are relative to now so "today" always has activity.
import type { Db, Report, Severity, Tester, Verdict } from "./types.ts";

const T: Record<string, Tester> = {
  amaya: { name: "Amaya Perera", email: "amaya.perera@testers.starfungames.com", country: "LK" },
  diego: { name: "Diego Ramos", email: "diego.ramos@testers.starfungames.com", country: "MX" },
  lena: { name: "Lena Vogel", email: "lena.vogel@testers.starfungames.com", country: "DE" },
  kofi: { name: "Kofi Mensah", email: "kofi.mensah@testers.starfungames.com", country: "GH" },
  priya: { name: "Priya Nair", email: "priya.nair@testers.starfungames.com", country: "IN" },
};

export function seed(now = new Date()): Db {
  const at = (daysAgo: number, h: number, m: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString(); // today's items stay in the past

  const prices: Record<Severity, number> = { S1: 40, S2: 20, S3: 8, S4: 3 };

  const r = (
    n: number, who: string, when: string, title: string, body: string, device: string,
    verdict: Verdict, severity: Severity | null, confidence: number, status: Report["status"],
    decision: "auto_pay" | "review", decisionReason: string, reasoning: string, repro: string[], duplicateOf: string | null = null,
  ): Report => {
    const bounty = verdict === "valid" && severity ? prices[severity] : 0;
    return {
      id: `BUG-0${n}`, title, body, build: "1.4.0 beta", device, tester: T[who], createdAt: when, status, bounty,
      triage: { verdict, severity, duplicateOf, confidence, title, repro, reasoning, bounty, decision, decisionReason, by: "claude-opus-5-5" },
    };
  };

  const reports: Report[] = [
    r(141, "amaya", at(2, 10, 12), "Freeze when opening the garage during a near-miss combo",
      "I was on a 4x near miss combo and tapped Garage. Screen froze, music kept going, had to kill the app. Lost the run.",
      "Galaxy A14, Android 14", "valid", "S1", 0.94, "paid", "review", "$40 is over the $10 per-bug cap",
      "Hard freeze with a lost run on a common action. Reproducible from the steps.", ["Start a run", "Build a near-miss combo of 3x or more", "Tap Garage while the combo counter is showing"]),
    r(142, "diego", at(2, 14, 40), "Coin counter shows 1,2000 after a mission reward",
      "After finishing Drive 5 km the coin total read 1,2000 for a second then fixed itself.", "Pixel 7, Android 15",
      "valid", "S3", 0.92, "paid", "auto_pay", "Valid S3, 92% sure, inside both caps",
      "Visual glitch in number formatting, recovers by itself.", ["Finish any mission with a coin reward over 999", "Watch the coin counter on the title screen"]),
    r(143, "lena", at(1, 9, 5), "Landscape: garage arrows overlap the car",
      "In landscape the left and right arrows in the garage sit on top of the car body.", "iPad 10th gen",
      "valid", "S3", 0.9, "paid", "auto_pay", "Valid S3, 90% sure, inside both caps",
      "Layout bug in one orientation; nothing blocked.", ["Rotate to landscape", "Open Garage"]),
    r(144, "kofi", at(1, 11, 30), "App stops responding in garage",
      "Hit the garage button while doing near misses and the game stopped responding.", "Tecno Spark 20",
      "duplicate", null, 0.91, "rejected", "review", "Marked duplicate, so a person decides",
      "Same trigger and symptom as BUG-0141 (garage during a near-miss combo).", ["Tap Garage during a near-miss combo"], "BUG-0141"),
    r(145, "priya", at(1, 16, 2), "Typo on the mission card: Recieve",
      "Mission card says 'Recieve 50 coins'.", "Redmi Note 13", "valid", "S4", 0.97, "paid", "auto_pay", "Valid S4, 97% sure, inside both caps",
      "Spelling mistake in player-facing text.", ["Open the title screen", "Read the third mission card"]),
    r(146, "amaya", at(1, 19, 48), "Car falls through the bridge on Coastal at about 2.4 km",
      "On the Coastal route the car dropped through the bridge deck at around 2.4 km and the run ended.", "Galaxy A14, Android 14",
      "valid", "S2", 0.88, "approved", "review", "$20 is over the $10 per-bug cap",
      "Collision gap ends the run; route-specific.", ["Pick the Coastal route", "Drive to about 2.4 km", "Stay in the right lane over the bridge"]),
    r(147, "diego", minsAgo(290), "Please add a manual gearbox",
      "Would be nice to shift gears myself, feels too easy.", "Pixel 7, Android 15",
      "not_a_bug", null, 0.95, "review", "review", "Marked not a bug, so a person decides",
      "Feature request, not a defect.", []),
    r(148, "lena", minsAgo(230), "Handbrake counts as braking in 'Drive 5 km without braking'",
      "Used the handbrake drift once and the mission failed with 'You braked'.", "iPad 10th gen",
      "valid", "S2", 0.74, "review", "review", "Confidence 74% is under 80%",
      "Probably a rules bug, but the mission text could be read either way.", ["Start 'Drive 5 km without braking'", "Use the handbrake once", "Mission fails"]),
    r(149, "kofi", minsAgo(160), "Rewarded ad says NO AD RIGHT NOW on first launch",
      "Tapped double coins after the first run and it said no ad right now.", "Tecno Spark 20",
      "not_a_bug", null, 0.86, "review", "review", "Marked not a bug, so a person decides",
      "Listed as a known issue (ad network has no fill on a fresh install).", []),
    r(150, "priya", minsAgo(80), "Music keeps playing after the phone locks",
      "Locked the phone mid-run, the engine sound and music kept playing in my pocket.", "Redmi Note 13",
      "valid", "S3", 0.9, "paid", "auto_pay", "Valid S3, 90% sure, inside both caps",
      "Audio not paused on app background.", ["Start a run", "Lock the phone"]),
  ];

  const item = (id: string, status = "SUCCESS") => {
    const rep = reports.find((x) => x.id === id)!;
    rep.payoutItem = `${id}-item`;
    return { reportId: id, email: rep.tester.email, amount: rep.bounty, status, paypalItemId: `MOCKITEM${id.slice(4)}` };
  };
  const batch = (id: string, when: string, trigger: "autopilot" | "studio", ids: string[]) =>
    ({ id, paypalBatchId: `MOCKBATCH${id.slice(3)}`, createdAt: when, status: "SUCCESS", trigger, items: ids.map((x) => item(x)) });

  return {
    campaign: {
      studio: "StarFun Games",
      game: "Drive Away: Endless Road Trip",
      build: "1.4.0 beta",
      brief: "Endless road-trip driver for Android and iOS. This build adds the garage screen, daily missions and rewarded double coins. Focus on missions, the garage and anything that ends a run unfairly.",
      knownIssues: ["Rewarded ads can show NO AD RIGHT NOW on a fresh install (ad network fill), already reported upstream."],
      rules: { prices, autopilot: true, perBugCap: 10, dailyCap: 50, minConfidence: 0.8 },
    },
    reports,
    batches: [
      batch("PB-0001", at(2, 14, 41), "autopilot", ["BUG-0142"]),
      batch("PB-0002", at(1, 9, 6), "autopilot", ["BUG-0143"]),
      batch("PB-0003", at(1, 16, 3), "autopilot", ["BUG-0145"]),
      batch("PB-0004", at(1, 18, 30), "studio", ["BUG-0141"]),
      batch("PB-0005", minsAgo(79), "autopilot", ["BUG-0150"]),
    ],
    funding: [{ orderId: "MOCKORDER0001", captureId: "MOCKCAPTURE0001", amount: 300, capturedAt: at(3, 20, 15) }],
  };
}
