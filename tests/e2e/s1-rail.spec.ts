import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * S1 evidence: the new shell's left rail on desktop (grouped nav, activity-
 * ordered recents, no dead inline top nav) and the preserved mobile pattern.
 */
test("desktop shell shows the grouped left rail with recents", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/?demo=1");

  const rail = page.getByRole("navigation", { name: "Workspace rail" });
  await expect(rail).toBeVisible();
  for (const group of ["Workspace", "Production", "Library", "Admin"]) {
    await expect(rail.getByRole("heading", { name: group })).toBeVisible();
  }
  await expect(rail.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("link", { name: "Field" })).toBeVisible();

  // Activity-ordered recents ride the rail; ICA leads (all seeded activity).
  const recents = rail.getByRole("heading", { name: "Recent projects" }).locator("..").locator("a");
  await expect(recents.first()).toHaveText(/ICA/);

  // The old inline top nav is gone from the header.
  await expect(page.getByRole("navigation", { name: "Primary workspace" })).toHaveCount(0);

  await page.screenshot({ path: `${EVIDENCE_DIR}/s1-rail-desktop.png`, fullPage: true });

  // The rail navigates.
  await rail.getByRole("link", { name: "Field" }).click();
  await expect(page).toHaveURL(/\/field\?demo=1/);
  await expect(rail.getByRole("link", { name: "Field" })).toHaveAttribute("aria-current", "page");
});

test("mobile shell keeps the bottom bar and hides the rail", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInDemoWorkspace(page);
  await page.goto("/?demo=1");

  await expect(page.getByRole("navigation", { name: "Workspace rail" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Mobile workspace" })).toBeVisible();

  await page.screenshot({ path: `${EVIDENCE_DIR}/s1-rail-mobile.png`, fullPage: true });
});
