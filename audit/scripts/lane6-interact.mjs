// Lane 6 read-only interaction probe for /review/[token] demo surface.
// Writes only screenshots to audit/shots and browser localStorage (ephemeral context).
import { chromium } from "playwright";

const BASE = "http://localhost:4103";
const CLIENT_URL =
  "/review/demo?demo=1&asset=denie-mcdonald-v4&intent=client_review&share=demo-ceraweek-cuts";
const APPROVE_URL =
  "/review/demo?demo=1&asset=ica-roadshow-final&intent=approval_needed&share=demo-ica-final";

const out = [];
const log = (k, v) => { out.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") out.push(`console.error: ${m.text()}`); });
page.on("pageerror", (e) => out.push(`pageerror: ${e.message}`));

await page.goto(BASE + CLIENT_URL, { waitUntil: "networkidle" });

// --- Player facts ---
const video = page.locator("video").first();
log("video.count", await page.locator("video").count());
log("video.src", await video.getAttribute("src"));
log("video.poster", await video.getAttribute("poster"));
log("video.readyState", await video.evaluate((v) => v.readyState));
log("video.duration", await video.evaluate((v) => v.duration));
log("video.videoSize", await video.evaluate((v) => `${v.videoWidth}x${v.videoHeight}`));

// play
await video.evaluate((v) => v.play());
await page.waitForTimeout(1500);
const t1 = await video.evaluate((v) => v.currentTime);
log("playhead.after1.5s", t1);
log("paused.after1.5s", await video.evaluate((v) => v.paused));
const timeLabel = await page.locator("text=/0:0[0-9] \\/ 0:0[0-9]/").first().textContent().catch(() => null);
log("transport.timeLabel", timeLabel);
// frame indicator / timecode overlay
const tc = await page.locator("text=/00:00:00:0[0-9]/").first().textContent().catch(() => null);
log("overlay.timecode", tc);

// scrub: set currentTime and check transport label
await video.evaluate((v) => { v.pause(); v.currentTime = 4; });
await page.waitForTimeout(400);
log("transport.afterSeek", await page.locator("text=/0:0[0-9] \\/ 0:0[0-9]/").first().textContent().catch(() => null));

// playback speed control
const speedBtn = page.getByRole("button", { name: /1x/ }).first();
await speedBtn.click().catch(() => null);
await page.waitForTimeout(300);
await page.screenshot({ path: "audit/shots/lane6-speedmenu.png" });
const rate25 = page.getByText("2x", { exact: true }).first();
if (await rate25.count()) { await rate25.click(); await page.waitForTimeout(200); }
log("playbackRate.after2x", await video.evaluate((v) => v.playbackRate));

// fullscreen button presence (do not rely on headless fullscreen)
log("fullscreen.btnCount", await page.locator("button[aria-label*=ullscreen], button:has(svg)").count());

await page.screenshot({ path: "audit/shots/lane6-player-after.png" });

// --- Comments ---
// scroll to composer
const composer = page.locator("textarea").first();
log("composer.textareaCount", await page.locator("textarea").count());
await composer.scrollIntoViewIfNeeded();
await page.screenshot({ path: "audit/shots/lane6-composer-before.png" });
const nameInput = page.locator("input[placeholder*=ame], input[aria-label*=ame]").first();
log("composer.nameInputCount", await nameInput.count());
if (await nameInput.count()) await nameInput.fill("Audit Reviewer");
await composer.fill("Audit note at the current playhead.");
await page.keyboard.press("Escape").catch(() => null);
// find submit button near composer
const submit = page.getByRole("button", { name: /comment|post|add note|leave/i }).last();
log("composer.submitLabel", await submit.textContent().catch(() => null));
await submit.click().catch((e) => out.push("submit.click.error: " + e.message));
await page.waitForTimeout(800);
await page.screenshot({ path: "audit/shots/lane6-composer-after.png", fullPage: false });
log("comments.containsAuditNote", await page.locator("text=Audit note at the current playhead.").count());
log("localStorage.keys", await page.evaluate(() => Object.keys(localStorage)));

// pin mode
const pinBtn = page.getByRole("button", { name: /pin/i }).first();
log("pin.btnCount", await page.getByRole("button", { name: /pin/i }).count());

// --- mentions support in composer? type @ ---
await composer.fill("@");
await page.waitForTimeout(500);
log("mentions.suggestionCount", await page.locator("[class*=mention], [data-mention]").count());

await page.close();

// --- Approval surface ---
const p2 = await ctx.newPage();
p2.on("pageerror", (e) => out.push("pageerror(p2): " + e.message));
await p2.goto(BASE + APPROVE_URL, { waitUntil: "networkidle" });
// name required?
const name2 = p2.locator("input[placeholder*=ame]").first();
if (await name2.count()) await name2.fill("Audit Reviewer");
const approveBtn = p2.getByRole("button", { name: /approve/i }).first();
log("approval.approveBtnCount", await p2.getByRole("button", { name: /approve/i }).count());
log("approval.requestChangesCount", await p2.getByRole("button", { name: /request changes/i }).count());
await approveBtn.scrollIntoViewIfNeeded().catch(() => null);
await p2.screenshot({ path: "audit/shots/lane6-approval-before.png" });
await approveBtn.click().catch((e) => out.push("approve.click.error: " + e.message));
await p2.waitForTimeout(1200);
await p2.screenshot({ path: "audit/shots/lane6-approval-after.png" });
// capture any dialog / confirmation
log("approval.dialogCount", await p2.locator("[role=dialog], [role=alertdialog]").count());
log("approval.decidedText", await p2.locator("text=/decided|Approved|sign-off/i").first().textContent().catch(() => null));

await browser.close();
console.log(out.join("\n"));
