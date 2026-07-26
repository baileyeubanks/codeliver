import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * S2 evidence: the Production Pipeline strip on the project overview —
 * four stages with real state, progress, owners, next actions, and doorways
 * into the cockpit studios.
 */
test("el paso overview renders the pipeline strip with real stage data", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/projects/el-paso?demo=1");

  const pipeline = page.getByRole("region", { name: "Production pipeline" });
  await expect(pipeline).toBeVisible();

  // Pre-production is active at 30%: days scheduled + listed, no brief/proposal/signed releases.
  const pre = pipeline.locator("article").first();
  await expect(pre).toContainText("Pre-Production");
  await expect(pre).toContainText("Active");
  await expect(pre.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
  await expect(pre).toContainText("Owner · Producer");
  await expect(pre).toContainText("Next · Lock the brief");

  // The other three stages read upcoming at 0.
  for (const label of ["Production", "Post-Production", "Delivery & Assets"]) {
    await expect(pipeline).toContainText(label);
  }
  await expect(pipeline.getByRole("progressbar").nth(1)).toHaveAttribute("aria-valuenow", "0");

  await page.screenshot({ path: `${EVIDENCE_DIR}/s2-pipeline-strip.png`, fullPage: true });

  // Doorway: Pre-production opens the Creative studio (brief not locked).
  await pre.getByRole("button", { name: /Open Creative/ }).click();
  await expect(page).toHaveURL(/surface=creative/);
});

test("ica overview shows complete early phases with post active", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/projects/ica?demo=1");

  const pipeline = page.getByRole("region", { name: "Production pipeline" });
  await expect(pipeline).toBeVisible();
  const bars = pipeline.getByRole("progressbar");
  await expect(bars.nth(0)).toHaveAttribute("aria-valuenow", "100");
  await expect(bars.nth(1)).toHaveAttribute("aria-valuenow", "100");
  await expect(pipeline.locator("article").nth(2)).toContainText("Active");
});
