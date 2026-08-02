// Lane 4 R3 runtime check: demo persistence is browser-local.
// READ-ONLY w.r.t. the app/server; only touches browser localStorage in a
// throwaway Playwright profile (explicitly allowed by the audit brief).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:4103";
const OUT = "audit/shots";
fs.mkdirSync(OUT, { recursive: true });
const KEY = "co-videopro.workspace.v2";

const browser = await chromium.launch();
const results = {};

async function demoLogin(page) {
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  if (page.url().includes("/login")) {
    const btn = page.getByRole("button", { name: /open local workspace/i });
    await btn.first().waitFor({ timeout: 10000 });
    await btn.first().click();
    await page.waitForTimeout(3000);
  }
}

function readWorkspace(page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: parsed.schemaVersion,
      projectNames: (parsed.projects ?? []).map((p) => p.name ?? p.title ?? p.id),
      assetCount: (parsed.assets ?? []).length,
      inquiryCount: (parsed.inquiries ?? []).length,
      shareLinkCount: (parsed.shareLinks ?? []).length,
      bytes: raw.length,
    };
  }, KEY);
}

// --- Context A: fresh browser profile -------------------------------------
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageA = await ctxA.newPage();
await demoLogin(pageA);
await pageA.goto(BASE + "/?demo=1", { waitUntil: "networkidle" }).catch(() => {});
await pageA.waitForTimeout(2500);
results.freshContext_afterDemoLogin = await readWorkspace(pageA);
await pageA.screenshot({ path: `${OUT}/lane4-home-fresh.png` });

// --- EDIT: rename first project via localStorage (demo-local only) ---------
await pageA.evaluate((key) => {
  const raw = window.localStorage.getItem(key);
  const parsed = JSON.parse(raw);
  parsed.projects[0].name = "AUDIT-RENAMED " + (parsed.projects[0].name ?? "project");
  window.localStorage.setItem(key, JSON.stringify(parsed));
}, KEY);

// --- Hard reload, same context ---------------------------------------------
await pageA.reload({ waitUntil: "networkidle" });
await pageA.waitForTimeout(2500);
results.sameContext_afterHardReload = await readWorkspace(pageA);
await pageA.screenshot({ path: `${OUT}/lane4-home-after-rename-reload.png` });

// --- Context B: brand-new incognito-like context ---------------------------
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageB = await ctxB.newPage();
await demoLogin(pageB);
await pageB.goto(BASE + "/?demo=1", { waitUntil: "networkidle" }).catch(() => {});
await pageB.waitForTimeout(2500);
results.freshIncognitoContext = await readWorkspace(pageB);
await pageB.screenshot({ path: `${OUT}/lane4-home-incognito.png` });

// --- Media blob store: check IndexedDB presence -----------------------------
results.indexedDBs_contextA = await pageA.evaluate(async () => {
  if (!indexedDB.databases) return "unsupported";
  return (await indexedDB.databases()).map((d) => d.name);
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
