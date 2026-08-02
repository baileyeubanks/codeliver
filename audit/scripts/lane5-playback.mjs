import { chromium } from "playwright";
import path from "node:path";
const BASE = "http://localhost:4103";
const OUT = path.resolve("audit/shots");
const results = {};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function authDemo(url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  if (page.url().includes("/login")) {
    await page.getByRole("button", { name: /open local workspace/i }).first().click();
    await page.waitForTimeout(3000);
    await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  }
}

// Upload then select asset via Media tab
await authDemo(BASE + "/?demo=1");
await page.getByRole("button", { name: /upload media to a project/i }).first().click();
await page.locator('input[type="file"]').first().setInputFiles(path.resolve("audit/scripts/lane5-test-clip.mp4"));
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Upload 1$/ }).click();
await page.waitForURL(/\/projects\//, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
// open Media tab
await page.getByRole("button", { name: /^Media$/ }).first().click().catch(() => {});
await page.waitForTimeout(1200);
const card = page.getByText(/lane5-test-clip/i).first();
results.cardVisible = await card.isVisible().catch(() => false);
if (results.cardVisible) {
  await card.click();
  await page.waitForTimeout(2500);
  results.playerAfterSelect = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { src: v.src?.slice(0, 50), readyState: v.readyState, duration: v.duration } : null;
  });
  await page.screenshot({ path: path.join(OUT, "lane5-uploaded-clip-playing.png") });
}

// Sequences tab on schneider-epc
await authDemo(BASE + "/projects/schneider-epc?demo=1");
await page.waitForTimeout(2000);
await page.getByRole("button", { name: /^Sequences$/ }).first().click();
await page.waitForTimeout(2000);
results.radioCutCount = await page.getByText(/radio cut/i).count();
results.timelinePresent = await page.locator(".cv-timeline").count();
await page.screenshot({ path: path.join(OUT, "lane5-sequence-timeline.png"), fullPage: true });

const playBtn = page.getByRole("button", { name: /play sequence/i }).first();
results.playBtnVisible = await playBtn.isVisible().catch(() => false);
if (results.playBtnVisible) {
  await playBtn.click();
  await page.waitForTimeout(3000);
  results.playback = await page.evaluate(() => {
    const v = document.querySelector(".cv-timeline video");
    const bar = document.querySelector(".cv-timeline__timebar span")?.textContent;
    return v ? { currentTime: v.currentTime, paused: v.paused, src: v.src?.slice(0, 60), playhead: bar } : { playhead: bar };
  });
  await page.screenshot({ path: path.join(OUT, "lane5-sequence-playing.png") });
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
