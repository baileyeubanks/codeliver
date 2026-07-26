/**
 * Design-QQ surface capture — full visual baseline / regression evidence.
 *
 * Usage:
 *   node scripts/capture-surfaces.mjs [outDir] [--only=name1,name2]
 *
 * Defaults to docs/design-evidence/cpv-cinematic-<date>/.
 * Expects the dev server on http://localhost:4115 (demo mode).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.CVP_BASE_URL ?? "http://localhost:4115";
const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const defaultOut = `docs/design-evidence/cpv-cinematic-${date}`;
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1].split(",") : null;
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outDir = resolve(positional[0] ?? defaultOut);
mkdirSync(outDir, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const shots = [
  { name: "welcome", path: "/welcome", auth: false },
  { name: "login", path: "/login?demo=1", auth: false },
  {
    name: "review-theater",
    path: "/review/demo?demo=1&asset=denie-mcdonald-v4&assets=denie-mcdonald-v4%2Ccharles-drummond-v5&intent=client_review&share=demo-ceraweek-cuts",
    auth: false,
    waitMs: 3200,
  },
  { name: "home", path: "/?demo=1", auth: true, waitFor: "h1" },
  { name: "projects", path: "/projects?demo=1", auth: true, waitFor: "h1" },
  { name: "opportunities", path: "/opportunities?demo=1", auth: true, waitFor: "h1" },
  { name: "reviews", path: "/reviews?demo=1", auth: true, waitFor: "h1" },
  { name: "library", path: "/library?demo=1", auth: true, waitFor: "h1" },
  { name: "activity", path: "/activity?demo=1", auth: true, waitFor: "h1" },
  { name: "cockpit", path: "/projects/schneider-epc?demo=1", auth: true, waitMs: 2500 },
  { name: "cockpit-sequences", path: "/projects/schneider-epc?demo=1&surface=sequences", auth: true, waitFor: ".cv-timeline" },
  { name: "cockpit-plan", path: "/projects/physical-edge-el-paso?demo=1&surface=plan", auth: true, waitMs: 2500 },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
const page = await context.newPage();

// Demo sign-in once; session persists in localStorage for the context.
await page.goto(`${BASE}/login?demo=1`);
await page.getByLabel("Email").fill("e2e.demo@contentco-op.example");
await page.getByLabel("Password", { exact: true }).fill("demo-password");
await page.getByRole("button", { name: "Open local workspace" }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/login"));

// Discover a live internal review URL from the reviews index.
let reviewHref = null;
await page.goto(`${BASE}/reviews?demo=1`);
await page.waitForLoadState("networkidle").catch(() => {});
reviewHref = await page
  .locator('a[href*="/projects/"][href*="/assets/"]')
  .first()
  .getAttribute("href")
  .catch(() => null);

for (const shot of shots) {
  if (only && !only.includes(shot.name)) continue;
  if (shot.auth === false) {
    // fresh unauthenticated context for public surfaces
    const pub = await browser.newContext({ viewport: DESKTOP });
    const pp = await pub.newPage();
    await pp.goto(`${BASE}${shot.path}`);
    await pp.waitForLoadState("networkidle").catch(() => {});
    await pp.waitForTimeout(shot.waitMs ?? 1200);
    await pp.screenshot({ path: `${outDir}/${shot.name}.png`, fullPage: false });
    await pub.close();
    console.log(`captured ${shot.name}`);
    continue;
  }
  await page.goto(`${BASE}${shot.path}`);
  if (shot.waitFor) {
    await page.locator(shot.waitFor).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(shot.waitMs ?? 1400);
  await page.screenshot({ path: `${outDir}/${shot.name}.png`, fullPage: false });
  console.log(`captured ${shot.name}`);
}

if (reviewHref && (!only || only.includes("review-internal"))) {
  await page.goto(`${BASE}${reviewHref}${reviewHref.includes("?") ? "&" : "?"}demo=1`);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${outDir}/review-internal.png`, fullPage: false });
  console.log(`captured review-internal (${reviewHref})`);
}

// Mobile pass on the two most important surfaces.
await page.setViewportSize(MOBILE);
for (const m of [
  { name: "home-mobile", path: "/?demo=1" },
  { name: "cockpit-mobile", path: "/projects/schneider-epc?demo=1" },
]) {
  if (only && !only.includes(m.name)) continue;
  await page.goto(`${BASE}${m.path}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${outDir}/${m.name}.png`, fullPage: false });
  console.log(`captured ${m.name}`);
}

await browser.close();
console.log(`\nEvidence in ${outDir}`);
