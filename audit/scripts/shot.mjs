// READ-ONLY audit screenshot helper. Takes screenshots of the running app.
// Usage:
//   node audit/scripts/shot.mjs --url /projects --name projects --viewport 1440x900 [--auth] [--wait 3000] [--fullpage]
//   node audit/scripts/shot.mjs --url /review/some-token --name review-token --viewport 375x812
// --auth: if redirected to /login, clicks the "Open local workspace" demo button
//         (pre-filled demo account, no credentials typed) and re-navigates.
// Multiple shots in one run: pass --batch file.json with [{"url","name","viewport","auth","wait","fullpage"}]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AUDIT_BASE || "http://localhost:4103";
const OUT = path.resolve("audit/shots");
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
function arg(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const has = (flag) => args.includes(flag);

let jobs = [];
if (has("--batch")) {
  jobs = JSON.parse(fs.readFileSync(arg("--batch"), "utf8"));
} else {
  jobs = [{
    url: arg("--url") || "/",
    name: arg("--name") || "shot",
    viewport: arg("--viewport") || "1440x900",
    auth: has("--auth"),
    wait: arg("--wait") ? Number(arg("--wait")) : 2500,
    fullpage: has("--fullpage"),
  }];
}

const browser = await chromium.launch();
const results = [];
// One context per viewport size, shared across jobs of that size so auth persists.
const contexts = new Map();

for (const job of jobs) {
  const [w, h] = (job.viewport || "1440x900").split("x").map(Number);
  const key = `${w}x${h}`;
  if (!contexts.has(key)) {
    contexts.set(key, await browser.newContext({ viewport: { width: w, height: h } }));
  }
  const ctx = contexts.get(key);
  const page = await ctx.newPage();
  const url = job.url.startsWith("http") ? job.url : BASE + job.url;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    if (job.auth && page.url().includes("/login")) {
      // If gated at /login with the demo "Open local workspace" button, click it.
      const btn = page.getByRole("button", { name: /open local workspace/i });
      try {
        await btn.first().waitFor({ timeout: 10000 });
        await btn.first().click();
        await page.waitForTimeout(4000);
        const target = url.includes("demo=1") ? url : url + (url.includes("?") ? "&" : "?") + "demo=1";
        await page.goto(target, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      } catch { /* not gated or already in */ }
    }
    await page.waitForTimeout(job.wait ?? 2500);
    const file = path.join(OUT, `${job.name}-${w}x${h}.png`);
    await page.screenshot({ path: file, fullPage: !!job.fullpage });
    results.push({ url, file, title: await page.title(), finalUrl: page.url() });
  } catch (e) {
    results.push({ url, error: String(e) });
  }
  await page.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
