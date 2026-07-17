const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:4115/login?demo=1");
  await page.getByLabel("Email").fill("e2e.demo@contentco-op.example");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("http://localhost:4115/projects/ica?demo=1&surface=reviews");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "/tmp/ica-reviews-dock.png" });
  await browser.close();
})();
