// READ-ONLY interaction audit of the asset review cockpit.
// Measures computed styles, checks horizontal overflow, clicks dock tabs, tests inert controls.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:4103";
const OUT = "audit/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const report = {};

// auth
await page.goto(BASE + "/projects", { waitUntil: "networkidle" }).catch(() => {});
if (page.url().includes("/login")) {
  await page.getByRole("button", { name: /open local workspace/i }).first().click();
  await page.waitForTimeout(4000);
}
await page.goto(BASE + "/projects/ica?demo=1&asset=charles-drummond-v5&view=review", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(3500);

// 1. computed type + color sample
report.styles = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { font: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, color: cs.color, bg: cs.backgroundColor };
  };
  const sizes = new Set();
  document.querySelectorAll("main *").forEach((el) => {
    if (el.children.length === 0 && el.textContent.trim()) sizes.add(getComputedStyle(el).fontSize);
  });
  return {
    h1: pick("h1"),
    body: pick("body"),
    eyebrow: pick(".text-\\[11px\\]") || null,
    uniqueFontSizes: [...sizes].sort(),
  };
});

// 2. horizontal overflow at 3 viewports
report.overflow = {};
for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(800);
  report.overflow[`${w}x${h}`] = await page.evaluate(() => {
    const offenders = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1)) {
        const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
        if (offenders.length < 12) offenders.push(`${el.tagName}.${cls} right=${Math.round(r.right)}`);
      }
    });
    return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, offenders };
  });
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(800);

// 3. dock tabs
const tabNames = await page.$$eval("[class*='operatorDock'] button, aside button", (bs) =>
  bs.map((b) => b.textContent.trim()).filter(Boolean).slice(0, 40));
report.dockButtons = tabNames;

// click Versions tab in dock
async function clickDockTab(name, shotName) {
  const btn = page.locator("aside button, [class*='dock'] button", { hasText: new RegExp(`^${name}`, "i") }).first();
  try {
    await btn.click({ timeout: 3000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${shotName}-1440x900.png` });
    return "clicked";
  } catch (e) { return "FAILED: " + String(e).slice(0, 120); }
}
report.versionsTab = await clickDockTab("Versions", "dock-versions");
report.inspectorTab = await clickDockTab("Inspector", "dock-inspector");
report.activityTab = await clickDockTab("Activity", "dock-activity");
report.reviewTab = await clickDockTab("Review", "dock-review-back");

// 4. resolved comments tab
try {
  await page.getByRole("button", { name: /Resolved \(/ }).first().click({ timeout: 3000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/comments-resolved-1440x900.png` });
  report.resolvedTab = "clicked";
} catch (e) { report.resolvedTab = "FAILED " + String(e).slice(0, 100); }

// 5. inert controls: check disabled states
report.disabled = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("button[disabled], button[aria-disabled='true']").forEach((b) => {
    out.push(b.textContent.trim().slice(0, 60));
  });
  return out;
});

// 6. top toolbar modes: Edit / Focus / Commands / Lifecycle
for (const [label, name] of [["Edit", "mode-edit"], ["Focus", "mode-focus"], ["Lifecycle", "mode-lifecycle"]]) {
  try {
    await page.getByRole("button", { name: new RegExp(`^${label}$`) }).first().click({ timeout: 3000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}-1440x900.png` });
    report[name] = "clicked; url=" + page.url();
  } catch (e) { report[name] = "FAILED " + String(e).slice(0, 100); }
}

// back to review mode shot of comments-open state
await page.goto(BASE + "/projects/ica?demo=1&asset=charles-drummond-v5&view=review", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(2500);

// 7. count checkmarks / badges / counts on cockpit
report.badges = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll("main *").forEach((el) => {
    const t = el.textContent?.trim();
    if (el.children.length === 0 && t && /^\(?\d+\/\d+\)?$|^\d+ (open|resolved|active|listed|in project)$|COMPLETE|Needs attention|Not processed|Not used in demo|Browser online only/i.test(t)) {
      items.push(t.slice(0, 70));
    }
  });
  return [...new Set(items)];
});

fs.writeFileSync("audit/scripts/lane1b-probe-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
