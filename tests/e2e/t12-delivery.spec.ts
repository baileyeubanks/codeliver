import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * T12 evidence: the Delivery & QC surface — spec-derived QC gates blocking
 * the ready state until every gate passes, then the generated manifest.
 */
test("qc gates block ready until every check passes; manifest proves the shipment", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/projects/ica?demo=1&surface=delivery");

  const social = page.locator("article", { hasText: "ICA_ROADSHOW_SOCIAL_9x16.mp4" });
  await expect(social).toBeVisible();
  await expect(social).toContainText("QC 2/7");

  const readyButton = social.getByRole("button", { name: "Move to ready" });
  await expect(readyButton).toBeDisabled();

  // Pass the remaining five gates.
  for (const gate of ["Codec matches", "Frame matches", "Captions present", "Audio conforms", "Plays start to end"]) {
    await social.getByRole("checkbox").locator("..").filter({ hasText: gate }).locator("input").click();
  }
  await expect(social).toContainText("QC 7/7");
  await expect(readyButton).toBeEnabled();
  await readyButton.click();
  await expect(social).toContainText("ready");

  // The manifest proves the shipment on paper.
  await page.getByRole("button", { name: "Generate manifest" }).click();
  const manifest = page.locator("pre");
  await expect(manifest).toContainText("DELIVERY MANIFEST — ICA");
  await expect(manifest).toContainText("ICA_ROADSHOW_SOCIAL_9x16.mp4");
  await expect(manifest).toContainText("QC: 7/7 checks passed — CLEAR");

  await page.screenshot({ path: `${EVIDENCE_DIR}/t12-delivery-qc.png`, fullPage: true });
});
