import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

// VA-019: Wipster review grammar — tap the film to pause + pin + compose in
// the side rail; markers on the scrub; no permanent deck under the frame.

test("the public review drops the on-frame compose dialog for the rail composer", () => {
  const page = source("components/review/PublicReviewPage.tsx");

  assert.doesNotMatch(page, /InlineReviewComment/);
  assert.match(page, /function handleFramePin\(x: number, y: number, timeSeconds: number, wasPlaying = false\)/);
  assert.match(page, /pin=\{commentPin\}/);
  assert.match(page, /annotations=\{draftStrokes\.length > 0 \? draftStrokes : undefined\}/);
  assert.match(page, /rasterSize=\{drawingRasterSize\}/);
});

test("frame taps pin the exact playhead without a pin-mode arming step", () => {
  const page = source("components/review/PublicReviewPage.tsx");
  const framePin = page.match(
    /function handleFramePin\(x: number, y: number, timeSeconds: number, wasPlaying = false\) \{([\s\S]*?)\n  \}/,
  )?.[1] ?? "";
  assert.match(framePin, /if \(!canComment\) return;/);
  assert.match(framePin, /setCommentPin\(\{ x, y, timeSeconds \}\);/);
  assert.match(framePin, /setResumeAfterComment\(wasPlaying\);/);
  assert.doesNotMatch(framePin, /pinMode/i);

  // Images take the same direct tap — no arming toggle.
  const imagePin = page.match(
    /function handleImagePin\(event: React\.MouseEvent<HTMLDivElement>\) \{([\s\S]*?)\n  \}/,
  )?.[1] ?? "";
  assert.match(imagePin, /if \(!canComment\) return;/);
  assert.doesNotMatch(imagePin, /pinMode/);

  // No pin-mode banner survives on the stage overlay.
  assert.doesNotMatch(page, /Click the frame to place your pin\./);
});

test("the rail composer is contextual: one quiet idle line, full composer on a pin", () => {
  const composer = source("components/review/PublicReviewComposer.tsx");

  assert.match(composer, /Tap the film to pin a note at that frame\./);
  assert.match(composer, /Tap the image to pin a note on that spot\./);
  assert.match(composer, /const composing = canComment && \(pin != null \|\| !supportsPins\)/);
  assert.match(composer, /Pin locked/);
  assert.match(composer, /formatTimeLong\(timecode\)/);
  // Drawings still ride the note through the rail composer.
  assert.match(composer, /rasterizeAnnotations/);
  assert.match(composer, /Drawing attached/);
  // Escape cancels the draft.
  assert.match(composer, /event\.key === "Escape"[\s\S]*?onClearPin\(\)/);
});

test("the side comments panel searches bodies, authors, and replies", () => {
  const list = source("components/comments/CommentList.tsx");

  assert.match(list, /type="search"/);
  assert.match(list, /Search comments/);
  assert.match(list, /author_name/);
  assert.match(list, /thread\.replies\.some/);
});

test("timeline markers and prev/next comment jumps stay on the transport", () => {
  const page = source("components/review/PublicReviewPage.tsx");
  const controls = source("components/player/PlayerControls.tsx");

  assert.match(page, /commentMarkers=\{rootComments\}/);
  assert.match(page, /onPrevious: \(\) => selectAdjacentComment\(-1\)/);
  assert.match(page, /onNext: \(\) => selectAdjacentComment\(1\)/);
  assert.match(controls, /data-comment-marker/);
  assert.match(controls, /aria-label="Previous comment"/);
  assert.match(controls, /aria-label="Next comment"/);
});
