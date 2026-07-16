import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(
  repositoryRoot,
  "components/cockpit/CockpitReviewTimeline.tsx",
);
const stylesheetPath = resolve(
  repositoryRoot,
  "components/cockpit/CockpitReviewTimeline.module.css",
);
const componentSource = readFileSync(componentPath, "utf8");
const stylesheetSource = readFileSync(stylesheetPath, "utf8");

interface TimelinePropsForTest {
  durationSeconds: number;
  currentTimeSeconds?: number;
  sourceMedia?: readonly {
    id: string;
    label: string;
    startSeconds: number;
    endSeconds: number;
  }[];
  comments?: readonly {
    id: string;
    timeSeconds: number;
    label?: string;
    status?: "open" | "resolved";
  }[];
  cutDecisions?: readonly {
    id: string;
    timeSeconds: number;
    label?: string;
    status?: "proposed" | "accepted" | "rejected" | "applied";
  }[];
  showAnalysisLanes?: boolean;
  audioLaneLabel?: string;
  titleLaneLabel?: string;
}

interface TimelineModule {
  default: ComponentType<TimelinePropsForTest>;
  buildTimelineTicks: (
    durationSeconds: number,
    zoom: number,
  ) => Array<{ seconds: number; positionPercent: number; label: string }>;
  getNextTimelineZoom: (
    currentZoom: number,
    action: "zoom-in" | "zoom-out" | "fit",
  ) => number;
  getTimelinePositionPercent: (timeSeconds: number, durationSeconds: number) => number;
}

function loadTimelineModule(): TimelineModule {
  const output = ts.transpileModule(componentSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: componentPath,
  }).outputText;
  const loadedModule = { exports: {} as TimelineModule };
  const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
  const styles = new Proxy({}, {
    get: (_target, key) => String(key),
  });

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") {
      return new Proxy({}, { get: () => Icon });
    }
    if (specifier === "./CockpitReviewTimeline.module.css") return styles;
    throw new Error(`Unexpected CockpitReviewTimeline import: ${specifier}`);
  }

  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: typeof mockRequire,
    moduleRecord: typeof loadedModule,
    exports: TimelineModule,
  ) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const timeline = loadTimelineModule();

function renderTimeline(props: TimelinePropsForTest) {
  return renderToStaticMarkup(React.createElement(timeline.default, props));
}

test("ticks and marker positions derive from explicit duration", () => {
  assert.equal(timeline.getTimelinePositionPercent(25, 100), 25);
  assert.equal(timeline.getTimelinePositionPercent(75, 100), 75);
  assert.equal(timeline.getTimelinePositionPercent(125, 100), 100);
  assert.equal(timeline.getTimelinePositionPercent(Number.NaN, 100), 0);

  const fitTicks = timeline.buildTimelineTicks(120, 1);
  const zoomedTicks = timeline.buildTimelineTicks(120, 4);
  assert.equal(fitTicks[0].seconds, 0);
  assert.equal(fitTicks.at(-1)?.seconds, 120);
  assert.equal(fitTicks.at(-1)?.positionPercent, 100);
  assert.ok(zoomedTicks.length > fitTicks.length);
  assert.equal(timeline.buildTimelineTicks(0, 4).length, 0);
});

test("zoom steps are bounded and Fit restores the whole duration", () => {
  assert.equal(timeline.getNextTimelineZoom(1, "zoom-out"), 1);
  assert.equal(timeline.getNextTimelineZoom(1, "zoom-in"), 2);
  assert.equal(timeline.getNextTimelineZoom(4, "zoom-in"), 4);
  assert.equal(timeline.getNextTimelineZoom(3, "zoom-out"), 2);
  assert.equal(timeline.getNextTimelineZoom(4, "fit"), 1);

  assert.match(componentSource, /value=\{zoom\}/);
  assert.match(componentSource, /applyZoom\(getNextTimelineZoom\(zoom, "zoom-in"\)\)/);
  assert.match(componentSource, /applyZoom\(getNextTimelineZoom\(zoom, "fit"\)\)/);
  assert.match(componentSource, /nextViewport\.scrollTo\(\{ left: 0, behavior: "auto" \}\)/);
});

