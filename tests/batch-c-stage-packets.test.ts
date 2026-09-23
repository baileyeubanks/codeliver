import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

// Batch C fold-in: VA-020…025 on the review stages. Locks: player chrome =
// Wistia, review workflow = Wipster, blue brand only, G/Y/R status-only.

test("VA-020: the public stage resumes playback only when the film was playing at tap time", () => {
  const player = source("components/player/VideoPlayer.tsx");
  const page = source("components/review/PublicReviewPage.tsx");

  assert.match(player, /const wasPlaying = !video\.paused && !video\.ended;/);
  assert.match(player, /onFrameClick\(point\.x, point\.y, video\.currentTime, wasPlaying\)/);

  assert.match(page, /const \[resumeAfterComment, setResumeAfterComment\] = useState\(false\)/);
  assert.match(page, /setResumeAfterComment\(wasPlaying\)/);
  const created = page.match(
    /function handleCommentCreated\(comment: ReviewComment\) \{([\s\S]*?)\n  \}/,
  )?.[1] ?? "";
  assert.match(created, /if \(resumeAfterComment\) \{/);
  assert.match(created, /setResumeAfterComment\(false\);/);
});

test("VA-022: the Copilot gate is a pure path+query function and the root mount is suspense-wrapped", () => {
  const client = source("components/copilot/copilot-client.ts");
  const mount = source("components/copilot/CopilotMount.tsx");
  const layout = source("app/layout.tsx");

  assert.match(client, /export function copilotAllowedOnPath\(pathname: string, search\?: string\)/);
  assert.match(client, /new URLSearchParams\(search\)\.get\("view"\) === "review"/);
  assert.match(mount, /copilotAllowedOnPath\(pathname, searchParams\.toString\(\)\)/);
  assert.match(layout, /<Suspense fallback=\{null\}>[\s\S]*?<CopilotMount \/>/);
});

test("VA-023: version control is one quiet chip control on each stage", () => {
  const switcher = source("components/review/VersionSwitcher.tsx");
  const page = source("components/review/PublicReviewPage.tsx");
  const cockpit = source("components/projects/ProjectCockpit.tsx");

  // Quiet selected state — hairline accent border, white label, no blue fill.
  assert.match(switcher, /active\s*\?\s*"border-\[var\(--accent\)\] bg-white\/10 text-white"/);
  assert.doesNotMatch(switcher, /bg-\[var\(--accent\)\] text-\[#18223e\]/);

  // Older-cut notice is compact and carries a back-to-current action.
  assert.match(page, /Back to current \(V\{currentVersionNumber \?\? "\?"\}\)/);
  assert.match(page, /function handleBackToCurrentVersion\(\)/);
  assert.doesNotMatch(page, /text-amber-300/);

  // The internal stage mounts the shared switcher in review mode; the
  // heading dropdowns stay out of review mode so chrome never duplicates.
  assert.match(cockpit, /className="cockpit-stage-versions"/);
  assert.match(cockpit, /<VersionSwitcher[\s\S]*?onSelect=\{\(version\) => selectStageReviewVersion\(version\.id\)\}/);
  assert.match(cockpit, /demoMode && !reviewViewActive && activeDemoVersions\.length > 0/);
  assert.match(cockpit, /!demoMode && !reviewViewActive && liveVersionAssetId === activeAsset\.id/);
});

test("VA-024: status color is data-toned and no sapphire hairline caps the headers", () => {
  const globals = source("app/globals.css");
  const moduleStyles = source("components/review/PublicReviewWorkspace.module.css");
  const page = source("components/review/PublicReviewPage.tsx");
  const tokens = source("app/brand-tokens.css");
  const cockpit = source("components/projects/ProjectCockpit.tsx");

  // Badge tone is data-driven; green only for approved/locked-final.
  assert.match(page, /data-tone=\{delivery\?\.locked \? "green" : isSourcePreview \? "slate" : reviewState\.tone\}/);
  assert.match(globals, /\.client-review-status-badge\[data-tone="green"\]/);
  assert.match(moduleStyles, /\.client-review-status-badge\[data-tone="green"\]/);

  // The 3px sapphire header stripes and their token are gone.
  assert.doesNotMatch(globals, /\.cockpit-header::before/);
  assert.doesNotMatch(globals, /\.workspace-header::before/);
  assert.doesNotMatch(tokens, /--cvp-gradient-ribbon/);

  // The cockpit status dot reports state instead of wearing permanent green.
  assert.match(cockpit, /<i data-tone=\{assetStatusTone\(activeAsset\.status\)\} \/>/);
  assert.match(globals, /\.cockpit-review-status i\[data-tone="green"\]/);
});

test("VA-021: Preview opens the real guest door from the internal stage", () => {
  const cockpit = source("components/projects/ProjectCockpit.tsx");

  assert.match(cockpit, /Preview as guest/);
  assert.match(cockpit, /target="_blank"/);
  assert.match(cockpit, /rel="noopener noreferrer"/);
  assert.match(cockpit, /Share this cut first — Preview opens the guest link/);
  // Most recent active link bound to the current version; never a mock.
  assert.match(cockpit, /link\.version_id === activeStageVersionId/);
  assert.match(cockpit, /link\.is_active !== false/);
});

test("VA-025: the download ladder is a server projection on the stage bar", () => {
  const route = source("app/api/review/[token]/route.ts");
  const page = source("components/review/PublicReviewPage.tsx");
  const menu = source("components/review/DownloadMenu.tsx");

  // Server projects Original with exact bytes, gated by download_enabled.
  assert.match(route, /downloads: invite\.download_enabled/);
  assert.match(route, /label: "Original"/);
  assert.match(route, /bytes: versionLookup\.version\.file_size \?\? null/);

  // The stage bar carries the ladder; the details disclosure no longer does.
  assert.match(page, /<DownloadMenu items=\{downloadLadder\} \/>/);
  const detailsPanel = page.slice(
    page.indexOf('<details className="client-review-tools">'),
    page.indexOf("</details>", page.indexOf('<details className="client-review-tools">')),
  );
  assert.doesNotMatch(detailsPanel, /href=\{downloadUrl/);

  // The menu renders nothing when the ladder is empty — no disabled teaser.
  assert.match(menu, /if \(items\.length === 0\) return null;/);
});
