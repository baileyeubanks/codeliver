import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2 })).newPage();
await p.goto("file://" + path.join(DIR, "orchestration-cockpit.html"), { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(900);

const report = await p.evaluate(() => {
  const out = { overflow: [], clipped: [], contrast: [], radius: [], offgrid: [], empty: [], doc: {} };
  const de = document.documentElement;
  out.doc = { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight };

  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgb = (v) => { cx.fillStyle = "#123456"; cx.fillStyle = v; if (cx.fillStyle === "#123456" && v !== "#123456") return null;
    cx.clearRect(0,0,1,1); cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]; };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const L = ([r,g,b]) => 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  const over = (fg, bg) => { const a = fg[3]; return [0,1,2].map(i => fg[i]*a + bg[i]*(1-a)); };
  const effBg = (el) => { let e = el;
    while (e) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.999) return c;
      if (c && c[3] > 0) { const under = effBg(e.parentElement || document.body); return [...over(c, under), 1]; }
      e = e.parentElement; } return [12,14,17,1]; };
  const ratio = (a, b) => { const l1 = L(a), l2 = L(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };

  const label = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0,2).join(".") : "");

  document.querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    // content wider/taller than its own box => clipped or overflowing
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible")
      out.clipped.push({ el: label(el), scrollW: el.scrollWidth, clientW: el.clientWidth, text: (el.innerText||"").slice(0,40) });
    if (el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== "visible")
      out.clipped.push({ el: label(el), scrollH: el.scrollHeight, clientH: el.clientHeight, text: (el.innerText||"").slice(0,40) });

    // any element sticking out of the viewport
    if (r.right > 1920.5 || r.bottom > 1200.5 || r.left < -0.5 || r.top < -0.5)
      out.overflow.push({ el: label(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], text: (el.innerText||"").slice(0,40) });

    // radius discipline
    const rad = parseFloat(cs.borderTopLeftRadius);
    if (rad > 0 && ![8, 12].includes(Math.round(rad)) && rad < 100)
      out.radius.push({ el: label(el), rad });

    // text contrast
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").trim();
    if (own) {
      const fg = rgb(cs.color), bg = effBg(el);
      if (fg) {
        const c = ratio(over(fg, bg), bg);
        const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        if (c < need) out.contrast.push({ text: own.slice(0,42), el: label(el), size, ratio: +c.toFixed(2), need });
      }
    }
  });

  // panels that render nothing
  document.querySelectorAll(".panel, .cell, .lane").forEach((el) => {
    if (!el.innerText.trim() && !el.querySelector("img, svg, .track, .lane-bar, .phase-dot, .need-edge, .obj-node"))
      if (!el.classList.contains("lane")) out.empty.push(label(el));
  });
  return out;
});

const trim = (a, n = 8) => a.slice(0, n);
console.log(JSON.stringify({
  doc: report.doc,
  overflowCount: report.overflow.length, overflow: trim(report.overflow),
  clippedCount: report.clipped.length, clipped: trim(report.clipped),
  contrastCount: report.contrast.length, contrast: trim(report.contrast, 12),
  radiusCount: report.radius.length, radius: trim(report.radius),
  emptyCount: report.empty.length, empty: trim(report.empty),
}, null, 2));
await b.close();
