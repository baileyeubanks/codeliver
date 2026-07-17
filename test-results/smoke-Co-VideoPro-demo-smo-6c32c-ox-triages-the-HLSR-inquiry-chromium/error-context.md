# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Co-VideoPro demo smoke >> opportunities inbox triages the HLSR inquiry
- Location: tests/e2e/smoke.spec.ts:46:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByRole('region', { name: 'Inquiries' }).locator('article').filter({ hasText: '2027 season: 20-day coverage' }).getByText('New', { exact: true })
Expected: visible
Received: hidden
Timeout:  15000ms

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('region', { name: 'Inquiries' }).locator('article').filter({ hasText: '2027 season: 20-day coverage' }).getByText('New', { exact: true })
    34 × locator resolved to <span class="demo-pill">New</span>
       - unexpected value "hidden"

```

```yaml
- link "Skip to workspace content":
  - /url: "#workspace-content"
- banner:
  - link "Co-VideoPro home":
    - /url: /?demo=1
    - img "Co-VideoPro by Content Co-op"
  - navigation "Primary workspace":
    - link "Home":
      - /url: /?demo=1
    - link "Projects":
      - /url: /projects?demo=1
    - link "Pipeline":
      - /url: /opportunities?demo=1
    - link "Reviews":
      - /url: /reviews?demo=1
    - link "Library":
      - /url: /library?demo=1
    - link "Activity":
      - /url: /activity?demo=1
  - button "Search commands, projects, and media"
  - link "Email help and feedback":
    - /url: mailto:hello@contentco-op.com?subject=Co-Production%20Pro%20feedback
  - button "Notifications"
  - button "Open account menu": BE
- main:
  - paragraph: Opportunities
  - heading "Inquiries, clients, and proposal pipeline" [level=1]
  - paragraph: Where new work becomes a production. Qualify inquiries, keep client context, and move proposals to approval.
  - button "New inquiry"
  - region "Inquiries":
    - heading "Inbox (2)" [level=2]
    - article:
      - text: Houston Livestock Show and Rodeo
      - paragraph: "2027 season: 20-day coverage, daily social cuts + a 6-minute season film. References our 2025 rodeo recap work."
      - paragraph: Priya Natarajan · priya@hlsr.example · via referral · 7/15/2026
      - button "Triage"
      - button "Decline"
    - article:
      - text: Unknown organization
      - paragraph: QSR brand activation recap for a spring tournament — needs a scoped reply this week. Contact details incomplete.
      - paragraph: via website · 7/12/2026
      - button "Qualify"
      - button "Decline"
    - heading "Clients (5)" [level=2]
    - article:
      - paragraph: Industrial Contractors Association
      - paragraph: Association / Energy
      - paragraph: Morgan Lee, Jordan Miles
      - paragraph:
        - link "ICA":
          - /url: /projects/ica?demo=1
    - article:
      - paragraph: Schneider National
      - paragraph: Logistics
      - paragraph: Dana Whitfield
      - paragraph:
        - link "Schneider + EPC":
          - /url: /projects/schneider-epc?demo=1
    - article:
      - paragraph: bp
      - paragraph: Energy
      - paragraph: Rachel Osei
      - paragraph:
        - link "bp":
          - /url: /projects/bp?demo=1
    - article:
      - paragraph: Conexon
      - paragraph: Rural broadband
      - paragraph: Sam Delgado
      - paragraph:
        - link "Conexon":
          - /url: /projects/conexon?demo=1
    - article:
      - paragraph: Houston Livestock Show and Rodeo
      - paragraph: Events
      - paragraph: Priya Natarajan
  - complementary "Proposal pipeline":
    - heading "Proposal pipeline" [level=2]
    - article:
      - text: ICA Roadshow 2026 — Opening Film Package
      - paragraph: ICA · v2 · $10,255 · valid until 2026-08-15
      - link "Open in project":
        - /url: /projects/ica?surface=proposal&demo=1
    - article:
      - text: Conexon Customer-Story Film
      - paragraph: Conexon · v1 · $5,708 · valid until 2026-08-01
      - button "Record client approval"
      - link "Open in project":
        - /url: /projects/conexon?surface=proposal&demo=1
