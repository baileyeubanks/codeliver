import assert from "node:assert/strict";
import test from "node:test";
import { openReviewReport } from "../lib/review/open-report.ts";

const input = { assetId: "a", assetTitle: "Cut", projectName: "Project", versionId: "v", versionNumber: 1, approvalLabel: "In review", comments: [] };

test("blocked report popup returns a recoverable result", () => {
  const original = globalThis.window;
  Object.assign(globalThis, { window: { open: () => null } });
  try { assert.equal(openReviewReport(input), false); }
  finally { Object.assign(globalThis, { window: original }); }
});

test("preview waits for image readiness and prints only after a user action", async () => {
  const original = globalThis.window;
  let click: (() => Promise<void>) | undefined;
  let printed = 0;
  let html = "";
  let resolveImage: (() => void) | undefined;
  const imageReady = new Promise<void>(resolve => { resolveImage = resolve; });
  const caption = { textContent: "Reference" };
  const button = { disabled: false, addEventListener: (_: string, handler: () => Promise<void>) => { click = handler; } };
  const status = { textContent: "" };
  const preview = {
    opener: {}, closed: false, focus() {}, print() { printed++; },
    document: {
      open() {}, close() {}, write(value: string) { html = value; },
      getElementById(id: string) { return id === "print-review" ? button : status; },
      fonts: { ready: Promise.resolve() },
      images: [{ naturalWidth: 0, decode: () => imageReady, parentElement: { querySelector: () => caption } }],
    },
  };
  Object.assign(globalThis, { window: { open: () => preview } });
  try {
    assert.equal(openReviewReport(input), true);
    assert.equal(preview.opener, null);
    assert.match(html, /Cut/);
    assert.equal(printed, 0);
    const pending = click!();
    assert.equal(button.disabled, true);
    assert.equal(printed, 0);
    resolveImage!();
    await pending;
    assert.equal(printed, 1);
    assert.equal(button.disabled, false);
    assert.match(caption.textContent, /image unavailable/);
    assert.match(status.textContent, /1 reference image/);
  } finally { Object.assign(globalThis, { window: original }); }
});
