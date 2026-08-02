import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto("http://localhost:4103/review/demo?demo=1&asset=ica-roadshow-final&intent=approval_needed&share=demo-ica-final", { waitUntil: "networkidle" });
// scroll to approval panel, click exact "Approve" green step button
const stepBtn = p.getByRole("button", { name: "Approve", exact: true });
console.log("stepApprove.count", await stepBtn.count());
await stepBtn.first().scrollIntoViewIfNeeded();
await stepBtn.first().click();
await p.waitForTimeout(1000);
await p.screenshot({ path: "audit/shots/lane6-step-approve-after.png" });
console.log("step1Status", await p.locator("text=/Step 1/").first().textContent().catch(()=>null));
console.log("dialogs", await p.locator("[role=dialog],[role=alertdialog]").count());
await b.close();
