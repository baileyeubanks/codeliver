import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * T5 evidence: the shot list board on the El Paso plan surface. Nine seeded
 * shots across three principal days, all planned — covering one updates the
 * roll-up live, because readiness is derived, never stored.
 */
test("el paso plan surface renders the shot list with readiness roll-up", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/projects/el-paso?demo=1&surface=plan");

  const rollup = page.getByRole("heading", { name: /Shot list — 0\/9 covered · must 0\/6/ });
  await expect(rollup).toBeVisible();

  const shotLine = page.getByText("Adam interview — A-cam, slow push-in on the boards");
  await expect(shotLine).toBeVisible();

  // Cover the interview shot; the roll-up must move.
  await shotLine.locator("xpath=..").getByRole("button", { name: "Mark covered" }).click();
  await expect(page.getByRole("heading", { name: /Shot list — 1\/9 covered · must 1\/6/ })).toBeVisible();

  await page.screenshot({ path: `${EVIDENCE_DIR}/t5-shot-list.png`, fullPage: true });
});

test("adding a shot through the inline form grows the day's list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/projects/el-paso?demo=1&surface=plan");

  const dayRow = page.getByText("2026-08-18 — 0/4 covered");
  await expect(dayRow).toBeVisible();
  await dayRow.locator("xpath=../..").getByRole("button", { name: "+ Add shot" }).click();

  await page.getByLabel("Shot scene").fill("Plant exterior");
  await page.getByLabel("Shot description").fill("Drone pull-back over the basins at dusk");
  await page.getByLabel("Shot size").selectOption("aerial");
  await page.getByLabel("Shot priority").selectOption("nice");
  await page.getByRole("button", { name: "Add shot", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Shot list — 0\/10 covered/ })).toBeVisible();
  await expect(page.getByText("Drone pull-back over the basins at dusk")).toBeVisible();
});
