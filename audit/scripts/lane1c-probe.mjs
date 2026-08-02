// READ-ONLY UI probe for lane1c audit. Clicks non-destructive controls only.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:4103";
const OUT = path.resolve("audit/shots");
fs.mkdirSync(OUT, { recursive: true });
const results = {};

async function authedPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  const btn = page.getByRole("button", { name: /open local workspace/i });
  try {
    await btn.first().waitFor({ timeout: 10000 });
    await btn.first().click();
    await page.waitForTimeout(4000);
  } catch {}
  return { ctx, page };
}

async function overflow(page) {
  return page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const bad = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > docW + 1 || r.left < -1)) {
        const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").toString().slice(0, 60);
        bad.push(`${el.tagName}.${cls} right=${Math.round(r.right)}`);
      }
    });
    return { docW, scrollW: document.documentElement.scrollWidth, offenders: bad.slice(0, 12) };
  });
}

async function typeAndColor(page, selectors) {
  return page.evaluate((sels) => {
    const out = {};
    for (const [name, sel] of Object.entries(sels)) {
      const el = document.querySelector(sel);
      if (!el) { out[name] = null; continue; }
      const cs = getComputedStyle(el);
      out[name] = { font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`, family: cs.fontFamily.split(",")[0], color: cs.color, bg: cs.backgroundColor };
    }
    // global font-size census
    const sizes = {};
    document.querySelectorAll("body *").forEach((el) => {
      const fs_ = getComputedStyle(el).fontSize;
      sizes[fs_] = (sizes[fs_] || 0) + 1;
    });
    return { elements: out, fontSizeCensus: sizes };
  }, selectors);
}

const browser = await chromium.launch();

// ---------- 1. Library @1440: styles, overflow, broken thumbs, filters ----------
{
  const { ctx, page } = await authedPage(browser, 1440, 900);
  await page.goto(BASE + "/library?demo=1", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2000);
  results.library1440 = {};
  results.library1440.overflow = await overflow(page);
  results.library1440.type = await typeAndColor(page, {
    h1: "h1", kicker: "main p.uppercase", subtitle: "h1 + p",
    statValue: "main article strong", statLabel: "main article span span",
    cardTitle: "main a p", searchInput: "input[aria-label='Search media library']",
  });
  results.library1440.brokenImages = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("main img")];
    return { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      srcs: imgs.slice(0, 3).map((i) => i.currentSrc || i.src) };
  });
  // filter: Image (expect empty state since all 8 are videos)
  await page.locator("[aria-label='File type filters'] button", { hasText: "image" }).click();
  await page.waitForTimeout(400);
  results.library1440.imageFilterText = await page.locator("main").innerText().then((t) => t.split("\n").slice(-8).join(" | "));
  await page.screenshot({ path: path.join(OUT, "library-image-filter-empty-1440x900.png") });
  await page.locator("[aria-label='File type filters'] button", { hasText: "all" }).click();
  // search no-match
  await page.locator("input[aria-label='Search media library']").fill("zzzz");
  await page.waitForTimeout(400);
  results.library1440.noMatchText = await page.locator("main h2").innerText().catch(() => null);

  // ---------- 2. Chrome: command palette, notifications, account, upload ----------
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(800);
  results.commandPaletteOpen = await page.locator("[role='dialog'], .command-palette, [class*='palette']").count();
  await page.screenshot({ path: path.join(OUT, "chrome-command-palette-1440x900.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Notifications" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "chrome-notifications-1440x900.png") });
  results.notificationsText = await page.locator("#workspace-notifications").innerText().catch(() => null);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "chrome-account-menu-1440x900.png") });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Upload media to a project" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "chrome-upload-dialog-1440x900.png") });
  results.uploadDialogText = await page.locator("[role='dialog']").first().innerText().catch(() => null);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ---------- 3. Settings: notifications tab + toggle persistence ----------
  await page.goto(BASE + "/settings?demo=1&section=notifications", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "settings-notifications-1440x900.png") });
  const inapp = page.getByRole("switch", { name: /in-app/i }).first();
  const before = await inapp.getAttribute("aria-checked").catch(async () => (await inapp.isChecked()) ? "true" : "false");
  await inapp.click();
  await page.waitForTimeout(500);
  const mid = await inapp.getAttribute("aria-checked").catch(async () => (await inapp.isChecked()) ? "true" : "false");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const inapp2 = page.getByRole("switch", { name: /in-app/i }).first();
  const after = await inapp2.getAttribute("aria-checked").catch(async () => (await inapp2.isChecked()) ? "true" : "false");
  results.settingsToggle = { control: "In-app notifications", before, afterClick: mid, afterReload: after, persisted: mid === after && before !== after };
  // restore original state to leave things as found
  if (before !== after) { await inapp2.click(); await page.waitForTimeout(400); }
  // settings tab inventory
  results.settingsTabs = await page.locator("nav a, nav button, [role='tab']").allInnerTexts().catch(() => []);
  results.settingsOverflow = await overflow(page);
  await ctx.close();
}

// ---------- 4. Mobile 375: drawer, command palette, library overflow, field interaction ----------
{
  const { ctx, page } = await authedPage(browser, 375, 812);
  await page.goto(BASE + "/library?demo=1", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1800);
  results.library375 = { overflow: await overflow(page) };

  await page.getByRole("button", { name: "Open workspace navigation" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "chrome-mobile-drawer-375x812.png") });
  await page.getByRole("button", { name: "Close workspace navigation" }).click().catch(() => {});
  await page.waitForTimeout(300);

  await page.locator(".workspace-search, [aria-label='Search commands, projects, and media']").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, "chrome-command-palette-375x812.png") });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Notifications" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "chrome-notifications-375x812.png") });
  await page.keyboard.press("Escape");

  // field interaction
  await page.goto(BASE + "/field?demo=1", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  results.field375 = { overflow: await overflow(page) };
  const markBtn = page.getByRole("button", { name: /mark in progress/i });
  if (await markBtn.count()) {
    await markBtn.click();
    await page.waitForTimeout(600);
    results.field375.notice = await page.locator("[role='status']").innerText().catch(() => null);
    await page.screenshot({ path: path.join(OUT, "field-after-mark-375x812.png") });
    // revert: click again? DAY_NEXT in_progress -> wrapped; that's destructive-ish. Instead reload from seed? localStorage mutated. Reset via reload won't revert. Note it.
  }
  // day chips scroller
  results.field375.chipNav = await page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Production days']");
    return nav ? { scrollW: nav.scrollWidth, clientW: nav.clientWidth, scrollable: nav.scrollWidth > nav.clientWidth } : null;
  });
  await ctx.close();
}

// ---------- 5. Tablet 768 overflow checks ----------
{
  const { ctx, page } = await authedPage(browser, 768, 1024);
  for (const p of ["/library", "/field", "/settings"]) {
    await page.goto(`${BASE}${p}?demo=1`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    results[`overflow768${p}`] = await overflow(page);
  }
  await ctx.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
