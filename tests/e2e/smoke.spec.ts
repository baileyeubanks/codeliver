import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

/**
 * G4 smoke flows over the local demo workspace. Every test runs in a fresh
 * browser context, so demo seed state (localStorage) is pristine and tests
 * are order-independent.
 */
test.describe("Co‑VideoPro demo smoke", () => {
  test("login page renders and demo sign-in lands in the workspace", async ({ page }) => {
    await page.goto("/");

    // Unauthenticated visits bounce to the demo login page.
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Sign in to Co‑VideoPro" }),
    ).toBeVisible();

    await page.getByLabel("Email").fill("e2e.login@contentco-op.example");
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    await page.getByRole("button", { name: "Open local workspace" }).click();

    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await expect(
      page.getByRole("heading", { name: /What needs attention/ }),
    ).toBeVisible();
  });

  test("home shows the attention queue and productions-by-stage rail", async ({ page }) => {
    await signInDemoWorkspace(page);
    await page.goto("/?demo=1");

    await expect(
      page.getByRole("heading", { name: /What needs attention/ }),
    ).toBeVisible();

    const queue = page.getByRole("region", { name: "Attention queue" });
    await expect(queue.locator("a").first()).toBeVisible();
    expect(await queue.locator("a").count()).toBeGreaterThan(0);

    await expect(
      page.getByRole("heading", { name: "Productions by stage" }),
    ).toBeVisible();
  });

  test("opportunities inbox triages the HLSR inquiry", async ({ page }) => {
    await signInDemoWorkspace(page);
    await page.goto("/opportunities?demo=1");

    const inbox = page.getByRole("region", { name: "Inquiries" });
    const inquiry = inbox.locator("article", {
      hasText: "2027 season: 20-day coverage",
    });
    await expect(inquiry).toBeVisible();
    await expect(inquiry.getByText("New", { exact: true })).toBeVisible();

    await inquiry.getByRole("button", { name: "Triage" }).click();

    await expect(inquiry.getByText("Triaged", { exact: true })).toBeVisible();
    await expect(inquiry.getByRole("button", { name: "Qualify" })).toBeVisible();
  });

  test("creative surface approves brief v2 for Conexon", async ({ page }) => {
    await signInDemoWorkspace(page);
    await page.goto("/projects/conexon?demo=1&surface=creative");

    const brief = page.getByRole("region", { name: "Current brief" });
    await expect(brief.getByText("v2", { exact: true })).toBeVisible();
    await expect(brief.getByText("in review", { exact: true })).toBeVisible();

    await brief.getByRole("button", { name: "Approve brief" }).click();

    await expect(brief.getByText("approved", { exact: true })).toBeVisible();
  });

  test("sequences surface renders the Schneider timeline with 3 clips", async ({ page }) => {
    await signInDemoWorkspace(page);
    await page.goto("/projects/schneider-epc?demo=1&surface=sequences");

    const timeline = page.locator(".cv-timeline").first();
    await expect(timeline).toBeVisible();
    await expect(timeline.locator(".cv-timeline__clip")).toHaveCount(3);

    await expect(
      page.getByRole("button", { name: "Propose 90s radio cut" }),
    ).toBeVisible();
  });
});
