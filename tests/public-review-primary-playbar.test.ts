import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playerControls = readFileSync(
  resolve(repositoryRoot, "components/player/PlayerControls.tsx"),
  "utf8",
);
const playerControlsStyles = readFileSync(
  resolve(repositoryRoot, "components/player/PlayerControls.module.css"),
  "utf8",
);
const reviewMediaSurface = readFileSync(
  resolve(repositoryRoot, "components/review/ReviewMediaSurface.tsx"),
  "utf8",
);
const publicReviewPage = readFileSync(
  resolve(repositoryRoot, "components/review/PublicReviewPage.tsx"),
  "utf8",
);

test("public review puts exact-time comment markers on the primary seek bar", () => {
  assert.match(playerControls, /commentMarkers\?: TimelineComment\[\]/);
  assert.match(playerControls, /onCommentMarkerSelect\?: \(comment: TimelineComment\) => void/);
  assert.match(playerControls, /className=\{styles\.commentMarker\}/);
  assert.match(playerControls, /data-comment-marker/);
  assert.match(playerControls, /onCommentMarkerSelect\?\.\(comment\)/);
  assert.match(playerControls, /seekTo\(timeSeconds\)/);
  assert.match(playerControls, /aria-label=\{getCommentMarkerAriaLabel\(comment, timeSeconds\)\}/);
  assert.match(playerControlsStyles, /\.commentMarker \{[\s\S]*?min-width: 28px;[\s\S]*?min-height: 28px;/);
  assert.match(reviewMediaSurface, /commentMarkers=\{commentMarkers\}/);
  assert.match(reviewMediaSurface, /onCommentMarkerSelect=\{onCommentMarkerSelect\}/);
  assert.match(publicReviewPage, /commentMarkers=\{\[\s*\.\.\.rootComments,/);
  assert.match(publicReviewPage, /onCommentMarkerSelect=\{\(comment\) => handleCommentSelect\(comment as ReviewComment\)\}/);
});

test("the secondary public timeline retains cut decisions without duplicating comment dots", () => {
  assert.match(publicReviewPage, /label: "Cut decisions"/);
  assert.match(publicReviewPage, /cutMarkers\.length === 0 \? null/);
  assert.match(publicReviewPage, /collapsed: false/);
  assert.match(publicReviewPage, /comments=\{\[\]\}/);
  assert.match(publicReviewPage, /cutMarkers=\{cutMarkers\}/);
  assert.match(reviewMediaSurface, /timeline\.collapsed \? \(/);
  assert.match(reviewMediaSurface, /<details className="review-timeline-help">/);
});
