import { expect, test } from "@playwright/test";
import { signInDemoWorkspace } from "./demo-auth";

const EVIDENCE_DIR = "docs/design-evidence/e2e";

/**
 * THE LIFECYCLE — the mission's acceptance walk. One inquiry becomes one
 * project, and the whole production thread runs on its record: inquiry →
 * brief → proposal → plan → production → media → review → delivery. Every
 * step is a real verb on the demo workspace; the pipeline strip reads the
 * journey back at the end.
 */
test("the full lifecycle runs on one connected record", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInDemoWorkspace(page);

  /* 1 · INQUIRY — captured in the inbox */
  await page.goto("/opportunities?demo=1");
  await page.getByRole("button", { name: "New inquiry" }).click();
  const compose = page.getByRole("region", { name: "New inquiry" });
  await compose.getByPlaceholder("What are they asking for? Scope, dates, references…").fill(
    "Recruitment film for the 2027 lineworker cohort — hero film plus two social cutdowns.",
  );
  await compose.getByPlaceholder("Company (optional)").fill("Pedernales Electric");
  await compose.getByPlaceholder("Person (optional)").fill("Riley Hart");
  await compose.getByPlaceholder("email@company.com").fill("riley@pedernales.example");
  await compose.getByRole("button", { name: "Save inquiry" }).click();

  const inbox = page.getByRole("region", { name: "Inquiries" });
  const inquiry = inbox.locator("article", { hasText: "Recruitment film for the 2027 lineworker cohort" });
  await expect(inquiry).toBeVisible();
  await inquiry.getByRole("button", { name: "Triage" }).click();
  await inquiry.getByRole("button", { name: "Qualify" }).click();
  await inquiry.getByRole("button", { name: "Convert to project" }).click();
  await inquiry.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("status")).toContainText(/convert|project/i);

  /* 2 · The project exists — and the pipeline names its first move */
  await page.goto("/projects?demo=1");
  await page.getByRole("link", { name: /Pedernales Electric — New project/ }).first().click();
  await expect(page).toHaveURL(/\/projects\/project-/);
  const pipeline = page.getByRole("region", { name: "Production pipeline" });
  await expect(pipeline).toBeVisible();
  await expect(pipeline).toContainText("Lock the brief");

  /* 3 · BRIEF — drafted, submitted, approved */
  await page.goto(page.url().split("?")[0] + "?demo=1&surface=creative");
  await page.getByRole("button", { name: /Draft brief|Revise brief/ }).click();
  await page.getByPlaceholder("What must this production achieve?").fill(
    "Recruit the 2027 lineworker cohort — applications up year over year.",
  );
  await page.getByPlaceholder("Who is it for?").fill("High-school and trade-school graduates across the Hill Country.");
  await page.getByPlaceholder("The one thing it must say").fill("This work keeps the lights on — and it needs you.");
  await page.getByLabel("Deliverables notes").fill("Hero recruitment film, two social cutdowns (9:16), captioned masters.");
  await page.getByRole("button", { name: /Save v1|Save as v/ }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByRole("button", { name: "Approve brief" }).click();
  await expect(page.getByRole("status")).toContainText(/approved/i);

  /* 4 · PROPOSAL — compiled from the rate card, sent, accepted */
  await page.goto(page.url().split("?")[0].replace("surface=creative", "") + "?demo=1&surface=proposal");
  await page.getByRole("button", { name: "Compile from rate card" }).click();
  await expect(page.getByRole("status")).toContainText(/compiled/i);
  await page.getByRole("button", { name: "Send to internal review" }).click();
  await page.getByRole("button", { name: "Mark sent to client" }).click();
  await page.getByRole("button", { name: "Record client approval" }).click();
  await expect(page.getByRole("status")).toContainText(/approved/i);

  /* 5 · PLAN — the shoot day is on the board */
  await page.goto(page.url().split("?")[0].replace("surface=proposal", "") + "?demo=1&surface=plan");
  const planForm = page.locator("form", { has: page.getByLabel("Assignee") });
  await planForm.locator("select").first().selectOption("production_day");
  await planForm.getByPlaceholder(/title/i).fill("Cohort shoot — day 1");
  await planForm.locator('input[type="date"]').fill("2026-08-24");
  await planForm.getByLabel("Assignee").fill("Bailey + Marcus");
  await planForm.getByRole("button", { name: /Add/ }).click();
  await expect(page.getByText("Cohort shoot — day 1")).toBeVisible();

  /* 6 · PRODUCTION — the day gets done */
  const dayRow = page.locator("article", { hasText: "Cohort shoot — day 1" });
  await dayRow.getByRole("button", { name: "Mark in progress" }).click();
  await dayRow.getByRole("button", { name: "Mark done" }).click();

  /* 7 · MEDIA — the file joins the record */
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "cohort-day1-selects.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-bytes"),
  });
  await expect(page.getByText(/ready in this project|Upload media/i).first()).toBeVisible({ timeout: 30000 });
  await page.goto(page.url().split("?")[0].replace("surface=plan", "") + "?demo=1");
  await expect(page.locator("option", { hasText: "cohort-day1-selects" })).toBeAttached({ timeout: 30000 });

  /* 8 · REVIEW — a timecoded note lands on the cut */
  const composer = page.locator(".cockpit-comment-composer").first();
  await composer.getByLabel("Comment").fill("Open on the dawn climb, not the yard.");
  await composer.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByText("Open on the dawn climb, not the yard.")).toBeVisible();

  /* 9 · DELIVERY — specced against the uploaded cut, gated, shipped */
  await page.goto(page.url().split("?")[0].replace("?demo=1", "") + "?demo=1&surface=delivery");
  const specForm = page.locator("form", { has: page.getByLabel("Deliverable name") });
  await specForm.getByLabel("Deliverable name").fill("PEDERNALES_COHORT_HERO_16x9.mp4");
  await specForm.getByLabel("Source version").selectOption({ label: "cohort-day1-selects · v1" });
  await specForm.getByRole("button", { name: /Spec deliverable/ }).click();
  const deliverable = page.locator("article", { hasText: "PEDERNALES_COHORT_HERO_16x9.mp4" });
  await expect(deliverable).toBeVisible();
  await deliverable.getByRole("button", { name: "Move to encoding" }).click();
  // QC needs a frozen source version — spec it against the uploaded asset's version? (blocked if none)
  await deliverable.getByRole("button", { name: "Move to qc" }).click();
  const gates = deliverable.getByRole("checkbox");
  const gateCount = await gates.count();
  for (let index = 0; index < gateCount; index += 1) {
    await gates.nth(index).click();
  }
  await deliverable.getByRole("button", { name: "Move to ready" }).click();
  await deliverable.getByRole("button", { name: "Move to delivered" }).click();
  await expect(deliverable).toContainText("delivered");

  /* 10 · The pipeline reads the journey back */
  await page.goto(page.url().split("?")[0].replace("surface=delivery", "") + "?demo=1");
  const finalPipeline = page.getByRole("region", { name: "Production pipeline" });
  await expect(finalPipeline.getByRole("progressbar").nth(3)).toHaveAttribute("aria-valuenow", "100");

  await page.screenshot({ path: `${EVIDENCE_DIR}/lifecycle-final-overview.png`, fullPage: true });
});
