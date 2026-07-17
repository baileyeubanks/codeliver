const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://localhost:4115/projects/conexon?demo=1&surface=proposal", { waitUntil: "networkidle" });
  await page.screenshot({ path: "docs/design-evidence/mission-baseline-20260716/38-editor-before.png" });

  const compileBtn = page.getByRole("button", { name: "Compile from rate card" });
  if (await compileBtn.count()) {
    await compileBtn.first().click();
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: "docs/design-evidence/mission-baseline-20260716/38-editor-draft.png", fullPage: true });

  const catalogBtn = page.getByRole("button", { name: /catalog/i });
  if (await catalogBtn.count()) {
    await catalogBtn.first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: "docs/design-evidence/mission-baseline-20260716/38-editor-catalog.png" });

  const cell = page.locator("[data-cell], .estimate-editor td[role='button'], .estimate-editor input").first();
  if (await cell.count()) {
    await cell.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: "docs/design-evidence/mission-baseline-20260716/38-editor-cell.png" });

  await browser.close();
  console.log("editor verification screenshots captured");
})();
