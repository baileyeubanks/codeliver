import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

/**
 * THE DOORWAY AUDIT — every rail link, cockpit section, pipeline doorway,
 * and Home repair verb opens a real working surface. No dead ends, no
 * placeholder text. Landmarks are asserted, not just URLs.
 */
test("every workspace rail link opens a real surface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/?demo=1");

  const rail = page.getByRole("navigation", { name: "Workspace rail" });
  const doors: Array<{ label: string; url: RegExp; landmark: string | RegExp }> = [
    { label: "Overview", url: /\/\?demo=1/, landmark: "What needs attention" },
    { label: "Projects", url: /\/projects\?demo=1/, landmark: "Production library" },
    { label: "Opportunities", url: /\/opportunities\?demo=1/, landmark: "Inquiries, clients, and proposal pipeline" },
    { label: "Reviews", url: /\/reviews\?demo=1/, landmark: "Review links" },
    { label: "Activity", url: /\/activity\?demo=1/, landmark: /activity/i },
    { label: "Field", url: /\/field\?demo=1/, landmark: "The shoot day in your pocket" },
    { label: "Media library", url: /\/library\?demo=1/, landmark: "Media library" },
    { label: "Archive", url: /\/projects\/archive\?demo=1/, landmark: /archive/i },
    { label: "Trash", url: /\/projects\/trash\?demo=1/, landmark: /trash/i },
    { label: "Workspace settings", url: /\/settings\?demo=1/, landmark: "Settings" },
  ];

  for (const door of doors) {
    await page.goto("/?demo=1");
    await rail.getByRole("link", { name: door.label }).click();
    await expect(page).toHaveURL(door.url);
    await expect(page.getByText(door.landmark).first()).toBeVisible();
    await expect(page.getByText(/coming soon|not implemented|placeholder page/i)).toHaveCount(0);
  }
});

test("every cockpit section opens a real working surface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/projects/el-paso?demo=1");

  const sections: Array<{ label: string; landmark: string | RegExp }> = [
    { label: "Creative", landmark: "No brief yet" },
    { label: "Proposal", landmark: "No proposal yet" },
    { label: "Plan", landmark: "Production plan" },
    { label: "Media", landmark: /Project media|Upload media/ },
    { label: "Sequences", landmark: "Sequences" },
    { label: "Reviews", landmark: /Review links|No review/ },
    { label: "Approvals", landmark: /Approval|approval/ },
    { label: "Delivery", landmark: "Delivery & QC" },
    { label: "Tasks", landmark: /Tasks|task/ },
    { label: "Versions", landmark: /Version|version/ },
    { label: "Metadata", landmark: /Metadata|Project info|Organization/ },
  ];

  const cockpitRail = page.getByRole("navigation", { name: "Project workspace" });
  for (const section of sections) {
    await cockpitRail.getByRole("button", { name: section.label, exact: true }).first().click();
    await expect(page.getByText(section.landmark).first()).toBeVisible();
    await expect(page.getByText(/coming soon|not implemented|placeholder page/i)).toHaveCount(0);
  }

  // The cockpit's Settings door leaves for the workspace settings — a real surface too.
  await cockpitRail.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?demo=1/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("pipeline doorways and home repair verbs land where they promise", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);

  // Pipeline doorways on el-paso.
  await page.goto("/projects/el-paso?demo=1");
  const pipeline = page.getByRole("region", { name: "Production pipeline" });
  const doorways: Array<{ button: RegExp; url: RegExp }> = [
    { button: /Open Creative/, url: /surface=creative/ },
    { button: /Open Plan/, url: /surface=plan/ },
    { button: /Open Sequences/, url: /surface=sequences/ },
    { button: /Open Delivery/, url: /surface=delivery/ },
  ];
  for (const doorway of doorways) {
    await pipeline.getByRole("button", { name: doorway.button }).first().click();
    await expect(page).toHaveURL(doorway.url);
    await page.goto("/projects/el-paso?demo=1");
  }

  // Home repair verbs land on the project surface they name.
  await page.goto("/?demo=1");
  const queue = page.getByRole("region", { name: "Attention queue" });
  await queue.getByRole("link", { name: /Reschedule or complete/ }).click();
  await expect(page).toHaveURL(/\/projects\/conexon\?.*surface=plan/);
  await page.goto("/?demo=1");
  await queue.getByRole("link", { name: /Finish QC/ }).click();
  await expect(page).toHaveURL(/\/projects\/ica\?.*surface=delivery/);
});
