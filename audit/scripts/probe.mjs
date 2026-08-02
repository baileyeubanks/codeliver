// READ-ONLY probe: computed styles, colors, fonts, spacing, overflow, button inventory.
// Usage: node audit/scripts/probe.mjs audit/scripts/probe-targets.json
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:4103";
const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const browser = await chromium.launch();
const out = [];

for (const job of jobs) {
  const [w, h] = (job.viewport || "1440x900").split("x").map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const url = BASE + job.url;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    if (job.auth && page.url().includes("/login")) {
      const btn = page.getByRole("button", { name: /open local workspace/i });
      try {
        await btn.first().waitFor({ timeout: 10000 });
        await btn.first().click();
        await page.waitForTimeout(4000);
        const target = url.includes("demo=1") ? url : url + (url.includes("?") ? "&" : "?") + "demo=1";
        await page.goto(target, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      } catch {}
    }
    await page.waitForTimeout(job.wait ?? 2500);

    const data = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("body *")).filter(
        (e) => e.offsetParent !== null || ["BODY","HTML"].includes(e.tagName)
      );
      const fonts = new Set(), sizes = new Map(), colors = new Map(), bgs = new Map(), weights = new Set();
      for (const el of els) {
        const cs = getComputedStyle(el);
        fonts.add(cs.fontFamily.split(",")[0].trim().replace(/"/g, ""));
        sizes.set(cs.fontSize, (sizes.get(cs.fontSize) || 0) + 1);
        if (cs.color && cs.color !== "rgba(0, 0, 0, 0)") colors.set(cs.color, (colors.get(cs.color) || 0) + 1);
        if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") bgs.set(cs.backgroundColor, (bgs.get(cs.backgroundColor) || 0) + 1);
        weights.add(cs.fontWeight);
      }
      // overflow
      const de = document.documentElement;
      const overflowX = de.scrollWidth > de.clientWidth + 1;
      let offenders = [];
      if (overflowX) {
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.right > de.clientWidth + 1 || r.left < -1) {
            const cls = (el.className && typeof el.className === "string") ? el.className.slice(0, 80) : "";
            offenders.push(`${el.tagName}.${cls} right=${Math.round(r.right)} left=${Math.round(r.left)}`);
          }
        }
        offenders = offenders.slice(0, 12);
      }
      // buttons & links inventory
      const controls = Array.from(document.querySelectorAll("button, a[href], input, select, textarea")).map((el) => {
        const label = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 70);
        const href = el.getAttribute("href");
        return `${el.tagName}${el.disabled ? "[disabled]" : ""}: "${label}"${href ? " -> " + href : ""}`;
      });
      const main = document.querySelector("main") || document.body;
      const mcs = getComputedStyle(main);
      return {
        title: document.title,
        finalUrl: location.href,
        fonts: [...fonts], weights: [...weights],
        sizes: Object.fromEntries([...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
        colors: Object.fromEntries([...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)),
        backgrounds: Object.fromEntries([...bgs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)),
        bodyFont: getComputedStyle(document.body).fontFamily,
        overflowX, scrollW: de.scrollWidth, clientW: de.clientWidth, offenders,
        mainPadding: mcs.padding,
        controls,
      };
    });
    out.push({ job: { url: job.url, viewport: job.viewport }, data });
  } catch (e) {
    out.push({ job, error: String(e) });
  }
  await ctx.close();
}
fs.mkdirSync("audit/data", { recursive: true });
fs.writeFileSync("audit/data/lane1a-probe.json", JSON.stringify(out, null, 2));
console.log("wrote audit/data/lane1a-probe.json", out.length, "entries");
await browser.close();
