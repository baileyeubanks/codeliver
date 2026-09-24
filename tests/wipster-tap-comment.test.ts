import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

const page = source("components/review/PublicReviewPage.tsx");
const workspace = source("components/review/PublicReviewWorkspace.tsx");
const cockpit = source("components/projects/ProjectCockpit.tsx");
const player = source("components/player/VideoPlayer.tsx");
const brand = source("components/brand/CoProductionBrand.tsx");
const playerStyles = source("components/player/PlayerControls.module.css");
const globals = source("app/globals.css");
const cockpitStyles = source("components/projects/ProjectCockpit.module.css");

test("C1 the permanent under-stage comment row is gone", () => {
  assert.doesNotMatch(page, /Add a timecoded comment|PublicReviewComposer|cockpit-comment-composer/);
  assert.doesNotMatch(cockpit, /Add a timecoded comment|cockpit-comment-composer/);
  assert.doesNotMatch(globals, /cockpit-comment-composer|client-review-composer|cockpit-add-comment/);
  assert.doesNotMatch(cockpitStyles, /cockpit-comment-composer|cockpit-add-comment|cockpit-timecode/);
  assert.match(page, /composer:\s*null/);
});

test("C2 a film tap pauses and opens a playhead composer with a marker", () => {
  assert.match(player, /video\.pause\(\);\s*onFrameClick\(point\.x, point\.y, video\.currentTime\)/);
  assert.match(page, /function handleFramePin\(x: number, y: number, timeSeconds: number\)/);
  assert.match(page, /<InlineReviewComment\b/);
  assert.match(page, /id: "playhead-draft"/);
  assert.match(globals, /@media \(max-width: 640px\)[\s\S]*?\.review-inline-comment\[data-horizontal\]\[data-vertical\] \.review-inline-comment-card[\s\S]*?position: fixed/);
  assert.match(globals, /inset: auto 8px 12px 8px/);
  assert.match(page, /timecode_seconds: commentPin\.timeSeconds/);
  assert.match(cockpit, /data-playhead-comment/);
  assert.match(cockpit, /function openPlayheadComment\(\)/);
});

test("C3 the guest review shell is film and comments, without operator chrome", () => {
  assert.doesNotMatch(workspace, /Lifecycle|Whiteboard|PlanSection|DeliverySection|Copilot|Upload media/);
  assert.doesNotMatch(page, /Lifecycle|Whiteboard|Copilot|Upload media/);
  assert.match(workspace, /className=\{styles\.rail\}/);
  assert.match(workspace, /rail\.comments\.content/);
  assert.match(page, /cutMarkers\.length === 0 \? null/);
});

test("C4 player chrome and the sapphire lockup stay on the current film contract", () => {
  assert.match(brand, /src="\/brand\/cvp-sapphire-mark\.png"/);
  assert.match(playerStyles, /@media \(max-width: 640px\)/);
  assert.match(cockpit, /className=\{`cockpit-video-controls \$\{styles\.playerControls\}`\}/);
});
