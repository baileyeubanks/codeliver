import { expect, test, type Page } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const MOBILE = { width: 390, height: 844 };

async function openProjects(page: Page, fixture: "loading" | "populated" | "empty" | "error" = "populated") {
  await page.setViewportSize(MOBILE);
  await page.route("**/api/health/ready", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ ready: false }),
  }));
  await signInDemoWorkspace(page);
  await page.goto(`/projects?demo=1&projectsFixture=${fixture}`);
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
}

test.describe("Projects mobile interior geometry", () => {
  test("contains storage status without overlapping the first project card", async ({ page }) => {
    await openProjects(page);

    const notice = page.getByTestId("workspace-storage-notice");
    const firstProject = page.getByTestId("project-card").first();
    await expect(notice).toBeVisible();
    await expect(firstProject).toBeVisible();

    const [noticeBox, projectBox] = await Promise.all([notice.boundingBox(), firstProject.boundingBox()]);
    expect(noticeBox).not.toBeNull();
    expect(projectBox).not.toBeNull();
    expect(noticeBox!.height).toBeLessThanOrEqual(96);
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(projectBox!.y);
  });

  test("has no horizontal overflow and leaves the last content above bottom navigation", async ({ page }) => {
    await openProjects(page);

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    const workspaceMain = await page.locator("#workspace-content").boundingBox();
    expect(workspaceMain).not.toBeNull();
    expect(Math.abs(workspaceMain!.width - MOBILE.width)).toBeLessThanOrEqual(1);
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    expect(widths.body).toBeLessThanOrEqual(widths.viewport);

    const end = page.getByTestId("projects-end");
    const bottomNav = page.getByRole("navigation", { name: "Mobile workspace" });
    await end.scrollIntoViewIfNeeded();
    const [endBox, navBox, copilotBox] = await Promise.all([
      end.boundingBox(),
      bottomNav.boundingBox(),
      page.locator(".cvp-copilot-pill").boundingBox(),
    ]);
    expect(endBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(copilotBox).not.toBeNull();
    expect(workspaceMain!.y + workspaceMain!.height).toBeLessThanOrEqual(navBox!.y + 1);
    expect(copilotBox!.y + copilotBox!.height).toBeLessThanOrEqual(navBox!.y - 8);
    expect(endBox!.y + endBox!.height).toBeLessThanOrEqual(navBox!.y);
  });

  test("shows one coherent visible menu affordance", async ({ page }) => {
    await openProjects(page);

    const menuAffordances = page.locator([
      '[aria-label="Open workspace navigation"]',
      '[aria-label="More workspace navigation"]',
      '[aria-label="Toggle project rail"]',
    ].join(","));

    expect(await menuAffordances.count()).toBeGreaterThanOrEqual(1);
    const visibleCount = await menuAffordances.evaluateAll((elements) =>
      elements.filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).length,
    );
    expect(visibleCount).toBe(1);
  });

  test("keeps every visible Projects action at least 44px tall", async ({ page }) => {
    await openProjects(page);

    const undersized = await page.locator('[data-projects-action="true"]').evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.height < 44;
        })
        .map((element) => ({
          label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
          height: element.getBoundingClientRect().height,
        })),
    );
    expect(undersized).toEqual([]);
  });
});

test.describe("Projects response states", () => {
  test("keeps loading distinct from populated, empty, and error", async ({ page }) => {
    await openProjects(page, "loading");
    const loadingState = page.locator('[data-projects-state="loading"]');
    await expect(loadingState).toBeVisible();
    await expect(loadingState).toContainText("Loading projects");
    await expect(page.locator('[data-projects-state="error"]')).toHaveCount(0);
    await expect(page.locator('[data-projects-state="empty"]')).toHaveCount(0);
    await expect(page.getByTestId("project-list")).toHaveCount(0);
  });

  test("error is visibly distinct from a legitimate empty workspace", async ({ page }) => {
    await openProjects(page, "error");
    const errorState = page.locator('[data-projects-state="error"]');
    await expect(errorState).toBeVisible();
    await expect(errorState.getByRole("heading", { name: "Projects unavailable" })).toBeVisible();
    await expect(errorState.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByText("Create your first project")).toHaveCount(0);

    await page.goto("/projects?demo=1&projectsFixture=empty");
    const emptyState = page.locator('[data-projects-state="empty"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState.getByRole("heading", { name: "Create your first project" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projects unavailable" })).toHaveCount(0);
  });

  test("uses Sapphire Light canon tokens", async ({ page }) => {
    await openProjects(page);

    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const content = getComputedStyle(document.querySelector(".projects-content")!);
      const primary = getComputedStyle(document.querySelector(".projects-primary-action")!);
      return {
        canvas: root.getPropertyValue("--cvp-canvas").trim().toLowerCase(),
        sapphire: root.getPropertyValue("--cvp-blue").trim().toLowerCase(),
        contentBackground: content.backgroundColor,
        primaryBackground: primary.backgroundColor,
      };
    });

    expect(tokens.canvas).toBe("#f7f9fc");
    expect(tokens.sapphire).toBe("#0057ff");
    expect(tokens.contentBackground).toBe("rgb(247, 249, 252)");
    expect(tokens.primaryBackground).toBe("rgb(0, 87, 255)");
  });
});
