import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(repositoryRoot, "components/player/PlayerTimeline.tsx");
const componentSource = readFileSync(componentPath, "utf8");

interface TimelinePropsForTest {
  comments?: Array<{
    timecode_seconds: number | null;
    status: string;
    body: string;
  }>;
  onSeek?: (time: number) => void;
}

interface TimelineModule {
  default: ComponentType<TimelinePropsForTest>;
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

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") return { Scissors: Icon };
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

test("comment markers are native buttons with truthful accessible labels", () => {
  const markup = renderToStaticMarkup(
    React.createElement(timeline.default, {
      comments: [{
        timecode_seconds: 12.5,
        status: "open",
        body: "Tighten the lower third.",
      }],
    }),
  );

  assert.match(
    markup,
    /<button[^>]*type="button"[^>]*aria-label="Comment at 12\.5 seconds, open: Tighten the lower third\."[^>]*><\/button>/,
  );
  assert.match(markup, /left:12\.5%/);
});

test("comment marker activation keeps pointer seeking isolated from the timeline bar", () => {
  const commentMarkerBlock = componentSource.slice(
    componentSource.indexOf("{/* Comment markers */}"),
    componentSource.indexOf("{cutMarkers.map"),
  );

  assert.match(commentMarkerBlock, /<button[\s\S]*?type="button"/);
  assert.match(
    commentMarkerBlock,
    /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*onSeek\?\.\(tc\);\s*\}\}/,
  );
});
