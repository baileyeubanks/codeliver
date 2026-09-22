import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitSource = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);
const inlineCommentSource = readFileSync(
  resolve(repositoryRoot, "components/review/InlineReviewComment.tsx"),
  "utf8",
);
const cockpitDockStyles = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CockpitDock.module.css"),
  "utf8",
);
const cockpitNavigationStyles = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CockpitNavigation.module.css"),
  "utf8",
);
const cockpitProjectStyles = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.module.css"),
  "utf8",
);
const globalStyles = readFileSync(
  resolve(repositoryRoot, "app/globals.css"),
  "utf8",
);
const shellSource = readFileSync(
  resolve(repositoryRoot, "components/Shell.tsx"),
  "utf8",
);
const projectWorkspaceClientSource = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectWorkspaceClient.tsx"),
  "utf8",
);
const projectAssetsRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/projects/[id]/assets/route.ts"),
  "utf8",
);

test("a focused review deep link releases control when the operator changes modes", () => {
  assert.match(
    cockpitSource,
    /const \[reviewViewActive, setReviewViewActive\] = useState\(reviewViewRequested\)/,
  );
  assert.match(cockpitSource, /params\.delete\("view"\)/);
  assert.match(
    cockpitSource,
    /const changeMode = useCallback\([\s\S]*?leaveReviewView\(\);[\s\S]*?setMode\(mode\)/,
  );
  assert.match(cockpitSource, /onModeChange=\{changeMode\}/);
  assert.match(
    cockpitSource,
    /function selectDockTab[\s\S]*?leaveReviewView\(\);[\s\S]*?setDockTab\(tab\)/,
  );
});

test("cockpit surfaces follow the URL and preserve browser back navigation", () => {
  assert.match(
    cockpitSource,
    /useEffect\(\(\) => \{[\s\S]*?setActiveSection\(cockpitSectionFromSearchParams\(searchParams\)\)[\s\S]*?setReviewViewActive\(searchParams\.get\("view"\) === "review"\)[\s\S]*?\}, \[searchParams\]\)/,
  );

  const selectSectionBody = cockpitSource.match(
    /function selectSection\(section: CockpitSection\) \{([\s\S]*?)\n  \}\n\n  function handleLifecycleOpenChange/,
  )?.[1];

  assert.ok(selectSectionBody, "surface navigation handler is missing");
  assert.match(selectSectionBody, /projectCockpitSurfaceHref\(project\.id, searchParams, section\)/);
  assert.match(selectSectionBody, /if \(href !== currentHref\) router\.push\(href\)/);
  assert.match(selectSectionBody, /router\.push\(/);
  assert.doesNotMatch(selectSectionBody, /router\.replace\(/);
  assert.doesNotMatch(cockpitSource, /Demo transcript not processed/);
  assert.match(cockpitSource, /Transcript has not been processed for this imported source/);
});

test("the cockpit uses the truthful shared review timeline", () => {
  assert.match(cockpitSource, /<CockpitReviewTimeline/);
  assert.match(cockpitSource, /durationSeconds=\{previewDuration\}/);
  assert.match(cockpitSource, /label: activeAsset\.title/);
  assert.match(cockpitSource, /comments=\{comments\.map/);
  assert.match(cockpitSource, /cutDecisions=\{cutMarkers\.map/);
  assert.doesNotMatch(cockpitSource, /activeAsset\.title\}\.mp4/);
});

test("the review cockpit surfaces systems health only when it needs attention", () => {
  // Systems diagnostics live in Settings > Systems. The cockpit shows a single
  // chip, and only when something is actually wrong — no permanent status wall.
  assert.match(cockpitSource, /settings\?section=systems/);
  assert.match(cockpitSource, /\/api\/health\/ready/);
  assert.match(cockpitSource, /cache: "no-store"/);
  assert.match(cockpitSource, /controller\.abort\(\)/);
  assert.match(cockpitSource, /systemsReadiness\.tone === "attention" \? \(/);
  assert.doesNotMatch(cockpitSource, /aria-label="Studio systems posture"/);
  assert.doesNotMatch(cockpitSource, /Browser online only/);
  assert.doesNotMatch(cockpitSource, /presence unverified/);
  assert.doesNotMatch(cockpitSource, /Credential gated/);
  assert.doesNotMatch(cockpitSource, /Screen share active/i);
  assert.doesNotMatch(cockpitSource, /FFmpeg ready/i);
});

test("review readiness is one chip row, not a wall of status cards", () => {
  // The player is the subject. Readiness is a single flex row of icon+value
  // chips; explanatory detail belongs in a title tooltip, never on screen.
  assert.match(
    globalStyles,
    /\.cockpit-review-strip \{[^}]*display: flex;[^}]*flex-wrap: wrap;/,
  );
  // the chip rule must not reintroduce card sizing
  const chipRule = globalStyles.slice(
    globalStyles.indexOf(".cockpit-review-strip article,"),
    globalStyles.indexOf(".cockpit-review-strip svg"),
  );
  assert.ok(chipRule.length > 0, "chip rule is missing");
  assert.doesNotMatch(chipRule, /min-height/);
  assert.match(chipRule, /display: inline-flex;/);
  assert.doesNotMatch(globalStyles, /\.cockpit-review-strip small \{/);
  assert.doesNotMatch(globalStyles, /\.cockpit-system-posture \{/);
  // chips render an icon and a value only — no label span, no detail caption
  const stripStart = cockpitSource.indexOf('className="cockpit-review-strip"');
  assert.notEqual(stripStart, -1, "review strip is missing");
  const strip = cockpitSource.slice(stripStart, stripStart + 900);
  assert.match(strip, /<strong>\{value\}<\/strong>/);
  assert.doesNotMatch(strip, /<small>\{detail\}<\/small>/);
  assert.doesNotMatch(strip, /<span>\{label\}<\/span>/);
  assert.match(strip, /title=\{detail\}/);
  assert.match(globalStyles, /\.cockpit-timeline \{[\s\S]*?margin-top: 14px;/);
});

test("mobile review tools keep only distinct primary actions", () => {
  const stripStart = cockpitSource.indexOf(
    'className="cockpit-mobile-review-strip"',
  );
  assert.notEqual(stripStart, -1, "mobile review strip is missing");
  const stripEnd = cockpitSource.indexOf(
    "</div>\n                ) : null}",
    stripStart,
  );
  const mobileStrip = cockpitSource.slice(stripStart, stripEnd);

  assert.equal(mobileStrip.match(/<button/g)?.length, 2);
  assert.match(mobileStrip, />Comments</);
  assert.match(mobileStrip, />Share</);
  assert.doesNotMatch(mobileStrip, />Transcript</);
  assert.match(
    globalStyles,
    /\.cockpit-mobile-review-strip \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
});

test("the review dock carries no live-session status prose", () => {
  // The Live session block was four rows of engineer-facing jargon
  // ("Roster only; realtime unverified", "Presence is ephemeral"). Removed.
  assert.doesNotMatch(cockpitSource, /liveSessionItems/);
  assert.doesNotMatch(cockpitSource, /Live session/);
  assert.doesNotMatch(cockpitSource, /Roster only; realtime unverified/);
  assert.doesNotMatch(cockpitSource, /Presence is ephemeral/);
  assert.doesNotMatch(cockpitSource, /Comments are record/);
  assert.doesNotMatch(cockpitSource, /Start screen share/);
  assert.doesNotMatch(
    cockpitSource,
    /aria-label="Live collaboration readiness"/,
  );
});

test("operator dock tabs stay compact instead of exposing crowded labels by viewport", () => {
  assert.match(
    cockpitDockStyles,
    /\.tab > span:not\(\.count\) \{\s*display: none;/,
  );
  assert.match(
    cockpitDockStyles,
    /@media \(max-width: 390px\) \{[\s\S]*?\.tab > span:not\(\.count\) \{\s*display: none;/,
  );
  assert.doesNotMatch(
    cockpitDockStyles,
    /@media \(min-width:[\s\S]*?\.tab > span:not\(\.count\)[\s\S]*?display: inline/,
  );
});

test("390px cockpit guards prevent header and composer crowding", () => {
  assert.match(cockpitProjectStyles, /@media \(max-width: 390px\)/);
  assert.match(
    cockpitProjectStyles,
    /\.shell :global\(\.cockpit-project-switcher\) \{[\s\S]*?padding-inline: 7px;/,
  );
  assert.match(
    cockpitProjectStyles,
    /\.shell :global\(\.cockpit-header-actions\) \{[\s\S]*?gap: 2px;/,
  );
  assert.match(
    cockpitProjectStyles,
    /\.shell :global\(\.cockpit-section-heading\) \{[\s\S]*?flex-wrap: nowrap;/,
  );
  assert.match(
    cockpitProjectStyles,
    /\.shell :global\(\.cockpit-section-heading select\) \{[\s\S]*?flex: 1 1 0;/,
  );
  assert.match(
    cockpitProjectStyles,
    /\.shell :global\(\.cockpit-comment-composer\) \{[\s\S]*?grid-template-columns: 28px minmax\(0, 1fr\);/,
  );
  assert.match(
    cockpitProjectStyles,
    /\.shell :global\(\.cockpit-comment-composer input\),[\s\S]*?\.shell :global\(\.cockpit-timecode\),[\s\S]*?\.shell :global\(\.cockpit-add-comment\) \{[\s\S]*?width: 100%;/,
  );
});

test("mobile navigation drawer sizes the supplied raster brand wrapper", () => {
  assert.match(
    cockpitNavigationStyles,
    /\.drawerHead > \[data-brand-variant="horizontal"\] \{[\s\S]*?--co-production-brand-width:\s*146px;/,
  );
  assert.doesNotMatch(cockpitNavigationStyles, /\.drawerHead > img/);
});

test("opening the operator dock from another section renders the actual overview dock", () => {
  const toggleDockBody = cockpitSource.match(
    /function toggleOperatorDock\(\) \{([\s\S]*?)\n  \}\n\n  function closeOperatorDock/,
  )?.[1];

  assert.ok(toggleDockBody, "operator-dock handler is missing");
  assert.match(toggleDockBody, /activeSection !== "overview"/);
  assert.match(toggleDockBody, /selectSection\("overview"\)/);
  assert.match(
    toggleDockBody,
    /if \(compactViewport\) setMobileDockOpen\(true\)/,
  );
  assert.match(toggleDockBody, /else if \(!layout\.dockOpen\) toggleDock\(\)/);
});

test("production project routes render exactly one application shell", () => {
  assert.match(
    shellSource,
    /const isProjectCockpit = PROJECT_WORKSPACE_SURFACE_PATH\.test\(pathname\)/,
  );
  assert.doesNotMatch(
    shellSource,
    /const isProjectCockpit = Boolean\(demoSuffix\)/,
  );
});

test("a capability-qualified live project can expose its replacement-version control", () => {
  // Demo imports need a measured local base before they can be revised. Live
  // projects verify their exact current version in the preflight invoked by
  // the control, so they must not inherit that demo-only eligibility gate.
  assert.match(
    cockpitSource,
    /const revisionableActiveAsset = Boolean\(\s*activeAsset &&\s*\(\s*!demoMode \|\|/,
  );
});

test("the live revision control fails closed until readiness advertises its CAS contract", () => {
  assert.match(
    projectWorkspaceClientSource,
    /const \[revisionUploadsAvailable, setRevisionUploadsAvailable\] = useState\(false\)/,
  );
  assert.match(projectWorkspaceClientSource, /fetch\("\/api\/storage\/readiness"/);
  assert.match(
    projectWorkspaceClientSource,
    /setRevisionUploadsAvailable\(readinessPayload\.features\?\.revisionUploads === true\)/,
  );
  assert.match(projectWorkspaceClientSource, /revisionUploadsAvailable=\{revisionUploadsAvailable\}/);
});

test("the project shell owns only root and Whiteboard project routes", () => {
  const routePatternSource = shellSource.match(
    /export const PROJECT_WORKSPACE_SURFACE_PATH = (\/\^[^;]+\$\/);/,
  )?.[1];
  assert.ok(routePatternSource, "project shell route matcher is missing");
  const routePattern = runInNewContext(`(${routePatternSource})`) as RegExp;

  for (const pathname of ["/projects/el-paso", "/projects/el-paso/whiteboard", "/projects/ica"]) {
    assert.equal(routePattern.test(pathname), true, pathname);
  }
  for (const pathname of [
    "/projects",
    "/projects/new",
    "/projects/archive",
    "/projects/trash",
    "/projects/el-paso/assets/asset-1",
    "/review/projects/el-paso",
  ]) {
    assert.equal(routePattern.test(pathname), false, pathname);
  }
});

test("project transitions clear stale data and cancel superseded requests", () => {
  assert.match(
    projectWorkspaceClientSource,
    /const controller = new AbortController\(\)/,
  );
  assert.match(projectWorkspaceClientSource, /setRemoteProject\(null\)/);
  assert.match(projectWorkspaceClientSource, /setRemoteAssets\(\[\]\)/);
  assert.match(projectWorkspaceClientSource, /projectPayload\.id !== id/);
  assert.match(projectWorkspaceClientSource, /controller\.abort\(\)/);
});

test("production asset detail is committed only to its matching selected asset", () => {
  assert.match(cockpitSource, /const liveAssetRequestRef = useRef\(0\)/);
  assert.match(
    cockpitSource,
    /activeLiveReviewKey && liveAssetDataKey === activeLiveReviewKey \? liveComments : \[\]/,
  );
  assert.match(cockpitSource, /liveAssetRequestRef\.current !== requestId/);
  assert.match(cockpitSource, /setLiveAssetDataKey\(`\$\{assetId\}:\$\{versionId\}`\)/);
});

test("the down-arrow shortcut creates a reviewable cut proposal, not an accepted edit", () => {
  assert.match(cockpitSource, /status: "proposed"/);
  assert.match(cockpitSource, /Cut proposal saved/);
});

test("frame-pin coordinates use loaded fitted-media bounds and reject letterbox clicks", () => {
  const handlerBody = cockpitSource.match(
    /function handleReviewFrameClick\(event: ReactMouseEvent<HTMLDivElement>\) \{([\s\S]*?)\n  \}\n\n  function selectReviewComment/,
  )?.[1];

  assert.ok(handlerBody, "review frame click handler is missing");
  assert.match(handlerBody, /video\.readyState < HTMLMediaElement\.HAVE_METADATA/);
  assert.match(handlerBody, /video\.videoWidth <= 0 \|\| video\.videoHeight <= 0/);
  assert.match(handlerBody, /projectPointIntoMedia\(/);
  assert.match(handlerBody, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(handlerBody, /if \(!point\) return;/);
  assert.match(
    handlerBody,
    /setPendingPin\(\{ x: point\.x, y: point\.y, timeSeconds: videoRef\.current\?\.currentTime \?\? currentTime \}\)/,
  );
});

test("production approval and version labels come from indexed records", () => {
  assert.match(
    projectAssetsRouteSource,
    /approvals\(id, status, step_order, role_label, assignee_email\)/,
  );
  assert.match(projectAssetsRouteSource, /versions\(id\)/);
  assert.match(projectAssetsRouteSource, /count: asset\.versions\?\.length \?\? 0/);
  assert.match(cockpitSource, /approval\.role_label \|\| "Approval"/);
  assert.doesNotMatch(cockpitSource, /Assigned reviewer/);
  assert.match(cockpitSource, /Version not indexed/);
});

test("media inspector never fabricates unprobed resolution or frame rate", () => {
  assert.match(cockpitSource, /function mediaResolutionLabel/);
  assert.match(cockpitSource, /function mediaFrameRateLabel/);
  assert.match(cockpitSource, /Not probed in demo/);
  assert.match(cockpitSource, /Not reported/);
  assert.doesNotMatch(cockpitSource, /1920 x 1080/);
  assert.doesNotMatch(cockpitSource, /23\.98 fps/);
  assert.equal(
    cockpitSource.match(/mediaResolutionLabel\(activeAsset, demoMode\)/g)
      ?.length,
    2,
  );
  assert.equal(
    cockpitSource.match(/mediaFrameRateLabel\(activeAsset, demoMode\)/g)
      ?.length,
    2,
  );
});

test("demo upload terminal states stay readable and dismissible", () => {
  assert.match(cockpitSource, /onUploadDismiss\?: \(\) => void/);
  assert.match(
    cockpitSource,
    /const uploadTerminal =\s*uploadStatus\?\.phase === "complete" \|\| uploadStatus\?\.phase === "error"/,
  );
  assert.match(cockpitSource, /\{uploadStatus \? \(/);
  assert.match(cockpitSource, /className="cockpit-upload-close"/);
  assert.match(
    cockpitSource,
    /Existing links, comments, and approvals remain pinned to their earlier cut/,
  );
  assert.match(
    cockpitSource,
    /No version was added\. Retry from Upload when the issue is fixed/,
  );
  assert.match(cockpitSource, /Review V\$\{uploadStatus\.versionNumber/);
  assert.match(projectWorkspaceClientSource, /let keepTerminalStatus = false/);
  assert.match(projectWorkspaceClientSource, /keepTerminalStatus = true/);
  assert.match(
    projectWorkspaceClientSource,
    /function dismissUploadStatus\(\)/,
  );
  assert.match(
    projectWorkspaceClientSource,
    /onUploadDismiss=\{dismissUploadStatus\}/,
  );
  assert.match(globalStyles, /\.cockpit-upload-close \{/);
  assert.match(
    globalStyles,
    /section\[data-state="complete"\] footer > button/,
  );
});


test("comment submission never pretends a production player resumed", () => {
  assert.doesNotMatch(inlineCommentSource, /continue playback/);
  assert.match(inlineCommentSource, /aria-label="Send comment"/);

  const submitComment = cockpitSource.match(
    /async function submitComment\(\) \{([\s\S]*?)\n  \}\n\n  async function toggleCommentStatus/,
  )?.[1];
  assert.ok(submitComment, "comment submission handler is missing");
  assert.match(submitComment, /if \(!demoMode\) \{[\s\S]*?setIsPlaying\(false\);[\s\S]*?setPlaybackError\(/);
  assert.match(submitComment, /else if \(!demoMode\) \{[\s\S]*?setIsPlaying\(false\);[\s\S]*?setPlaybackError\(/);
});
