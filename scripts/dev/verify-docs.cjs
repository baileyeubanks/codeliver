// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://localhost:4115/projects/ica?demo=1&surface=proposal", { waitUntil: "networkidle" });
  const quoteBtn = page.getByRole("button", { name: /quote cover/i });
  if (await quoteBtn.count()) {
    await quoteBtn.first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: "docs/design-evidence/mission-baseline-20260716/39-quote-cover.png" });
  }
  const invoiceBtn = page.getByRole("button", { name: /^invoice$/i });
  if (await invoiceBtn.count()) {
    await invoiceBtn.first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: "docs/design-evidence/mission-baseline-20260716/39-invoice.png" });
  }
  await browser.close();
  console.log("doc screenshots done");
})();
