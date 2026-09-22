import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(
  repositoryRoot,
  "components/review/annotation/AnnotationToolbar.tsx",
);

function loadToolbar() {
  const output = ts.transpileModule(readFileSync(componentPath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: componentPath,
  }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: (specifier: string) => unknown,
    moduleRecord: typeof loaded,
    exports: Record<string, unknown>,
  ) => void;
  const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
  evaluate((specifier) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") {
      return {
        ArrowUpRight: Icon,
        Eraser: Icon,
        MessageSquarePlus: Icon,
        PenLine: Icon,
        Pencil: Icon,
        Square: Icon,
        X: Icon,
      };
    }
    if (specifier === "@/lib/review/annotation") {
      return { MAX_REVIEW_ANNOTATIONS: 20 };
    }
    throw new Error(`Unexpected toolbar import: ${specifier}`);
  }, loaded, loaded.exports);
  return loaded.exports.default as React.ComponentType<Record<string, unknown>>;
}

const Toolbar = loadToolbar();
const baseProps = {
  drawMode: true,
  tool: "freehand",
  onToggleDrawMode() {},
  onToolChange() {},
  onClear() {},
  onAddComment() {},
};

test("toolbar explains how to recover when the drawing reaches twenty strokes", () => {
  const markup = renderToStaticMarkup(
    React.createElement(Toolbar, { ...baseProps, strokeCount: 20 }),
  );

  assert.match(markup, /data-annotation-limit="reached"/);
  assert.match(markup, /role="status"/);
  assert.match(
    markup,
    /20-stroke limit reached\. Add this drawing as a comment or clear it to keep drawing\./,
  );
  assert.match(markup, /data-draw-clear="true"/);
  assert.match(markup, /data-draw-comment="true"/);
});

test("toolbar stays compact while another stroke can still be added", () => {
  const markup = renderToStaticMarkup(
    React.createElement(Toolbar, { ...baseProps, strokeCount: 19 }),
  );

  assert.doesNotMatch(markup, /data-annotation-limit="reached"/);
  assert.doesNotMatch(markup, /stroke limit reached/i);
});
