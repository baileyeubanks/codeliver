import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("an uploaded file stays selected and playable after a direct-link reload", async ({ page }) => {
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
});
