import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
p.on("response", r => { if (r.status() >= 400) console.log(r.status(), r.url()); });
await p.goto("http://localhost:4103/review/demo?demo=1&asset=denie-mcdonald-v4&intent=client_review&share=demo-ceraweek-cuts", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
// pin mode test
const pinBtns = p.getByRole("button", { name: /pin/i });
console.log("pinBtns", await pinBtns.count());
await pinBtns.first().click().catch(()=>{});
await p.waitForTimeout(300);
await p.screenshot({ path: "audit/shots/lane6-pinmode.png" });
// click on the video frame center
const vid = p.locator("video").first();
const box = await vid.boundingBox();
if (box) await p.mouse.click(box.x + box.width*0.6, box.y + box.height*0.4);
await p.waitForTimeout(500);
await p.screenshot({ path: "audit/shots/lane6-pin-placed.png" });
console.log("inlineComposer", await p.locator("text=/pin|frame/i").count());
await b.close();
