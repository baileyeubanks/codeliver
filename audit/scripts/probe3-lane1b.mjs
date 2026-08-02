import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "http://localhost:4103";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const report = {};
await page.goto(BASE + "/projects", { waitUntil: "networkidle" }).catch(() => {});
if (page.url().includes("/login")) {
  await page.getByRole("button", { name: /open local workspace/i }).first().click();
  await page.waitForTimeout(4000);
}
await page.goto(BASE + "/projects/ica?demo=1&asset=charles-drummond-v5&view=review", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(3000);
report.url = page.url();
// resolved comments tab (inside review dock)
try {
  const btn = page.locator(".cockpit-comment-tabs button", { hasText: "Resolved" }).first();
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: "audit/shots/comments-resolved-1440x900.png" });
  report.resolved = "clicked";
} catch (e) { report.resolved = "FAILED " + String(e).split("\n")[0]; }
// screen share control state
report.screenShare = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Start screen share/i.test(x.textContent));
  if (!b) return "not in DOM";
  const r = b.getBoundingClientRect();
  return { disabled: b.disabled, ariaDisabled: b.getAttribute("aria-disabled"), visible: r.width > 0, x: Math.round(r.x), y: Math.round(r.y) };
});
// scroll dock to bottom and screenshot live-session / share readiness region
await page.evaluate(() => {
  const dock = document.querySelector("aside");
  if (dock) dock.scrollTop = dock.scrollHeight;
});
await page.waitForTimeout(500);
await page.screenshot({ path: "audit/shots/dock-bottom-1440x900.png" });
// exact text of review status strip + system chips for L2 quoting
report.chips = await page.evaluate(() =>
  [...document.querySelectorAll("main *")].filter((el) => el.children.length === 0)
    .map((el) => el.textContent.trim())
    .filter((t) => /Needs attention|online only|listed|Not used|unverified|backend|staged/i.test(t)).slice(0, 20));
// comment resolve buttons present?
report.resolveBtns = await page.locator("button.cockpit-resolve").count();
fs.writeFileSync("audit/scripts/lane1b-probe3-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
