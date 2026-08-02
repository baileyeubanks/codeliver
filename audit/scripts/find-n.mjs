import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto("http://localhost:4103/?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);
const els = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll("body *").forEach((e) => {
    if (e.childElementCount === 0 && e.textContent.trim() === "N") {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      out.push({ tag: e.tagName, cls: (e.className + "").slice(0, 150), parentCls: (e.parentElement.className + "").slice(0, 150), pos: cs.position, rect: { x: Math.round(r.x), y: Math.round(r.y) }, aria: e.getAttribute("aria-label") });
    }
  });
  return out;
});
console.log(JSON.stringify(els, null, 2));
await b.close();
