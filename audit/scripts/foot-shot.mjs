import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 768, height: 1024 } })).newPage();
await p.goto("http://localhost:4103/welcome", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await p.waitForTimeout(9000);
const foot = p.locator(".cpv-reel__foot");
await foot.screenshot({ path: "audit/shots/welcome-foot-768.png" });
// also check the showreel stage/meta overlays that might cover the footer
const cover = await p.evaluate(() => {
  const el = document.elementFromPoint(35, 973);
  return el ? { tag: el.tagName, cls: (el.className + "").slice(0, 100) } : null;
});
console.log("element at 35,973:", JSON.stringify(cover));
await b.close();
