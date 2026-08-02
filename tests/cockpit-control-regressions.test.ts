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
const cockpitStyles = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.module.css"),
  "utf8",
);
const cockpitDockStyles = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CockpitDock.module.css"),
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
  assert.match(cockpitSource, /const effectiveMode = reviewViewActive \? "review" : layout\.mode/);
  assert.match(cockpitSource, /function openReviewCockpit\(\)[\s\S]*?setMode\("review"\)/);
  assert.match(cockpitSource, /reviewViewActive \|\| effectiveMode === "focus"/);
});

test("cockpit surfaces follow the URL and preserve browser back navigation", () => {
  assert.match(
    cockpitSource,
    /useEffect\(\(\) => \{[\s\S]*?searchParams\.get\("surface"\)[\s\S]*?setActiveSection\([\s\S]*?setReviewViewActive\(searchParams\.get\("view"\) === "review"\)[\s\S]*?\}, \[searchParams\]\)/,
  );

  const selectSectionBody = cockpitSource.match(
    /function selectSection\(section: CockpitSection\) \{([\s\S]*?)\n  \}\n\n  function selectPlanWorkspace/,
  )?.[1];

  assert.ok(selectSectionBody, "surface navigation handler is missing");
  assert.match(selectSectionBody, /params\.delete\("view"\)/);
  assert.match(selectSectionBody, /params\.delete\("surface"\)/);
  assert.match(selectSectionBody, /params\.set\("surface", section\)/);
  assert.match(selectSectionBody, /router\.push\(/);
  assert.doesNotMatch(selectSectionBody, /router\.replace\(/);
});

test("asset deep links follow browser navigation and clear selected asset state", () => {
  assert.match(
    cockpitSource,
    /useEffect\(\(\) => \{[\s\S]*?requestedAssetId === activeAssetId[\s\S]*?assets\.find\(\(asset\) => asset\.id === requestedAssetId\)[\s\S]*?selectAsset\(requestedAsset\)[\s\S]*?\}, \[activeAssetId, assets, requestedAssetId, selectAsset\]\)/,
  );
  assert.match(cockpitSource, /const selectAsset = useCallback\([\s\S]*?setLiveComments\(\[\]\)[\s\S]*?setLiveCutMarkers\(\[\]\)[\s\S]*?setLiveShareLinks\(\[\]\)/);
});

test("production cockpit authority is explicit and fails closed", () => {
  assert.match(cockpitSource, /workspaceRole: WorkspaceRole/);
  assert.doesNotMatch(cockpitSource, /DEFAULT_COCKPIT_ROLE|workspaceRole\s*=\s*"owner"/);
  assert.match(projectPageSource, /useIdentityContext\(!demoMode\)/);
  assert.match(projectPageSource, /workspaceRole="owner"/);
  assert.match(projectPageSource, /workspaceRole=\{navigationRoleForIdentity\(identity\.context\)\}/);
  assert.match(cockpitSource, /function requestUpload\(\)[\s\S]*?!canUpload \|\| uploading[\s\S]*?onUpload\(\)/);
  assert.match(cockpitSource, /function openShareControls\(\)[\s\S]*?!canShare \|\| !activeAsset[\s\S]*?setShareOpen\(true\)/);
});

test("cockpit sign-out preserves the session when logout fails", () => {
  const signOutBody = cockpitSource.match(
    /async function signOut\(\) \{([\s\S]*?)\n  \}\n\n  function requestUpload/,
  )?.[1];
  assert.ok(signOutBody, "cockpit sign-out handler is missing");
  assert.match(signOutBody, /credentials: "same-origin"/);
  assert.match(signOutBody, /cache: "no-store"/);
  assert.match(signOutBody, /if \(!response\?\.ok\)[\s\S]*?Sign out did not complete[\s\S]*?return;/);
  assert.match(signOutBody, /window\.location\.href = "\/login"/);
});

test("dynamic cockpit thumbnails bypass the Next image host allowlist", () => {
  assert.match(
    cockpitSource,
    /src=\{asset\.thumbnail_url \?\? "\/demo\/ceraweek-speaker\.jpg"\}[\s\S]*?width=\{46\}[\s\S]*?height=\{30\}[\s\S]*?\bunoptimized\b/,
  );
});

test("the cockpit uses the truthful shared review timeline", () => {
  assert.match(cockpitSource, /<CockpitReviewTimeline/);
  assert.match(cockpitSource, /durationSeconds=\{previewDuration\}/);
  assert.match(cockpitSource, /label: activeAsset\.title/);
  assert.match(
    cockpitSource,
    /comments=\{comments[\s\S]*?\.filter\(\(comment\) => !comment\.parent_id\)[\s\S]*?\.map\(\(comment\) => \(\{/,
  );
  assert.match(cockpitSource, /selectedCommentId=\{selectedCommentId\}/);
  assert.match(cockpitSource, /onMarkerActivate=\{\(marker\) => \{[\s\S]*?selectReviewComment\(comment, false\)/);
  assert.match(cockpitSource, /cutDecisions=\{cutMarkers\.map/);
  assert.doesNotMatch(cockpitSource, /activeAsset\.title\}\.mp4/);
});

test("playback restarts from the beginning when toggled at media end", () => {
  assert.match(
    cockpitSource,
    /async function togglePlayback\(\) \{[\s\S]*?if \(currentTime >= previewDuration\) seekTo\(0\)/,
  );
});

test("saved seek steps hydrate after the deterministic first render", () => {
  assert.match(cockpitSource, /const \[seekStepSeconds, setSeekStepSeconds\] = useState\(2\)/);
  assert.match(
    cockpitSource,
    /useEffect\(\(\) => \{[\s\S]*?localStorage\.getItem\("co-deliver-review-seek-step"\)[\s\S]*?setSeekStepSeconds\(normalizeReviewSeekStep\(saved\)\)[\s\S]*?\}, \[\]\)/,
  );
  assert.doesNotMatch(
    cockpitSource,
    /useState\(\(\) => \{[\s\S]*?localStorage\.getItem\("co-deliver-review-seek-step"\)/,
  );
});

test("mobile review shortcuts reveal their intended dock sections", () => {
  assert.match(cockpitSource, /setMobileDockTarget\("comments"\);[\s\S]*?selectDockTab\("review"\)/);
  assert.match(cockpitSource, /setMobileDockTarget\("transcript"\);[\s\S]*?selectDockTab\("review"\)/);
  assert.match(cockpitSource, /ref=\{commentsDockSectionRef\}[\s\S]*?<h2>Comments<\/h2>/);
  assert.match(cockpitSource, /ref=\{transcriptDockSectionRef\}[\s\S]*?<h2>Transcript & cleanup<\/h2>/);
  assert.match(cockpitSource, /target\?\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(cockpitSource, /target\?\.focus\(\{ preventScroll: true \}\)/);
});

test("the locked review summary stays dense on desktop and stacks on mobile", () => {
  assert.match(cockpitSource, /className="cockpit-focus-strip"/);
  assert.match(cockpitStyles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(
    cockpitStyles,
    /@media \(max-width: 640px\)[\s\S]*?cockpit-focus-strip[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
});

test("the desktop review dock keeps the canonical collaboration-column width", () => {
  assert.match(
    globalStyles,
    /\.cockpit-overview-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 332px;/,
  );
});

test("project notifications use the canonical notification bell instead of activity", () => {
  assert.match(cockpitSource, /<NotificationBell[\s\S]*?projectId=\{project\.id\}/);
  assert.doesNotMatch(cockpitSource, /projectActivity\.slice\(0, 3\)/);
});

test("approval links and public decisions remain visible in the operator dock", () => {
  assert.match(cockpitSource, /workspace\.shareLinks[\s\S]*?link\.share_intent === "approval_needed"/);
  assert.match(cockpitSource, /workspace\.publicReviewStates\.find/);
  assert.match(cockpitSource, /state\.review_invite_id === link\.id/);
  assert.match(cockpitSource, /name: "Client approval"/);
  assert.match(cockpitSource, /approved_reviewer_names: approved \? \[reviewer\] : \[\]/);
});

test("operator dock tabs stay compact instead of exposing crowded labels by viewport", () => {
  assert.match(cockpitDockStyles, /\.tab > span:not\(\.count\) \{\s*display: none;/);
  assert.doesNotMatch(
    cockpitDockStyles,
    /@media \(min-width:[\s\S]*?\.tab > span:not\(\.count\)[\s\S]*?display: inline/,
  );
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
  assert.match(
    cockpitSource,
    /liveAssetDataId === activeAssetRecordId && liveAssetDataVersionId === activeVersionId[\s\S]*\? liveComments[\s\S]*: \[\]/,
  );
  assert.match(cockpitSource, /liveAssetRequestRef\.current !== requestId/);
  assert.match(cockpitSource, /setLiveAssetDataId\(assetId\)/);
});

test("the down-arrow shortcut creates a reviewable cut proposal, not an accepted edit", () => {
  assert.match(cockpitSource, /status: "proposed"/);
  assert.match(cockpitSource, /Cut proposal saved/);
});

test("production approval and version labels come from indexed records", () => {
  assert.match(projectAssetsRouteSource, /approvals\(id, status, step_order, role_label, assignee_email\)/);
  assert.match(projectAssetsRouteSource, /versions\(count\)/);
  assert.match(cockpitSource, /approval\.role_label \|\| "Approval"/);
  assert.doesNotMatch(cockpitSource, /Assigned reviewer/);
  assert.match(cockpitSource, /Version not indexed/);
});

test("review links expose honest single-asset, batch, and password readiness", () => {
  assert.match(cockpitSource, /const activeProjectLinks = projectLinks\.filter\(\(link\) => link\.is_active\)/);
  assert.match(cockpitSource, /const batchShareStatus = demoMode/);
  assert.match(cockpitSource, /Batch share from project library/);
  assert.match(cockpitSource, /cockpit-share-readiness-grid/);
  assert.match(cockpitSource, /Share scope/);
  assert.match(cockpitSource, /download-enabled/);
  assert.match(cockpitSource, /Password gate/);
  assert.match(cockpitSource, /password-protected/);
  assert.doesNotMatch(cockpitSource, /Password gates are not backend-backed/);
});
