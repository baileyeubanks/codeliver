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

test("phone header removes the colliding wide brand track", () => {
  const phoneRules = cockpitStyles.slice(
    cockpitStyles.indexOf("@media (max-width: 900px)"),
    cockpitStyles.indexOf("@media (max-width: 640px)"),
  );

  assert.match(
    phoneRules,
    /grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
  );
  assert.match(
    phoneRules,
    /\.shell :global\(\.cockpit-brand\)\s*\{[^}]*display:\s*none;/,
  );
  assert.doesNotMatch(
    phoneRules,
    /grid-template-columns:\s*56px minmax\(0, 1fr\) auto;/,
  );
});

test("explicit review starts with secondary details closed and keeps the review route active", () => {
  assert.match(
    cockpitSource,
    /const \[reviewDetailsOpen, setReviewDetailsOpen\] = useState\(false\)/,
  );
  assert.match(
    cockpitSource,
    /const dockVisible = compactViewport\s*\? mobileDockOpen\s*:\s*reviewViewActive\s*\? reviewDetailsOpen\s*:\s*layout\.dockOpen/,
  );
  assert.match(
    cockpitSource,
    /function toggleOperatorDock\(\)[\s\S]*?if \(reviewViewActive\) \{[\s\S]*?setReviewDetailsOpen\(\(open\) => !open\)[\s\S]*?return;/,
  );
  assert.match(
    cockpitSource,
    /className=\{styles\.reviewDetailsToggle\}[\s\S]*?aria-expanded=\{dockVisible\}[\s\S]*?Comments & review details/,
  );
  assert.match(
    cockpitStyles,
    /\.reviewDetailsToggle\s*\{[^}]*min-height:\s*44px;/,
  );
});

test("the player precedes collapsed secondary material and comments open on the film", () => {
  const renderedOverview = cockpitSource.slice(
    cockpitSource.indexOf('<main id="cockpit-workspace-content"'),
    cockpitSource.indexOf("{pipelineStages.length > 0"),
  );
  const stageIndex = renderedOverview.indexOf('className="cockpit-review-stage"');
  const composerIndex = renderedOverview.indexOf("<InlineReviewComment");
  const timelineToggleIndex = renderedOverview.indexOf("className={styles.timelineToggle}");
  const reviewArchiveIndex = renderedOverview.indexOf("className={styles.reviewArchive}");

  assert.ok(stageIndex >= 0, "review player is missing");
  assert.ok(composerIndex > stageIndex, "playhead comment composer must stay on the film");
  assert.doesNotMatch(renderedOverview, /cockpit-comment-composer|Add a timecoded comment/);
  assert.ok(timelineToggleIndex > composerIndex, "timeline disclosure belongs after the player");
  assert.ok(reviewArchiveIndex > timelineToggleIndex, "source archive belongs below the player controls");
  assert.match(cockpitSource, /function openPlayheadComment\(/);
});

test("focused review keeps the large player and composer within a standard desktop viewport", () => {
  assert.match(
    cockpitSource,
    /className=\{`cockpit-center-column \$\{reviewViewActive \? styles\.reviewCenterColumn : ""\}`\}/,
  );
  assert.match(
    cockpitStyles,
    /\.reviewCenterColumn\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*1000px;[^}]*margin:\s*0 auto;/,
  );
});

test("timeline is closed by default behind a keyboard-native 44px disclosure", () => {
  assert.match(cockpitSource, /const \[timelineOpen, setTimelineOpen\] = useState\(false\)/);
  assert.match(
    cockpitSource,
    /className=\{styles\.timelineToggle\}[\s\S]*?aria-expanded=\{timelineOpen\}[\s\S]*?aria-controls=\{`cockpit-review-timeline-\$\{project\.id\}`\}/,
  );
  assert.match(
    cockpitSource,
    /\{timelineOpen \? \([\s\S]*?<CockpitReviewTimeline[\s\S]*?\) : null\}/,
  );
  assert.match(cockpitStyles, /\.timelineToggle\s*\{[^}]*min-height:\s*44px;/);
});

test("the primary review playbar exposes exact-time comment markers without auto-opening a callout", () => {
  const controlsStart = cockpitSource.indexOf('className={`cockpit-video-controls ${styles.playerControls}`}');
  const controls = cockpitSource.slice(
    controlsStart,
    cockpitSource.indexOf('EmptyState title="No review media"', controlsStart),
  );

  assert.match(controls, /className=\{styles\.playerSeekTrack\}/);
  assert.match(controls, /primaryPlaybarComments\.map\(\(comment\) => \(/);
  assert.match(controls, /type="button"[\s\S]*?aria-label=\{`Open comment at \$\{formatActiveTimecode\(comment\.time_seconds\)\}`\}/);
  assert.match(controls, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*selectReviewComment\(comment\);\s*\}\}/);
  assert.match(cockpitStyles, /\.playerCommentMarker\s*\{[^}]*min-width:\s*28px;[^}]*min-height:\s*28px;/);
  assert.match(cockpitStyles, /\.playerCommentMarkerDot\s*\{/);

  assert.match(cockpitSource, /onComplete=\{\(\) => \{[\s\S]*?setSelectedCommentId\(null\);/);
  assert.match(cockpitSource, /onPlaybackStart=\{dismissSelectedCommentForPlayback\}/);
  const nativePlay = cockpitSource.match(/onPlay=\{\(\) => \{([\s\S]*?)\n\s*\}\}/)?.[1] ?? "";
  assert.match(nativePlay, /dismissSelectedCommentForPlayback\(\);/);
});

test("focused review replaces the status-chip wall with one source-backed summary line", () => {
  assert.match(
    cockpitSource,
    /reviewViewActive \? \([\s\S]*?className=\{styles\.reviewSummary\}[\s\S]*?formatAssetStatus\(activeAsset\.status\)[\s\S]*?openCommentCount/,
  );
  assert.match(
    cockpitSource,
    /demoMode && !reviewViewActive \? <ProjectSourceArchive projectId=\{project\.id\} \/>/,
  );
  assert.match(
    cockpitSource,
    /demoMode && reviewViewActive \? \([\s\S]*?className=\{styles\.reviewArchive\}[\s\S]*?<ProjectSourceArchive projectId=\{project\.id\} \/>/,
  );
});
