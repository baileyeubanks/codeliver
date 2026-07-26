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
    id?: string;
    timecode_seconds: number | null;
    status: string;
    body: string;
  }>;
  onSeek?: (time: number) => void;
  onCommentSelect?: (comment: unknown) => void;
  selectedCommentId?: string | null;
}

interface TimelineModule {
  default: ComponentType<TimelinePropsForTest>;
}

function transpileTsModule(modulePath: string): string {
  return ts.transpileModule(readFileSync(modulePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
}

function evaluateModule(output: string, mockRequire: (specifier: string) => unknown) {
  const loadedModule = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: typeof mockRequire,
    moduleRecord: typeof loadedModule,
    exports: Record<string, unknown>,
  ) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function loadTimelineModule(): TimelineModule {
  const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);

  // Load the real pure-logic chain (timecode → frame-review) so the chapters
  // model under test is the production one, not a stub.
  const timecodeModule = evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "components/player/timecode.ts")),
    () => {
      throw new Error("timecode.ts must stay dependency-free");
    },
  );
  const frameReviewModule = evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "lib/review/frame-review.ts")),
    (specifier: string) => {
      if (specifier === "../../components/player/timecode.ts") return timecodeModule;
      throw new Error(`Unexpected frame-review import: ${specifier}`);
    },
  );

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") return { Scissors: Icon };
    if (specifier === "@/lib/review/frame-review") return frameReviewModule;
    if (specifier === "@/lib/stores/playerStore") {
      return {
        usePlayerStore: () => ({
          currentTime: 0,
          duration: 100,
          frameRate: 24,
          bufferedEnd: 0,
          loopIn: null,
          loopOut: null,
        }),
      };
    }
    throw new Error(`Unexpected PlayerTimeline import: ${specifier}`);
  }

  return evaluateModule(transpileTsModule(componentPath), mockRequire) as unknown as TimelineModule;
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
    /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*onSeek\?\.\(tc\);\s*onCommentSelect\?\.\(comment\);\s*\}\}/,
  );
});
