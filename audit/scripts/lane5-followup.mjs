import { chromium } from "playwright";
import fs from "node:fs";
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
    const btn = page.getByRole("button", { name: /open local workspace/i });
    await btn.first().click();
    await page.waitForTimeout(3000);
    await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  }
}

// A. Upload again then verify IndexedDB content + asset on page
await authDemo(BASE + "/?demo=1");
await page.getByRole("button", { name: /upload media to a project/i }).first().click();
await page.locator('input[type="file"]').first().setInputFiles(path.resolve("audit/scripts/lane5-test-clip.mp4"));
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Upload 1$/ }).click();
await page.waitForURL(/\/projects\//, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(3000);
results.idb = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("co-deliver-demo-media", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction("media", "readonly");
  const all = await new Promise((res, rej) => { const q = tx.objectStore("media").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  return all.map((r) => ({ assetId: r.assetId, fileName: r.fileName, mimeType: r.mimeType, blobBytes: r.blob.size }));
});
// Look for the asset title anywhere on the cockpit page (tabs, lists)
results.assetTextFound = await page.getByText(/lane5-test-clip/i).count();
results.pageUrl = page.url();
await page.screenshot({ path: path.join(OUT, "lane5-cockpit-after-upload.png"), fullPage: true });

// Click the uploaded asset if listed, check player src becomes blob:
const card = page.getByText(/lane5-test-clip/i).first();
if (await card.isVisible().catch(() => false)) {
  await card.click();
  await page.waitForTimeout(2000);
  results.playerAfterSelect = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { src: v.src?.slice(0, 50), readyState: v.readyState, duration: v.duration } : null;
  });
  await page.screenshot({ path: path.join(OUT, "lane5-uploaded-clip-playing.png") });
}

// B. schneider-epc sequences: find tabs / section
await authDemo(BASE + "/projects/schneider-epc?demo=1");
await page.waitForTimeout(2500);
results.tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"], nav button, .cockpit-nav button')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 40));
results.radioCutCount = await page.getByText(/radio cut/i).count();
results.sequencesSection = await page.getByText(/No sequences yet/i).count();
await page.screenshot({ path: path.join(OUT, "lane5-schneider-cockpit.png"), fullPage: true });

console.log(JSON.stringify(results, null, 2));
await browser.close();
