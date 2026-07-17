import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * N2 evidence: the exception-first Home rail and the activity-ordered recent
 * projects rail. Seeds guarantee three live exceptions — an overdue Conexon
 * milestone (critical), a stale Conexon proposal, and a QC-stale ICA
 * deliverable — all clearing only by state change.
 */
test("home renders the ranked exception rail with owners and repair verbs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/?demo=1");

  const queue = page.getByRole("region", { name: "Attention queue" });
  await expect(queue).toBeVisible();

  const rows = queue.locator("a.cv-attention-row");
  await expect(rows).toHaveCount(3);

  // Ranked: the critical overdue milestone leads.
  const first = rows.first();
  await expect(first).toHaveAttribute("data-severity", "critical");
  await expect(first).toContainText("Milestone overdue");
  await expect(first).toContainText("Sam Delgado");
  await expect(first).toContainText("Reschedule or complete");

  await expect(queue).toContainText("Nudge client");
  await expect(queue).toContainText("Finish QC");

  await page.screenshot({ path: `${EVIDENCE_DIR}/n2-home-exception-rail.png`, fullPage: true });
});

test("nav drawer recents are ordered by latest project activity", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInDemoWorkspace(page);
  await page.goto("/?demo=1");

  await page.getByRole("button", { name: "More workspace navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(drawer).toBeVisible();

  // All seeded activity belongs to ICA, so it leads; the rest keep workspace order.
  const recents = drawer.locator('[class*="recentProjects"] a');
  await expect(recents).toHaveCount(5);
  await expect(recents.first()).toHaveText(/ICA/);
  await expect(recents.nth(1)).toHaveText(/Schneider \+ EPC/);

  await page.screenshot({ path: `${EVIDENCE_DIR}/n2-drawer-recents.png`, fullPage: true });
});

test("home exception rail holds on a 375px field viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInDemoWorkspace(page);
  await page.goto("/?demo=1");

  const queue = page.getByRole("region", { name: "Attention queue" });
  await expect(queue).toBeVisible();
  await expect(queue).toContainText("Nudge client");
  await expect(queue).toContainText("Finish QC");

  await page.screenshot({ path: `${EVIDENCE_DIR}/n2-home-mobile.png`, fullPage: true });
});
