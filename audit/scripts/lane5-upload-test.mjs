// READ-ONLY lane5 live verification: demo-mode upload + sequence playback.
// Upload writes ONLY to the ephemeral browser's IndexedDB (lib/demo/media-blob-store.ts).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AUDIT_BASE || "http://localhost:4103";
const OUT = path.resolve("audit/shots");
fs.mkdirSync(OUT, { recursive: true });
const results = {};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") results.consoleErrors = (results.consoleErrors || []).concat(m.text().slice(0, 200)); });

async function authDemo(url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  if (page.url().includes("/login")) {
    const btn = page.getByRole("button", { name: /open local workspace/i });
    await btn.first().waitFor({ timeout: 10000 });
    await btn.first().click();
    await page.waitForTimeout(3000);
    await page.goto(url.includes("demo=1") ? url : url + (url.includes("?") ? "&" : "?") + "demo=1", { waitUntil: "networkidle" }).catch(() => {});
  }
}

// 1. Open the global upload dialog
await authDemo(BASE + "/?demo=1");
results.landedUrl = page.url();
const uploadBtn = page.getByRole("button", { name: /upload media to a project/i });
await uploadBtn.first().waitFor({ timeout: 10000 });
await uploadBtn.first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "lane5-upload-dialog.png") });
results.dialogVisible = await page.getByRole("dialog", { name: /upload media/i }).isVisible().catch(() => false);

// 2. Upload the tiny test clip (goes to browser IndexedDB only)
const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles(path.resolve("audit/scripts/lane5-test-clip.mp4"));
await page.waitForTimeout(500);
const submit = page.getByRole("button", { name: /^Upload 1$/ });
await submit.click();
await page.waitForURL(/\/projects\//, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(3000);
results.afterUploadUrl = page.url();
results.uploadedAssetVisible = await page.getByText("lane5-test-clip").first().isVisible().catch(() => false);
await page.screenshot({ path: path.join(OUT, "lane5-after-upload.png"), fullPage: false });

// 3. Verify the uploaded blob actually plays (video element with blob: src)
const mediaInfo = await page.evaluate(async () => {
  const vids = [...document.querySelectorAll("video")].map((v) => ({ src: v.src?.slice(0, 60), readyState: v.readyState }));
  const dbs = await indexedDB.databases().catch(() => []);
  return { vids, dbs: dbs.map((d) => d.name) };
});
results.mediaInfo = mediaInfo;

// 4. Sequence timeline on schneider-epc (seeded "radio cut")
await authDemo(BASE + "/projects/schneider-epc?demo=1");
await page.waitForTimeout(2500);
const seqHeading = page.getByText(/radio cut/i).first();
results.sequenceVisible = await seqHeading.isVisible().catch(() => false);
await seqHeading.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "lane5-sequence-timeline.png") });

// 5. Try real sequence playback
const playBtn = page.getByRole("button", { name: /play sequence/i }).first();
if (await playBtn.isVisible().catch(() => false)) {
  const t0 = await page.evaluate(() => document.querySelector(".cv-timeline__timebar span")?.textContent);
  await playBtn.click();
  await page.waitForTimeout(2500);
  const t1 = await page.evaluate(() => document.querySelector(".cv-timeline__timebar span")?.textContent);
  const vidState = await page.evaluate(() => {
    const v = document.querySelector(".cv-timeline video");
    return v ? { currentTime: v.currentTime, paused: v.paused, src: v.src?.slice(0, 60) } : null;
  });
  results.playback = { before: t0, after: t1, vidState };
  await page.screenshot({ path: path.join(OUT, "lane5-sequence-playing.png") });
} else {
  results.playback = "play button not found";
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
