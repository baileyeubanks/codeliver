// READ-ONLY audit: sample computed colors per surface via Playwright.
// Usage: node audit/scripts/measure.mjs
import { chromium } from "playwright";

const targets = [
  { name: "home /", base: "http://localhost:4103", url: "/", auth: true },
  { name: "projects", base: "http://localhost:4103", url: "/projects", auth: true },
  { name: "library", base: "http://localhost:4103", url: "/library", auth: true },
  { name: "field", base: "http://localhost:4103", url: "/field", auth: true },
  { name: "truth-app /", base: "http://localhost:4321", url: "/", auth: false },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const out = [];

for (const t of targets) {
  const page = await ctx.newPage();
  try {
    await page.goto(t.base + t.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    if (t.auth && page.url().includes("/login")) {
      const btn = page.getByRole("button", { name: /open local workspace/i });
      try {
        await btn.first().waitFor({ timeout: 8000 });
        await btn.first().click();
        await page.waitForTimeout(4000);
        const target = t.url.includes("demo=1") ? t.url : t.url + (t.url.includes("?") ? "&" : "?") + "demo=1";
        await page.goto(t.base + target, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      } catch {}
    }
    await page.waitForTimeout(2500);
    const sample = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, color: cs.color };
      };
      const btn = document.querySelector(".btn-primary, .btn-upload, [class*='btn'][class*='primary'], button[class*='primary']");
      return {
        body: pick("body"),
        htmlBg: getComputedStyle(document.documentElement).backgroundColor,
        nav: pick(".topnav") || pick("nav") || pick("header"),
        card: pick(".card") || pick(".card-media") || pick("[class*='card']"),
        primaryButton: btn ? { bg: getComputedStyle(btn).backgroundColor, color: getComputedStyle(btn).color } : null,
        sidebar: pick(".sidebar") || pick("[class*='rail']"),
        dataTheme: document.documentElement.getAttribute("data-theme"),
        title: document.title,
      };
    });
    out.push({ surface: t.name, finalUrl: page.url(), ...sample });
  } catch (e) {
    out.push({ surface: t.name, error: String(e) });
  }
  await page.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
