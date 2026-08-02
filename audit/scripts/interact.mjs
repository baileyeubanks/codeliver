// READ-ONLY interaction probe: click safe tabs/filters, screenshot results.
import { chromium } from "playwright";
import path from "node:path";
const BASE = "http://localhost:4103";
const OUT = path.resolve("audit/shots");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function authed(url) {
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  if (page.url().includes("/login")) {
    const btn = page.getByRole("button", { name: /open local workspace/i });
    await btn.first().waitFor({ timeout: 10000 });
    await btn.first().click();
    await page.waitForTimeout(3500);
    await page.goto(BASE + url + (url.includes("?") ? "&" : "?") + "demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(2500);
}

// 1. Activity: click Audit filter (likely empty state)
await authed("/activity");
await page.getByRole("tab", { name: "Audit" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "activity-audit-filter-1440x900.png") });

// 2. Activity: click Uploads filter (1 item)
await page.getByRole("tab", { name: "Uploads" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "activity-uploads-filter-1440x900.png") });

// 3. Reviews: click "Created by me" tab
await authed("/reviews");
await page.getByRole("tab", { name: "Created by me" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "reviews-mine-tab-1440x900.png") });

// 4. Reviews: open detail modal (row click, non-destructive)
await page.getByRole("tab", { name: "All links" }).click();
await page.waitForTimeout(500);
await page.locator("tbody tr").first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "reviews-detail-modal-1440x900.png") });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /close review link details/i }).click().catch(() => {});

// 5. Signup validation: click submit with empty required fields -> native validation only; skip typing.
// Instead test welcome reel: check for reel controls
await page.goto(BASE + "/welcome", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
const reelButtons = await page.evaluate(() =>
  Array.from(document.querySelectorAll("main button")).map((b) => b.getAttribute("aria-label") || b.innerText.trim().slice(0, 40))
);
console.log("welcome buttons:", JSON.stringify(reelButtons));

// 6. Opportunities: toggle New inquiry compose open (no save), screenshot
await authed("/opportunities");
await page.getByRole("button", { name: /new inquiry/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "opportunities-compose-1440x900.png") });
await page.getByRole("button", { name: "Cancel" }).click();

// 7. Identify the floating N launcher
const n = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("button, a"));
  const hit = els.find((e) => e.innerText.trim() === "N");
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  const cs = getComputedStyle(hit);
  return { label: hit.getAttribute("aria-label"), title: hit.getAttribute("title"), cls: hit.className.slice(0, 120), pos: cs.position, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
});
console.log("N launcher:", JSON.stringify(n));

await browser.close();
console.log("done");
