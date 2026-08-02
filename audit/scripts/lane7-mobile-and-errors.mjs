// READ-ONLY lane 7: capture small/error surfaces verbatim + mobile nav check at 375x812.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AUDIT_BASE || "http://localhost:4103";
const OUT = path.resolve("audit/shots");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

// --- error surface text capture (desktop, demo auth) ---
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  try {
    const btn = page.getByRole("button", { name: /open local workspace/i });
    await btn.first().waitFor({ timeout: 8000 });
    await btn.first().click();
    await page.waitForTimeout(4000);
  } catch {}
  const targets = ["/review/bogus-token", "/projects/does-not-exist?demo=1", "/definitely-not-a-route?demo=1", "/reviews?demo=1"];
  for (const t of targets) {
    const resp = await page.goto(BASE + t, { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(1200);
    const text = (await page.evaluate(() => document.body?.innerText ?? "")).replace(/\s+/g, " ").trim().slice(0, 800);
    console.log(JSON.stringify({ url: t, status: resp?.status(), text }));
  }
  await ctx.close();
}

// --- mobile 375x812 ---
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  try {
    const btn = page.getByRole("button", { name: /open local workspace/i });
    await btn.first().waitFor({ timeout: 8000 });
    await btn.first().click();
    await page.waitForTimeout(4000);
  } catch {}
  const resp = await page.goto(BASE + "/?demo=1", { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(1500);
  const mobileBar = await page.evaluate(() => {
    const navs = [...document.querySelectorAll("nav")].map((n) => ({
      label: n.getAttribute("aria-label"),
      visible: n.offsetParent !== null,
      links: [...n.querySelectorAll("a,button")].map((e) => e.innerText?.trim() || e.getAttribute("aria-label")).filter(Boolean),
    }));
    return navs;
  });
  await page.screenshot({ path: path.join(OUT, "lane7-mobile-home-375x812.png") });
  console.log(JSON.stringify({ mobileNav: mobileBar }));

  // open the drawer via "More"
  try {
    const more = page.getByRole("button", { name: /more workspace navigation/i });
    await more.first().waitFor({ timeout: 5000 });
    await more.first().click();
    await page.waitForTimeout(800);
    const drawer = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Workspace navigation"]');
      if (!d) return null;
      return [...d.querySelectorAll("a")].map((a) => ({ text: a.innerText?.trim().split("\n")[0], href: a.getAttribute("href") }));
    });
    await page.screenshot({ path: path.join(OUT, "lane7-mobile-drawer-375x812.png") });
    console.log(JSON.stringify({ drawerLinks: drawer }));
  } catch (e) {
    console.log(JSON.stringify({ drawerError: String(e).slice(0, 200) }));
  }
  await ctx.close();
}
await browser.close();
