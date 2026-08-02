import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 768, height: 1024 } })).newPage();
await p.goto("http://localhost:4103/welcome", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await p.waitForTimeout(9000);
const r = await p.evaluate(() => {
  const foot = document.querySelector(".cpv-reel__foot");
  const s = foot.children[0];
  const cs = getComputedStyle(s);
  const range = document.createRange();
  range.selectNodeContents(s);
  const rb = range.getBoundingClientRect();
  return {
    spanRect: s.getBoundingClientRect().toJSON(),
    glyphRect: rb.toJSON(),
    textIndent: cs.textIndent, transform: cs.transform, whiteSpace: cs.whiteSpace,
    letterSpacing: cs.letterSpacing, paddingLeft: cs.paddingLeft, marginLeft: cs.marginLeft,
    footTransform: getComputedStyle(foot).transform,
    vw: innerWidth,
  };
});
console.log(JSON.stringify(r, null, 2));
await b.close();
