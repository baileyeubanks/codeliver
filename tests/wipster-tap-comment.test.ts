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
const inlineComment = source("components/review/InlineReviewComment.tsx");
const share = source("components/sharing/ShareModal.tsx");
const demoShare = source("components/demo/DemoShareModal.tsx");
const copilot = source("components/copilot/CopilotMount.tsx");
const nextConfig = source("next.config.ts");

test("C1 the permanent under-stage comment row is gone", () => {
  assert.doesNotMatch(page, /Add a timecoded comment|PublicReviewComposer|cockpit-comment-composer/);
  assert.doesNotMatch(cockpit, /Add a timecoded comment|cockpit-comment-composer/);
  assert.doesNotMatch(globals, /cockpit-comment-composer|client-review-composer|cockpit-add-comment/);
  assert.doesNotMatch(cockpitStyles, /cockpit-comment-composer|cockpit-add-comment|cockpit-timecode/);
  assert.doesNotMatch(page, /composer:/);
  assert.doesNotMatch(workspace, /rail\.composer/);
  assert.match(page, /guestFilmAllowsComments\(token, permissions\)/);
  assert.throws(() => source("components/review/InternalReviewComposer.tsx"));
  assert.match(globals, /data-client-film="true"\] \{\s*grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(globals, /\.cockpit-review-stage:has\(\.review-inline-comment\)/);
});

test("C2 a film tap pauses and opens a playhead composer with a marker", () => {
  assert.match(player, /video\.pause\(\);\s*onFrameClick\(point\.x, point\.y, video\.currentTime\)/);
  assert.match(page, /function handleFramePin\(x: number, y: number, timeSeconds: number\)/);
  assert.match(page, /<InlineReviewComment\b/);
  assert.match(page, /id: "playhead-draft"/);
  assert.match(globals, /\.review-phone-comment-sheet[\s\S]*?left: max\(8px, env\(safe-area-inset-left\)\)/);
  assert.match(globals, /right: max\(8px, env\(safe-area-inset-right\)\)/);
  assert.match(globals, /bottom: max\(8px, env\(safe-area-inset-bottom\)\)/);
  assert.match(inlineComment, /max-width: 900px/);
  assert.match(inlineComment, /data-phone-sheet/);
  assert.match(inlineComment, /createPortal\(commentCard, document\.body\)/);
  assert.match(inlineComment, /review-phone-comment-sheet/);
  assert.match(inlineComment, /width - 16/);
  assert.match(cockpit, /data-guest-preview/);
  assert.doesNotMatch(cockpit, /className="cockpit-comment-composer"/);
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

test("share UI exposes a Guest Preview link to the guest film", () => {
  assert.match(share, /data-guest-preview/);
  assert.match(share, /Guest Preview/);
  assert.match(share, /href=\{KNOWN_GUEST_FILM_URL\}/);
  assert.doesNotMatch(share, /link \|\| KNOWN_GUEST_FILM_URL/);
  assert.match(source("proxy.ts"), /\/api\/assets\/\$\{UUID_PATH_SEGMENT\}\/share/);
  assert.match(source("lib/sharing/guest-film.ts"), /guestFilmAllowsComments/);
  assert.match(source("lib/sharing/guest-film.ts"), /https:\/\/co-videopro.com\/review\/0238db512c3960bc59c8ea7f0676bdbe806b15043bd61b52050a314b93a08af1/);
  assert.match(source("components/sharing/ShareLinkList.tsx"), /data-guest-preview/);
  assert.match(cockpit, /0238db512c3960bc59c8ea7f0676bdbe806b15043bd61b52050a314b93a08af1/);
  assert.match(demoShare, /data-guest-preview/);
  assert.match(demoShare, /Guest Preview/);
  assert.match(demoShare, /\/review\/demo\?demo=1/);
});

test("a signed-in client film route hides the operator rail, upload, and copilot", () => {
  assert.match(cockpit, /data-client-film=\{clientFilmFirst \? "true" : "false"\}/);
  assert.match(cockpit, /clientFilmFirst \? null : \(\s*<button[\s\S]*?Upload media/);
  assert.match(cockpit, /clientFilmFirst \? null : \(\s*<aside className="cockpit-sidebar"/);
  assert.match(cockpit, /const filmRoute = activeSection === "overview" \|\| reviewViewActive/);
  assert.match(cockpit, /const clientFilmFirst = filmRoute/);
  assert.match(copilot, /if \(PROJECT_FILM_PATH\.test\(pathname\)\) return false/);
  assert.match(nextConfig, /compress:\s*false/);
});

test("C4 player chrome and the sapphire lockup stay on the current film contract", () => {
  assert.match(brand, /src="\/brand\/cvp-sapphire-mark\.png"/);
  assert.match(playerStyles, /@media \(max-width: 640px\)/);
  assert.match(cockpit, /className=\{`cockpit-video-controls \$\{styles\.playerControls\}`\}/);
});