- alert
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { signInDemoWorkspace } from "./demo-auth";
  3  | 
  4  | /**
  5  |  * G4 smoke flows over the local demo workspace. Every test runs in a fresh
  6  |  * browser context, so demo seed state (localStorage) is pristine and tests
  7  |  * are order-independent.
  8  |  */
  9  | test.describe("Co-VideoPro demo smoke", () => {
  10 |   test("login page renders and demo sign-in lands in the workspace", async ({ page }) => {
  11 |     await page.goto("/");
  12 | 
  13 |     // Unauthenticated visits bounce to the demo login page.
  14 |     await expect(page).toHaveURL(/\/login/);
  15 |     await expect(
  16 |       page.getByRole("heading", { name: "Sign in to Co-VideoPro" }),
  17 |     ).toBeVisible();
  18 | 
  19 |     await page.getByLabel("Email").fill("e2e.login@contentco-op.example");
  20 |     await page.getByLabel("Password", { exact: true }).fill("demo-password");
  21 |     await page.getByRole("button", { name: "Open local workspace" }).click();
  22 | 
  23 |     await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  24 |     await expect(
  25 |       page.getByRole("heading", { name: /What needs attention/ }),
  26 |     ).toBeVisible();
  27 |   });
  28 | 
  29 |   test("home shows the attention queue and productions-by-stage rail", async ({ page }) => {
  30 |     await signInDemoWorkspace(page);
  31 |     await page.goto("/?demo=1");
  32 | 
  33 |     await expect(
  34 |       page.getByRole("heading", { name: /What needs attention/ }),
  35 |     ).toBeVisible();
  36 | 
  37 |     const queue = page.getByRole("region", { name: "Attention queue" });
  38 |     await expect(queue.locator("a").first()).toBeVisible();
  39 |     expect(await queue.locator("a").count()).toBeGreaterThan(0);
  40 | 
  41 |     await expect(
  42 |       page.getByRole("heading", { name: "Productions by stage" }),
  43 |     ).toBeVisible();
  44 |   });
  45 | 
  46 |   test("opportunities inbox triages the HLSR inquiry", async ({ page }) => {
  47 |     await signInDemoWorkspace(page);
  48 |     await page.goto("/opportunities?demo=1");
  49 | 
  50 |     const inbox = page.getByRole("region", { name: "Inquiries" });
  51 |     const inquiry = inbox.locator("article", {
  52 |       hasText: "2027 season: 20-day coverage",
  53 |     });
  54 |     await expect(inquiry).toBeVisible();
> 55 |     await expect(inquiry.getByText("New", { exact: true })).toBeVisible();
     |                                                             ^ Error: expect(locator).toBeVisible() failed
  56 | 
  57 |     await inquiry.getByRole("button", { name: "Triage" }).click();
  58 | 
  59 |     await expect(inquiry.getByText("Triaged", { exact: true })).toBeVisible();
  60 |     await expect(inquiry.getByRole("button", { name: "Qualify" })).toBeVisible();
  61 |   });
  62 | 
  63 |   test("creative surface approves brief v2 for Conexon", async ({ page }) => {
  64 |     await signInDemoWorkspace(page);
  65 |     await page.goto("/projects/conexon?demo=1&surface=creative");
  66 | 
  67 |     const brief = page.getByRole("region", { name: "Current brief" });
  68 |     await expect(brief.getByText("v2", { exact: true })).toBeVisible();
  69 |     await expect(brief.getByText("in review", { exact: true })).toBeVisible();
  70 | 
  71 |     await brief.getByRole("button", { name: "Approve brief" }).click();
  72 | 
  73 |     await expect(brief.getByText("approved", { exact: true })).toBeVisible();
  74 |   });
  75 | 
  76 |   test("sequences surface renders the Schneider timeline with 3 clips", async ({ page }) => {
  77 |     await signInDemoWorkspace(page);
  78 |     await page.goto("/projects/schneider-epc?demo=1&surface=sequences");
  79 | 
  80 |     const timeline = page.locator(".cv-timeline").first();
  81 |     await expect(timeline).toBeVisible();
  82 |     await expect(timeline.locator(".cv-timeline__clip")).toHaveCount(3);
  83 | 
  84 |     await expect(
  85 |       page.getByRole("button", { name: "Propose 90s radio cut" }),
  86 |     ).toBeVisible();
  87 |   });
  88 | });
  89 | 
```