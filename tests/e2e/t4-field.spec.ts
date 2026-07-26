import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * T4 evidence: the mobile field workspace at 375px. Defaults to the project
 * with the nearest shoot (El Paso), anchors on the nearest day (the Aug 17
 * scout), and the day chips switch into the principal days' shot lists with
 * 44px cover verbs.
 */
test("field view anchors on the nearest day and covers shots at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInDemoWorkspace(page);
  await page.goto("/field?demo=1");

  // Default project = El Paso (nearest shoot); anchor day = the Aug 17 scout.
  await expect(page.getByLabel("Field project")).toHaveValue("el-paso");
  const dayCard = page.getByRole("region", { name: "Field day" });
  await expect(dayCard).toContainText("2026-08-17");
  await expect(dayCard).toContainText("scout");

  // Scout day: no shot list section (only principal days owe the edit).
  await expect(page.getByRole("region", { name: "Shot list" })).toHaveCount(0);

  // Switch to the principal day; its shot list appears.
  await page.getByRole("button", { name: "08-18 · principal" }).click();
  const shotList = page.getByRole("region", { name: "Shot list" });
  await expect(shotList).toBeVisible();
  await expect(shotList).toContainText("0/4 covered · must 0/3");

  await shotList.getByRole("button", { name: "Mark covered" }).first().click();
  await expect(shotList).toContainText("1/4 covered · must 1/3");

  // Releases for the day ride along, with the chase verb.
  const releases = page.getByRole("region", { name: "Releases" });
  await expect(releases).toContainText("Adam Wickersham");

  await page.screenshot({ path: `${EVIDENCE_DIR}/t4-field-mobile.png`, fullPage: true });
});
