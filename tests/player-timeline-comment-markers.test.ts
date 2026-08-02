import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(repositoryRoot, "components/player/PlayerTimeline.tsx");
const componentSource = readFileSync(componentPath, "utf8");

interface TimelineModule {
  positionTimelineCommentMarkers: (
    comments: Array<{
      id?: string;
      timecode_seconds: number | null;
      status: string;
      body: string;
    }>,
    duration: number,
  ) => Array<{
    key: string;
    offsetPixels: number;
    groupIndex: number;
    groupSize: number;
    positionPercent: number;
  }>;
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
  const Icon = () => null;

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@/lib/stores/playerStore") {
      return { usePlayerStore: () => ({ currentTime: 0, duration: 100 }) };
    }
    throw new Error(`Unexpected PlayerTimeline import: ${specifier}`);
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

test("same-time comment markers have distinct reachable offsets", () => {
  const markers = timeline.positionTimelineCommentMarkers([
    { id: "first", timecode_seconds: 0, status: "open", body: "First note" },
    { id: "second", timecode_seconds: 0, status: "open", body: "Second note" },
    { id: "third", timecode_seconds: 100, status: "resolved", body: "Last note" },
    { id: "fourth", timecode_seconds: 100, status: "open", body: "Another last note" },
  ], 100);

  assert.equal(markers.length, 4);
  assert.deepEqual(Array.from(markers.slice(0, 2), (marker) => marker.offsetPixels), [0, 24]);
  assert.deepEqual(Array.from(markers.slice(2), (marker) => marker.offsetPixels), [-24, 0]);
  assert.ok(markers.every((marker) => marker.groupSize === 2));
  assert.deepEqual(Array.from(markers, (marker) => marker.groupIndex), [0, 1, 0, 1]);
  assert.deepEqual(Array.from(markers, (marker) => marker.positionPercent), [0, 0, 100, 100]);
});

test("different timecodes keep the timeline position and do not receive a collision offset", () => {
  const markers = timeline.positionTimelineCommentMarkers([
    { id: "one", timecode_seconds: 25, status: "open", body: "First" },
    { id: "two", timecode_seconds: 25.5, status: "open", body: "Second" },
  ], 100);

  assert.deepEqual(Array.from(markers, (marker) => marker.offsetPixels), [0, 0]);
  assert.deepEqual(Array.from(markers, (marker) => marker.groupSize), [1, 1]);
  assert.deepEqual(Array.from(markers, (marker) => marker.positionPercent), [25, 25.5]);
});
