import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 768, height: 1024 } })).newPage();
await p.goto("http://localhost:4103/welcome", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await p.waitForTimeout(3000);
const r = await p.evaluate(() => {
  const foot = document.querySelector(".cpv-reel__foot");
  const spans = foot ? [...foot.children].map((s) => { const b = s.getBoundingClientRect(); return { text: s.textContent.slice(0, 20), left: Math.round(b.left), right: Math.round(b.right) }; }) : null;
  const fr = foot ? foot.getBoundingClientRect() : null;
  const de = document.documentElement;
  return { scrollW: de.scrollWidth, clientW: de.clientWidth, footRect: fr && { left: Math.round(fr.left), right: Math.round(fr.right), width: Math.round(fr.width) }, spans, bodyCS: { overflowX: getComputedStyle(document.body).overflowX }, mainCS: (() => { const m = document.querySelector("main"); return { overflowX: getComputedStyle(m).overflowX, w: m.getBoundingClientRect().width }; })() };
});
console.log(JSON.stringify(r, null, 2));
await b.close();
