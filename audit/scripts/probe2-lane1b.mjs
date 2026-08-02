// Retry targeted cockpit interactions with text-based locators.
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

async function tryClick(desc, locator, shot) {
  try {
    await locator.click({ timeout: 4000 });
    await page.waitForTimeout(900);
    if (shot) await page.screenshot({ path: `audit/shots/${shot}-1440x900.png` });
    return "clicked url=" + page.url();
  } catch (e) { return "FAILED " + String(e).split("\n")[0]; }
}

// dock tab strip: buttons inside the dock header
report.inspector = await tryClick("inspector", page.locator("button", { hasText: /^Inspector$/ }).first(), "dock-inspector");
report.activity = await tryClick("activity", page.locator("button", { hasText: /^Activity$/ }).first(), "dock-activity");
report.versions = await tryClick("versions", page.locator("button", { hasText: /^Versions/ }).last(), "dock-versions2");
report.reviewBack = await tryClick("review", page.locator("button", { hasText: /^Review/ }).first(), "dock-review2");
report.resolved = await tryClick("resolved", page.locator("button", { hasText: /^Resolved \(/ }).first(), "comments-resolved");
report.open = await tryClick("open", page.locator("button", { hasText: /^Open \(/ }).first(), null);
// top modes
report.edit = await tryClick("edit", page.locator("button", { hasText: /^Edit$/ }).first(), "mode-edit");
report.focus = await tryClick("focus", page.locator("button", { hasText: /^Focus$/ }).first(), "mode-focus");
report.lifecycle = await tryClick("lifecycle", page.locator("button", { hasText: /^Lifecycle$/ }).first(), "mode-lifecycle");
report.commands = await tryClick("commands", page.locator("button", { hasText: /^Commands$/ }).first(), "mode-commands");
await page.keyboard.press("Escape");
// Start screen share: visible? disabled?
report.screenShare = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Start screen share/i.test(x.textContent));
  if (!b) return "not in DOM";
  const r = b.getBoundingClientRect();
  return { disabled: b.disabled, ariaDisabled: b.getAttribute("aria-disabled"), visible: r.width > 0 && r.height > 0, rect: { x: Math.round(r.x), y: Math.round(r.y) } };
});
// resolve a comment? NO — that mutates demo state; skip. Instead check the resolve button exists.
report.resolveButtons = await page.evaluate(() =>
  [...document.querySelectorAll("button.cockpit-resolve")].map((b) => b.getAttribute("aria-label")));
fs.writeFileSync("audit/scripts/lane1b-probe2-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
