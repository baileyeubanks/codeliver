// READ-ONLY: verify mobile bar computed visibility at 375x812.
import { chromium } from "playwright";
const BASE = process.env.AUDIT_BASE || "http://localhost:4103";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
await page.goto(BASE + "/login?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
try {
  const btn = page.getByRole("button", { name: /open local workspace/i });
  await btn.first().waitFor({ timeout: 8000 });
  await btn.first().click();
  await page.waitForTimeout(4000);
} catch {}
await page.goto(BASE + "/?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  return [...document.querySelectorAll("nav")].map((n) => {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return { label: n.getAttribute("aria-label"), display: cs.display, position: cs.position, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: "audit/shots/lane7-mobile-home-375x812.png" });
await browser.close();
