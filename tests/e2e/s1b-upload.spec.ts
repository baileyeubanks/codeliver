import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * S1b evidence: the top command bar's Upload flow — project picker, file
 * registration in the local workspace, then a landing in that project's
 * cockpit with the new asset present.
 */
test("command bar upload registers media into the chosen project", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);
  await page.goto("/?demo=1");

  await page.getByRole("button", { name: "Upload media to a project" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload media" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Files join a project's record");

  await dialog.locator("select").selectOption("el-paso");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "desal-control-room-broll.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-bytes"),
  });
  await expect(dialog).toContainText("desal-control-room-broll.mp4");

  await page.screenshot({ path: `${EVIDENCE_DIR}/s1b-upload-dialog.png`, fullPage: true });

  await dialog.getByRole("button", { name: /Upload 1/ }).click();

  await expect(page).toHaveURL(/\/projects\/el-paso\?demo=1/);
  await expect(page.locator("option", { hasText: "desal-control-room-broll" })).toBeAttached({ timeout: 15000 });
});
