// npm run shots: screenshots of the flow npm run live just ran, for the README and Devpost gallery.
// Starts the production build on a spare port (builds it first if needed), opens it in Chrome,
// labels every shot with the mode it ran in, and writes docs/proof/*.png plus a 2x2 sheet at docs/proof.png (needs ffmpeg).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { chromium, type Browser } from "playwright-core";

const PORT = 3217, base = `http://localhost:${PORT}`;
if (!fs.existsSync(".next/BUILD_ID")) spawnSync("npx", ["next", "build"], { stdio: "inherit" });
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore", detached: true });
const stop = () => { try { process.kill(-server.pid!); } catch {} };
process.on("exit", stop);

let state: { mode: { paypal: string; ai: string }; reports: { id: string; tester: { email: string } }[] } | undefined;
for (let t = 0; t < 60 && !state; t++) {
  try { state = await (await fetch(`${base}/api/state`)).json(); } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
if (!state) throw new Error("next start did not come up on port " + PORT);

const live = state.mode.paypal === "sandbox" && state.mode.ai === "claude";
const label = live
  ? `LIVE: PayPal sandbox + Claude. npm run proof, ${new Date().toISOString().slice(0, 10)}`
  : `MOCK MODE: ${state.mode.paypal === "mock" ? "fake PayPal ids (MOCK...)" : "PayPal sandbox"}, ${state.mode.ai === "claude" ? "Claude triage" : "keyword triage, no Claude"}. npm run proof, ${new Date().toISOString().slice(0, 10)}`;
const newest = state.reports.at(-2)!; // the bug npm run live filed and paid (the last one is its duplicate)

let browser: Browser;
try { browser = await chromium.launch({ channel: "chrome" }); } catch { browser = await chromium.launch(); } // Chrome, else `npx playwright install chromium`
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const shots: [string, string, (() => Promise<unknown>)?][] = [
  ["1-submit", "/submit"],
  ["2-queue-injection-held", "/", () => page.getByText("BUG-0151", { exact: true }).first().click()],
  ["3-ledger", "/ledger"],
  ["4-my-bugs", `/bugs?email=${encodeURIComponent(newest.tester.email)}`],
];
fs.mkdirSync("docs/proof", { recursive: true });
for (const [name, path, act] of shots) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  if (act) { await act(); await page.evaluate(() => { document.querySelector("[role=tab]")?.scrollIntoView(); window.scrollBy(0, -24); }); await page.waitForTimeout(400); }
  await page.evaluate((text) => {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:8px 16px;font:600 13px/1.3 ui-monospace,monospace;color:#fff;background:" + (text.startsWith("LIVE") ? "#14532d" : "#9a3412");
    document.body.append(d);
  }, label);
  await page.screenshot({ path: `docs/proof/${name}.png` });
}
await browser.close();
stop();

const f = shots.map(([n]) => ["-i", `docs/proof/${n}.png`]).flat();
const sheet = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...f, "-filter_complex", "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=1600:-1", "docs/proof.png"], { stdio: "inherit" });
console.log(`Wrote docs/proof/*.png${sheet.status === 0 ? " and docs/proof.png" : " (no ffmpeg, so no sheet)"}: ${label}`);
