import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

// VA-010: a media failure must never unmount the review stage or fall back to
// a white document. The stage stays in the tree with one quiet on-stage card.

test("the fail card is one quiet line and one blue retry on the stage", () => {
  const card = source("components/player/FailOnStageCard.tsx");

  assert.match(card, /Couldn(?:&#8217;|’)t load this cut\./);
  assert.match(card, /aria-label="Retry playback"/);
  assert.match(card, /role="alert"/);
  // No runtime essay, no technical detail dump.
  assert.doesNotMatch(card, /runtime error|stack|digest/i);
});

test("the review media surface keeps the player and transport mounted on failure", () => {
  const surface = source("components/review/ReviewMediaSurface.tsx");

  // The failure no longer replaces the tree: VideoPlayer stays mounted with
  // the card overlaid, and PlayerControls renders outside the failure branch.
  assert.match(surface, /data-stage-state=\{mediaFailed \? "failed" : undefined\}/);
  assert.match(surface, /<FailOnStageCard onRetry=\{retryPlayback\}>/);
  assert.match(surface, /<PlayerControls/);
  assert.doesNotMatch(surface, /Playback unavailable/);

  // A video without a resolvable source still gets the dark stage shell.
  assert.match(surface, /className="review-stage-shell" data-stage-failed="true"/);

  // Images fail onto the same on-stage card instead of a broken-image void.
  assert.match(surface, /onError=\{handlePlaybackError\}/);
});

test("the public review shell catches player-tree failures at the stage boundary", () => {
  const workspace = source("components/review/PublicReviewWorkspace.tsx");
  const boundary = source("components/review/StageErrorBoundary.tsx");

  assert.match(workspace, /<StageErrorBoundary>\{stage\.media\}<\/StageErrorBoundary>/);
  assert.match(boundary, /className="review-stage-shell" data-stage-failed="true"/);
  assert.match(boundary, /<FailOnStageCard onRetry=\{this\.reset\} \/>/);
});

test("the cockpit stage replaces its error essay with the on-stage card", () => {
  const cockpit = source("components/projects/ProjectCockpit.tsx");

  assert.match(
    cockpit,
    /<FailOnStageCard[\s\S]*?clearTransport[\s\S]*?onRetry=\{retryPlaybackSource\}[\s\S]*?\/>/,
  );
  // Operators get the real same-origin source path; guests never do.
  assert.match(cockpit, /detail=\{operatorMediaSourceDetail\(activeMediaUrl\)\}/);
  assert.doesNotMatch(cockpit, /<p role="alert">[\s\S]*?Retry playback/);
});

test("the stage shell keeps a dark fill and dims the stalled picture", () => {
  const styles = source("app/globals.css");

  assert.match(styles, /\.review-stage-shell\s*\{[\s\S]*?background:\s*#050505/);
  assert.match(styles, /\.review-stage-shell\s*\{[\s\S]*?aspect-ratio:\s*16 \/ 9/);
  assert.match(
    styles,
    /\.review-video-surface\[data-stage-state="failed"\] video\s*\{[\s\S]*?opacity:\s*0\.42/,
  );
});
