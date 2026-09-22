import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("an uploaded file stays selected and playable through reload and a canonical review share", async ({ page }) => {
  const origin = process.env.CVP_LOCAL_TEST_ORIGIN ?? "http://localhost:4115";
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("This local-media test requires a loopback preview.");
  await page.goto(`${origin}/projects/schneider-epc?demo=1`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button",{name:"Upload media",exact:true}).click();
  await (await chooser).setFiles(resolve("public/demo/ica-ceo-preview.mp4"));
  await page.getByRole("button",{name:"Review new version",exact:true}).click();
  await expect(page).toHaveURL(/asset=local-upload-/);
  const id = new URL(page.url()).searchParams.get("asset");
  expect(id).toBeTruthy();
  const selection = page.getByRole("combobox",{name:"Latest review media"});
  await expect(selection).toHaveValue(id!);
  await page.reload();
  await expect(selection).toHaveValue(id!);
  await expect.poll(()=>page.locator("video").evaluate((video:HTMLVideoElement)=>({local:video.currentSrc.startsWith("blob:"),loaded:Number.isFinite(video.duration)}))).toEqual({local:true,loaded:true});

  // A created share is canonicalized to /review/<token>; it must continue
  // resolving this uploaded file after the query parameters disappear.
  await page.getByRole("button", { name: "Share project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Approval-needed review", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "Reviewer name", exact: true }).fill("Local QA Reviewer");
  await dialog.getByRole("textbox", { name: "Reviewer email" }).fill("local-qa@example.invalid");
  await dialog.getByRole("button", { name: "Create 1 link", exact: true }).click();
  const link = dialog.locator("a[href*='/review/']");
  await expect(link).toHaveCount(1);
  const shareUrl = await link.getAttribute("href");
  await page.goto(new URL(shareUrl!, origin).href);
  await expect(page).toHaveURL(/\/review\/review-[\w-]+\?demo=1/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ica-ceo-preview");
  await expect.poll(()=>page.locator("video").evaluate((video:HTMLVideoElement)=>({local:video.currentSrc.startsWith("blob:"),loaded:Number.isFinite(video.duration)}))).toEqual({local:true,loaded:true});
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ica-ceo-preview");

  await page.goto(`${origin}/review/review-11111111-2222-4333-8444-555555555555?demo=1`);
  await expect(page.getByText("This review link is invalid or no longer available.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
