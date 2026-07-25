import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitSource = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
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
const globalStyles = readFileSync(resolve(repositoryRoot, "app/globals.css"), "utf8");
const shellSource = readFileSync(resolve(repositoryRoot, "components/Shell.tsx"), "utf8");
const projectPageSource = readFileSync(
  resolve(repositoryRoot, "app/(dashboard)/projects/[id]/page.tsx"),
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
  assert.match(cockpitSource, /const changeMode = useCallback\([\s\S]*?leaveReviewView\(\);[\s\S]*?setMode\(mode\)/);
  assert.match(cockpitSource, /onModeChange=\{changeMode\}/);
  assert.match(cockpitSource, /function selectDockTab[\s\S]*?leaveReviewView\(\);[\s\S]*?setDockTab\(tab\)/);
});

test("cockpit surfaces follow the URL and preserve browser back navigation", () => {
  assert.match(
    cockpitSource,
    /useEffect\(\(\) => \{[\s\S]*?searchParams\.get\("surface"\)[\s\S]*?setActiveSection\([\s\S]*?setReviewViewActive\(searchParams\.get\("view"\) === "review"\)[\s\S]*?\}, \[searchParams\]\)/,
  );

  const selectSectionBody = cockpitSource.match(
    /function selectSection\(section: CockpitSection\) \{([\s\S]*?)\n  \}\n\n  function handleLifecycleOpenChange/,
  )?.[1];

  assert.ok(selectSectionBody, "surface navigation handler is missing");
  assert.match(selectSectionBody, /params\.delete\("view"\)/);
  assert.match(selectSectionBody, /params\.delete\("surface"\)/);
  assert.match(selectSectionBody, /params\.set\("surface", section\)/);
  assert.match(selectSectionBody, /router\.push\(/);
  assert.doesNotMatch(selectSectionBody, /router\.replace\(/);
});

test("the cockpit uses the truthful shared review timeline", () => {
  assert.match(cockpitSource, /<CockpitReviewTimeline/);
  assert.match(cockpitSource, /durationSeconds=\{previewDuration\}/);
  assert.match(cockpitSource, /label: activeAsset\.title/);
  assert.match(cockpitSource, /comments=\{comments\.map/);
  assert.match(cockpitSource, /cutDecisions=\{cutMarkers\.map/);
  assert.doesNotMatch(cockpitSource, /activeAsset\.title\}\.mp4/);
});

test("the review cockpit exposes honest systems posture without fake backend readiness", () => {
  assert.match(cockpitSource, /aria-label="Studio systems posture"/);
  assert.match(cockpitSource, /settings\?section=systems/);
  assert.match(cockpitSource, /\/api\/health\/ready/);
  assert.match(cockpitSource, /cache: "no-store"/);
  assert.match(cockpitSource, /controller\.abort\(\)/);
  assert.match(cockpitSource, /Checking readiness/);
  assert.match(cockpitSource, /Ready with warnings/);
  assert.match(cockpitSource, /Needs attention/);
  assert.match(cockpitSource, /Not checked/);
  assert.match(cockpitSource, /Browser online only/);
  assert.match(cockpitSource, /presence unverified/);
  assert.match(cockpitSource, /Not used in demo/);
  assert.match(cockpitSource, /Credential gated/);
  assert.equal(cockpitSource.match(/id: "(?:network|live-room|media-worker)"/g)?.length, 3);
  assert.match(globalStyles, /\.cockpit-system-posture \{/);
  assert.match(globalStyles, /\.cockpit-system-posture \{[\s\S]*?display: flex;[\s\S]*?overflow-x: auto;/);
  assert.match(globalStyles, /\.cockpit-system-posture article,[\s\S]*?\.cockpit-system-posture-link \{[\s\S]*?flex: 1 0 132px;/);
  assert.doesNotMatch(cockpitSource, /Screen share active/i);
  assert.doesNotMatch(cockpitSource, /FFmpeg ready/i);
  assert.doesNotMatch(cockpitSource, /Live collaborators/i);
});

test("review readiness chrome stays compact so the player remains the focus", () => {
  assert.match(globalStyles, /\.cockpit-section-heading \{[\s\S]*?margin-bottom: 8px;/);
  assert.match(globalStyles, /\.cockpit-review-strip \{[\s\S]*?margin: 0 0 6px;[\s\S]*?border-radius: 7px;/);
  assert.match(globalStyles, /\.cockpit-review-strip article \{[\s\S]*?min-height: 46px;[\s\S]*?padding: 6px 8px;/);
  assert.match(globalStyles, /\.cockpit-system-posture \{[\s\S]*?min-height: 32px;[\s\S]*?margin: 0 0 8px;[\s\S]*?border-radius: 7px;/);
  assert.match(globalStyles, /\.cockpit-system-posture article,[\s\S]*?\.cockpit-system-posture-link \{[\s\S]*?flex: 1 0 132px;[\s\S]*?min-height: 31px;[\s\S]*?padding: 4px 7px;/);
  assert.match(globalStyles, /\.cockpit-timeline \{[\s\S]*?margin-top: 14px;/);
  assert.match(globalStyles, /\.cockpit-track-row \{[\s\S]*?min-height: 44px;/);
  assert.match(globalStyles, /\.cockpit-video-track \{ height: 52px;/);
});

test("mobile review tools keep only distinct primary actions", () => {
  const stripStart = cockpitSource.indexOf('className="cockpit-mobile-review-strip"');
  assert.notEqual(stripStart, -1, "mobile review strip is missing");
  const stripEnd = cockpitSource.indexOf("</div>\n                ) : null}", stripStart);
  const mobileStrip = cockpitSource.slice(stripStart, stripEnd);

  assert.equal(mobileStrip.match(/<button/g)?.length, 2);
  assert.match(mobileStrip, />Comments</);
  assert.match(mobileStrip, />Share</);
  assert.doesNotMatch(mobileStrip, />Transcript</);
  assert.match(globalStyles, /\.cockpit-mobile-review-strip \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});

test("review dock exposes live session readiness without fake screenshare", () => {
  assert.match(cockpitSource, /const liveSessionItems = activeAsset \? \[/);
  assert.match(cockpitSource, /Roster only; realtime unverified/);
  assert.match(cockpitSource, /Reconnect before live sync/);
  assert.match(cockpitSource, /Disabled until session contract/);
  assert.match(cockpitSource, /Comments are record/);
  assert.match(cockpitSource, /Presence is ephemeral/);
  assert.match(cockpitSource, /<header><h2>Live session<\/h2><button type="button" onClick=\{\(\) => router\.push\(systemsHref\)\}>Systems<\/button><\/header>/);
  assert.match(cockpitSource, /aria-label="Live collaboration readiness"/);
  assert.match(cockpitSource, /aria-label="Live session controls"/);
  assert.match(cockpitSource, /<button type="button" disabled aria-disabled="true">\s*Start screen share\s*<\/button>/);
  assert.match(globalStyles, /\.cockpit-live-session \{/);
  assert.match(globalStyles, /\.cockpit-live-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  const controlsStart = cockpitSource.indexOf('aria-label="Live session controls"');
  assert.notEqual(controlsStart, -1, "live controls are missing");
  const controlsEnd = cockpitSource.indexOf("</div>\n                        </section>", controlsStart);
  const liveControls = cockpitSource.slice(controlsStart, controlsEnd);
  assert.match(liveControls, /Pin comment/);
  assert.match(liveControls, /Start screen share/);
  assert.doesNotMatch(liveControls, /Start screen share[\s\S]*?onClick=/);
});

test("operator dock tabs stay compact instead of exposing crowded labels by viewport", () => {
  assert.match(cockpitDockStyles, /\.tab > span:not\(\.count\) \{\s*display: none;/);
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
  assert.match(cockpitProjectStyles, /\.shell :global\(\.cockpit-project-switcher\) \{[\s\S]*?padding-inline: 7px;/);
  assert.match(cockpitProjectStyles, /\.shell :global\(\.cockpit-header-actions\) \{[\s\S]*?gap: 2px;/);
  assert.match(cockpitProjectStyles, /\.shell :global\(\.cockpit-section-heading\) \{[\s\S]*?flex-wrap: nowrap;/);
  assert.match(cockpitProjectStyles, /\.shell :global\(\.cockpit-section-heading select\) \{[\s\S]*?flex: 1 1 0;/);
  assert.match(cockpitProjectStyles, /\.shell :global\(\.cockpit-comment-composer\) \{[\s\S]*?grid-template-columns: 28px minmax\(0, 1fr\);/);
  assert.match(cockpitProjectStyles, /\.shell :global\(\.cockpit-comment-composer input\),[\s\S]*?\.shell :global\(\.cockpit-timecode\),[\s\S]*?\.shell :global\(\.cockpit-add-comment\) \{[\s\S]*?width: 100%;/);
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
  assert.match(toggleDockBody, /setActiveSection\("overview"\)/);
  assert.match(toggleDockBody, /if \(compactViewport\) setMobileDockOpen\(true\)/);
  assert.match(toggleDockBody, /else if \(!layout\.dockOpen\) toggleDock\(\)/);
});

test("production project routes render exactly one application shell", () => {
  assert.match(
    shellSource,
    /const isProjectCockpit = \/\^\\\/projects\\\/.*\.test\(pathname\)/,
  );
  assert.doesNotMatch(shellSource, /const isProjectCockpit = Boolean\(demoSuffix\)/);
});

test("project transitions clear stale data and cancel superseded requests", () => {
  assert.match(projectPageSource, /const controller = new AbortController\(\)/);
  assert.match(projectPageSource, /setRemoteProject\(null\)/);
  assert.match(projectPageSource, /setRemoteAssets\(\[\]\)/);
  assert.match(projectPageSource, /projectPayload\.id !== id/);
  assert.match(projectPageSource, /controller\.abort\(\)/);
});

test("production asset detail is committed only to its matching selected asset", () => {
  assert.match(cockpitSource, /const liveAssetRequestRef = useRef\(0\)/);
  assert.match(cockpitSource, /liveAssetDataId === activeAsset\?\.id \? liveComments : \[\]/);
  assert.match(cockpitSource, /liveAssetRequestRef\.current !== requestId/);
  assert.match(cockpitSource, /setLiveAssetDataId\(assetId\)/);
});

test("the down-arrow shortcut creates a reviewable cut proposal, not an accepted edit", () => {
  assert.match(cockpitSource, /status: "proposed"/);
  assert.match(cockpitSource, /Cut proposal saved/);
});

test("frame-pin coordinates are measured against the full video frame", () => {
  const handlerBody = cockpitSource.match(
    /function handleReviewFrameClick\(event: ReactPointerEvent<HTMLDivElement>\) \{([\s\S]*?)\n  \}\n\n  async function addCutDecision/,
  )?.[1];

  assert.ok(handlerBody, "review frame click handler is missing");
  assert.match(handlerBody, /videoFrameRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(handlerBody, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(handlerBody, /Math\.max\(0, Math\.min\(100,/);
  assert.match(handlerBody, /setPendingPin\(\{ x, y, timeSeconds: currentTime \}\)/);
});

test("production approval and version labels come from indexed records", () => {
  assert.match(projectAssetsRouteSource, /approvals\(id, status, step_order, role_label, assignee_email\)/);
  assert.match(projectAssetsRouteSource, /versions\(count\)/);
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
  assert.equal(cockpitSource.match(/mediaResolutionLabel\(activeAsset, demoMode\)/g)?.length, 2);
  assert.equal(cockpitSource.match(/mediaFrameRateLabel\(activeAsset, demoMode\)/g)?.length, 2);
});

test("demo upload terminal states stay readable and dismissible", () => {
  assert.match(cockpitSource, /onUploadDismiss\?: \(\) => void/);
  assert.match(cockpitSource, /const uploadTerminal =\s*uploadStatus\?\.phase === "complete" \|\| uploadStatus\?\.phase === "error"/);
  assert.match(cockpitSource, /\{uploadStatus \? \(/);
  assert.match(cockpitSource, /className="cockpit-upload-close"/);
  assert.match(cockpitSource, /A new version is now available in Project Browser and Version history/);
  assert.match(cockpitSource, /No version was added\. Retry from Upload when the issue is fixed/);
  assert.match(cockpitSource, /Review new version/);
  assert.match(projectPageSource, /let keepTerminalStatus = false/);
  assert.match(projectPageSource, /keepTerminalStatus = true/);
  assert.match(projectPageSource, /function dismissUploadStatus\(\)/);
  assert.match(projectPageSource, /onUploadDismiss=\{dismissUploadStatus\}/);
  assert.match(globalStyles, /\.cockpit-upload-close \{/);
  assert.match(globalStyles, /section\[data-state="complete"\] footer > button/);
});
