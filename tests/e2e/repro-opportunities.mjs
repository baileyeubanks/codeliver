/* Repro: sign in, then hit /opportunities?demo=1 and capture client errors. */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:4115";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on("pageerror", (err) => console.log("PAGEERROR:", err.message, "\n", err.stack));
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    console.log(`CONSOLE[${msg.type()}]:`, msg.text().slice(0, 2000));
  }
});

for (let attempt = 1; attempt <= 5; attempt++) {
  console.log(`--- attempt ${attempt} ---`);
  await page.goto(`${BASE}/login?demo=1`);
  await page.getByLabel("Email").fill("e2e.demo@contentco-op.example");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(`${BASE}/opportunities?demo=1`);
  await page.waitForTimeout(4000);
  const bodyText = await page.locator("body").innerText();
  console.log("error boundary?", bodyText.includes("needs a quick refresh"));
  console.log("hlsr present?", bodyText.includes("Houston Livestock"));
  await context.clearCookies();
  await page.evaluate(() => window.localStorage.clear());
}

await browser.close();
