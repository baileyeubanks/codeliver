// READ-ONLY lane 7: walk every nav href in demo mode; record HTTP status,
// final URL, and any "coming soon"/placeholder text. No edits, no writes to app.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AUDIT_BASE || "http://localhost:4103";
const OUT = path.resolve("audit/shots");
fs.mkdirSync(OUT, { recursive: true });

const hrefs = [
  "/",
  "/projects",
  "/opportunities",
  "/reviews",
  "/activity",
  "/field",
  "/library",
  "/projects/archive",
  "/projects/trash",
  "/settings",
  "/projects/new",
  // extra surfaces reachable by URL only
  "/login",
  "/welcome",
  "/signup",
  "/invite/bogus-token",
  "/review/bogus-token",
  "/projects/does-not-exist",
  "/definitely-not-a-route",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// demo auth
await page.goto(BASE + "/login?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
try {
  const btn = page.getByRole("button", { name: /open local workspace/i });
  await btn.first().waitFor({ timeout: 8000 });
  await btn.first().click();
  await page.waitForTimeout(4000);
} catch { /* maybe already authed */ }

const results = [];
for (const href of hrefs) {
  const url = href.startsWith("/login") || href.startsWith("/signup") || href.startsWith("/review/") || href.startsWith("/invite/")
    ? href
    : href + (href.includes("?") ? "&" : "?") + "demo=1";
  try {
    const resp = await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    const status = resp ? resp.status() : null;
    const title = await page.title();
    const bodyText = (await page.evaluate(() => document.body?.innerText ?? "")).slice(0, 4000);
    const placeholders = [];
    for (const pat of [/coming soon/gi, /not implemented/gi, /under construction/gi, /placeholder/gi, /work in progress/gi, /TODO/g, /404/g, /page (not found|couldn'?t be found)/gi, /not available (yet)?/gi, /demo mode/gi]) {
      const matches = bodyText.match(pat);
      if (matches) {
        for (const m of matches) {
          const i = bodyText.indexOf(m);
          placeholders.push(bodyText.slice(Math.max(0, i - 80), i + 120).replace(/\s+/g, " ").trim());
        }
      }
    }
    // is there meaningful content? rough main-content length
    const mainLen = (await page.evaluate(() => document.querySelector("main")?.innerText?.length ?? document.body?.innerText?.length ?? 0));
    const name = href.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "home";
    const file = path.join(OUT, `lane7-${name}-1440x900.png`);
    await page.screenshot({ path: file });
    results.push({ href: url, status, finalUrl, title, mainLen, placeholders: [...new Set(placeholders)].slice(0, 4) });
  } catch (e) {
    results.push({ href: url, error: String(e).slice(0, 300) });
  }
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
