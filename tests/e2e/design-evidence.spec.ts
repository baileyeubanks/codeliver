import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * Full-page design-evidence captures for the G4 loop. One test, sequential
 * navigations — cheaper than three contexts and the captures are read-only.
 */
test("captures full-page evidence of the core demo surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);

  await page.goto("/?demo=1");
  await expect(
    page.getByRole("heading", { name: /What needs attention/ }),
  ).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE_DIR}/home.png`, fullPage: true });

  await page.goto("/opportunities?demo=1");
  await expect(
    page.getByRole("heading", { name: "Inquiries, clients, and proposal pipeline" }),
  ).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE_DIR}/opportunities.png`, fullPage: true });

  await page.goto("/projects/schneider-epc?demo=1&surface=sequences");
  await expect(page.locator(".cv-timeline").first()).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE_DIR}/sequences-timeline.png`, fullPage: true });
});