test("the rendered timeline preserves source names and positions real markers", () => {
  const markup = renderTimeline({
    durationSeconds: 100,
    currentTimeSeconds: 50,
    sourceMedia: [{
      id: "source-1",
      label: "Interview master",
      startSeconds: 10,
      endSeconds: 90,
    }],
    comments: [{
      id: "comment-1",
      timeSeconds: 25,
      label: "Tighten this answer",
      status: "open",
    }],
    cutDecisions: [{
      id: "cut-1",
      timeSeconds: 75,
      label: "Remove pause",
      status: "accepted",
    }],
  });

  assert.match(markup, /data-lane="source-media"/);
  assert.match(markup, /data-lane="comments"/);
  assert.match(markup, /data-lane="cut-decisions"/);
  assert.match(markup, />Interview master</);
  assert.doesNotMatch(markup, /Interview master\.[A-Za-z0-9]+/);
  assert.match(markup, /left:10%;width:80%/);
  assert.match(markup, /left:25%/);
  assert.match(markup, /left:75%/);
  assert.match(markup, /aria-label="Comment: Tighten this answer at 00:25, open"/);
  assert.match(markup, /aria-label="Cut decision: Remove pause at 01:15, accepted"/);
  assert.doesNotMatch(markup, />Audio<|>Titles?</);
});

test("only populated truthful lanes render", () => {
  const commentsOnly = renderTimeline({
    durationSeconds: 60,
    comments: [{ id: "comment-1", timeSeconds: 30 }],
    sourceMedia: [{
      id: "invalid-source",
      label: "Outside duration",
      startSeconds: 70,
      endSeconds: 80,
    }],
    cutDecisions: [{ id: "invalid-cut", timeSeconds: 61 }],
  });
  assert.match(commentsOnly, /data-lane="comments"/);
  assert.doesNotMatch(commentsOnly, /data-lane="source-media"/);
  assert.doesNotMatch(commentsOnly, /data-lane="cut-decisions"/);
  assert.doesNotMatch(commentsOnly, /Outside duration|invalid-cut/);

  const empty = renderTimeline({ durationSeconds: 60 });
  assert.doesNotMatch(empty, /data-lane=/);
  assert.match(empty, /No timeline data/);
});

test("review cockpit can show honest pending audio and title lanes", () => {
  const markup = renderTimeline({
    durationSeconds: 100,
    sourceMedia: [{
      id: "source-1",
      label: "Interview master",
      startSeconds: 0,
      endSeconds: 100,
    }],
    showAnalysisLanes: true,
    audioLaneLabel: "Waveform pending",
    titleLaneLabel: "Title pass pending",
  });

  assert.match(markup, /data-lane="audio-analysis"/);
  assert.match(markup, /data-lane="titles"/);
  assert.match(markup, />Audio</);
  assert.match(markup, />Titles</);
  assert.match(markup, /Waveform pending/);
  assert.match(markup, /Title pass pending/);
});

test("markers and zoom controls use native keyboard-operable controls", () => {
  const markup = renderTimeline({
    durationSeconds: 60,
    comments: [{ id: "comment-1", timeSeconds: 20 }],
    cutDecisions: [{ id: "cut-1", timeSeconds: 40 }],
  });
  assert.match(markup, /<button[^>]*type="button"[^>]*data-status="open"/);
  assert.match(markup, /<button[^>]*type="button"[^>]*data-status="proposed"/);
  assert.match(markup, /aria-label="Zoom out timeline"/);
  assert.match(markup, /aria-label="Timeline zoom"/);
  assert.match(markup, /aria-label="Zoom in timeline"/);
  assert.match(markup, /aria-pressed="true"[^>]*>.*Fit/s);
});

test("the bright cockpit surface stays bounded and collapses to a mobile summary", () => {
  assert.match(stylesheetSource, /min-height:\s*156px/);
  assert.match(stylesheetSource, /max-height:\s*280px/);
  assert.match(stylesheetSource, /var\(--cockpit-accent, #145bb8\)/);
  assert.match(stylesheetSource, /var\(--cockpit-border, #dfe4ec\)/);
  assert.match(stylesheetSource, /@media \(max-width: 640px\)/);
  assert.match(
    stylesheetSource,
    /@media \(max-width: 640px\)[\s\S]*?\.desktopStage,[\s\S]*?\.controls \{[\s\S]*?display: none;/,
  );
  assert.match(
    stylesheetSource,
    /@media \(max-width: 640px\)[\s\S]*?\.mobileSummary \{[\s\S]*?display: flex;/,
  );
  assert.doesNotMatch(stylesheetSource, /gradient\(/i);

  for (const match of stylesheetSource.matchAll(/border-radius:\s*(\d+)px/g)) {
    assert.ok(Number(match[1]) <= 8, `border radius ${match[1]}px exceeds 8px`);
  }
});
