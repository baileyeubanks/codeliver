import { expect, type Page } from "@playwright/test";

export const DEMO_EMAIL = "e2e.demo@contentco-op.example";
export const DEMO_PASSWORD = "demo-password";

/**
 * Authenticate a fresh browser context against the local demo workspace.
 * Any email + password is accepted in demo mode; the session persists in
 * localStorage for the lifetime of the context.
 */
export async function signInDemoWorkspace(page: Page) {
  await page.goto("/login?demo=1");
  await expect(
    page.getByRole("heading", { name: "Sign in to Co-VideoPro" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
