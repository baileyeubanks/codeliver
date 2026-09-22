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
const componentPath = resolve(
  repositoryRoot,
  "components/whiteboard/ProjectWhiteboardClient.tsx",
);
const stylesheetPath = resolve(
  repositoryRoot,
  "components/whiteboard/WhiteboardCanvas.module.css",
);

interface WhiteboardModule {
  default: ComponentType;
}

interface MockSticky {
  id: string;
  kind: "sticky";
  phase: string;
  title: string;
  body: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
    { URLSearchParams },
  ) as (
    loader: typeof mockRequire,
    moduleRecord: typeof loadedModule,
    exports: Record<string, unknown>,
  ) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

/** Load the real pure-logic chain so the rendered board uses production math. */
function loadWhiteboardLib() {
  const geometry = evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "lib/whiteboard/geometry.ts")),
    () => {
      throw new Error("geometry.ts must stay dependency-free");
    },
  );
  const model = evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "lib/whiteboard/model.ts")),
    () => {
      throw new Error("model.ts must stay dependency-free");
    },
  );
  const connectors = evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "lib/whiteboard/connectors.ts")),
    () => {
      throw new Error("connectors.ts must stay dependency-free");
    },
  );
  const templates = evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "lib/whiteboard/templates.ts")),
    (specifier: string) => {
      if (specifier === "./geometry.ts") return geometry;
      if (specifier === "./model.ts") return model;
      throw new Error(`Unexpected templates import: ${specifier}`);
    },
  );
  return { geometry, model, connectors, templates };
}

function makeWorkspace(stickies: MockSticky[]) {
  return {
    projects: [{ id: "ica", name: "ICA", stage: "review" }],
    whiteboardBoards: [
      {
        project_id: "ica",
        nodes: stickies,
        edges: [],
        template_id: null,
        updated_at: "2026-07-14T22:10:00.000Z",
      },
    ],
  };
}

const SEEDED_STICKIES: MockSticky[] = [
  {
    id: "wb-sticky-ica-lower-third",
    kind: "sticky",
    phase: "post",
    title: "",
    body: "Hold the lower third for another beat — Charles Drummond_v5",
    x: 1088,
    y: 336,
    width: 176,
    height: 144,
  },
  {
    id: "wb-sticky-ica-final-approval",
    kind: "sticky",
    phase: "delivery",
    title: "",
    body: "Final approval: Lena Ortiz — ICA_ROADSHOW_x_FINAL",
    x: 1312,
    y: 368,
    width: 176,
    height: 144,
  },
];

function loadWhiteboardModule(stickies: MockSticky[]): WhiteboardModule {
  const lib = loadWhiteboardLib();
  const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
  const iconProxy = new Proxy(
    {},
    { get: () => Icon },
  );
  const classNameProxy = new Proxy(
    {},
    { get: (_target, key: string) => key },
  );

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") return iconProxy;
    if (specifier === "next/navigation") {
      return {
        useParams: () => ({ id: "ica" }),
        useRouter: () => ({ push: () => undefined }),
        useSearchParams: () => new URLSearchParams("demo=1&asset=ica-roadshow-final&view=review"),
      };
    }
    if (specifier === "@/lib/demo/mode") return { useDemoMode: () => true };
    if (specifier === "@/components/projects/ProjectWorkspaceTabs") {
      return {
        ProjectWorkspaceChrome: ({
          activeWhiteboard,
          children,
          primaryActionLabel,
          projectQuery,
        }: {
          activeWhiteboard?: boolean;
          children: React.ReactNode;
          primaryActionLabel?: string;
          projectQuery: string;
        }) => React.createElement(
          "div",
          {
            "data-project-workspace-chrome": "true",
            "data-active-whiteboard": String(activeWhiteboard),
            "data-primary-action": primaryActionLabel,
            "data-project-query": projectQuery,
          },
          children,
        ),
      };
    }
    if (specifier === "@/components/cockpit/cockpit-navigation") return {};
    if (specifier === "@/lib/demo/workspace-store") {
      return {
        useDemoWorkspace: () => makeWorkspace(stickies),
        addWhiteboardSticky: () => ({ ok: true, id: "wb-sticky-new" }),
        updateWhiteboardSticky: () => ({ ok: true, id: "x" }),
        moveWhiteboardNode: () => ({ ok: true, id: "x" }),
        deleteWhiteboardNode: () => ({ ok: true, id: "x" }),
        applyDemoWhiteboardTemplate: () => ({ ok: true, id: "brand-film" }),
        restoreDemoWhiteboardContent: () => ({ ok: true, id: "ica" }),
      };
    }
    if (specifier === "@/lib/whiteboard/geometry") return lib.geometry;
    if (specifier === "@/lib/whiteboard/model") return lib.model;
    if (specifier === "@/lib/whiteboard/connectors") return lib.connectors;
    if (specifier === "@/lib/whiteboard/templates") return lib.templates;
    if (specifier === "./WhiteboardCanvas.module.css") return classNameProxy;
    throw new Error(`Unexpected ProjectWhiteboardClient import: ${specifier}`);
  }

  return evaluateModule(transpileTsModule(componentPath), mockRequire) as unknown as WhiteboardModule;
}

function renderBoard(stickies: MockSticky[] = SEEDED_STICKIES): string {
  const whiteboard = loadWhiteboardModule(stickies);
  return renderToStaticMarkup(React.createElement(whiteboard.default));
}

test("phase-flow lane renders all five phases with truthful current-phase state", () => {
  const markup = renderBoard();

  for (const phase of ["strategy", "preproduction", "production", "post", "delivery"]) {
    assert.ok(
      markup.includes(`data-phase-card="${phase}"`),
      `phase card rendered for ${phase}`,
    );
  }

  // ICA sits at the "review" stage → Post is the current phase.
  assert.match(markup, /aria-label="Post phase card, current phase — you are here"/);
  assert.equal(markup.match(/You are here/g)?.length, 1, "exactly one current-phase marker");
  assert.match(markup, /aria-label="Strategy phase card, completed"/);
  assert.match(markup, /aria-label="Delivery phase card, upcoming"/);
  assert.equal(markup.match(/✓/g)?.length, 3, "three completed-phase ticks");
});

test("seeded stickies render with accessible edit/delete targets and phase colors", () => {
  const markup = renderBoard();

  assert.ok(markup.includes("Hold the lower third for another beat"));
  assert.ok(markup.includes("Final approval: Lena Ortiz"));
  assert.match(
    markup,
    /aria-label="Sticky note, Post phase: Hold the lower third for another beat — Charles Drummond_v5"/,
  );
  assert.match(markup, /aria-label="Edit note: Hold the lower third/);
  assert.match(markup, /aria-label="Delete note: Hold the lower third/);
  assert.match(markup, /aria-label="Set note color to Post" aria-pressed="true"/);
  assert.match(markup, /aria-label="Set note color to Strategy" aria-pressed="false"/);
});

test("contextual tools keep add-note immediate and templates collapsed by default", () => {
  const markup = renderBoard();

  assert.match(markup, /aria-label="Add a sticky note at the canvas center"/);
  assert.match(markup, /aria-controls="whiteboard-templates"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.ok(markup.includes(" Add note</button>"));
  assert.ok(markup.includes(" Templates <svg"));
  assert.ok(!markup.includes("Apply the Brand film template"));
  assert.ok(!markup.includes("Undo the last template application"));
});

test("whiteboard consumes the shared project chrome and preserves asset context", () => {
  const markup = renderBoard();

  assert.match(
    markup,
    /data-project-workspace-chrome="true" data-active-whiteboard="true" data-primary-action="Open media" data-project-query="demo=1&amp;asset=ica-roadshow-final&amp;view=review"/,
  );
});

test("zoom controls announce the level and expose labeled buttons", () => {
  const markup = renderBoard();

  assert.match(markup, /role="group" aria-label="Canvas zoom"/);
  assert.match(markup, /aria-label="Zoom out"/);
  assert.match(markup, /aria-label="Zoom in"/);
  assert.match(markup, /aria-label="Reset zoom and pan"/);
  assert.match(markup, /aria-live="polite" aria-label="Current zoom level">100%</);
});

test("canvas region documents pan, zoom, and keyboard navigation", () => {
  const markup = renderBoard();

  assert.match(
    markup,
    /role="region" aria-label="ICA whiteboard canvas\. Drag empty space to pan, use the mouse wheel to zoom, arrow keys move between cards\."/,
  );
  // World layer carries the pan/zoom transform (initial frame: current phase in view).
  assert.match(markup, /transform:translate\(-600px, 24px\) scale\(1\)/);
  assert.match(markup, /aria-label="Saved locally in this browser"/);
});

test("drag completion publishes the move after leaving the React state updater", () => {
  const source = readFileSync(componentPath, "utf8");
  const start = source.indexOf("const handleNodePointerUp");
  const end = source.indexOf("const nodePosition", start);
  const handler = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "drag completion handler is present");
  assert.doesNotMatch(
    handler,
    /setDrag\(\(current\) =>/,
    "workspace publication must not run inside a React state updater",
  );
  assert.ok(
    handler.indexOf("setDrag(null)") < handler.indexOf("moveWhiteboardNode("),
  );
});

test("empty board shows the template CTA empty state", () => {
  const markup = renderBoard([]);

  assert.ok(markup.includes("This board is a blank page"));
  assert.match(markup, /aria-label="Start with the Brand film template"/);
  assert.match(markup, /aria-label="Start with the Social campaign template"/);

  const populated = renderBoard();
  assert.ok(!populated.includes("This board is a blank page"));
});

test("interactive targets meet the 44px minimum in the stylesheet", () => {
  const css = readFileSync(stylesheetPath, "utf8");

  const stickyAction = css.slice(css.indexOf(".stickyAction {"), css.indexOf(".stickyAction:hover"));
  assert.match(stickyAction, /min-width: 44px/);
  assert.match(stickyAction, /min-height: 44px/);

  const toolbarButton = css.slice(css.indexOf(".toolbarButton {"), css.indexOf(".toolbarButton:hover"));
  assert.match(toolbarButton, /min-height: 44px/);

  const zoomButton = css.slice(css.indexOf(".zoomButton {"), css.indexOf(".zoomButton:hover"));
  assert.match(zoomButton, /min-width: 44px/);
  assert.match(zoomButton, /min-height: 44px/);

  const source = readFileSync(componentPath, "utf8");
  assert.match(source, /<ProjectWorkspaceChrome\b/);
  assert.doesNotMatch(css, /\.backLink\s*\{/);
});

test("mobile zoom controls reserve clearance above the shared project bar", () => {
  const css = readFileSync(stylesheetPath, "utf8");

  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.zoomControls\s*\{\s*bottom: calc\(76px \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(
    css,
    /@media \(max-width: 560px\)[\s\S]*?\.zoomControls\s*\{\s*bottom: calc\(80px \+ env\(safe-area-inset-bottom\)\)/,
  );
});

test("styling stays on canon tokens — phase colors come from brand-tokens vars", () => {
  const css = readFileSync(stylesheetPath, "utf8");

  // Hand-drawn look is achieved with dashed borders + uneven radii, no new fonts.
  assert.match(css, /border: 2px dashed var\(--phase-color/);
  assert.match(css, /255px 15px 225px 15px/);
  assert.ok(!css.includes("font-family: cursive"), "no novelty fonts");
  // Removed brand colors must not reappear.
  assert.ok(!/lime|tan\b/i.test(css), "no lime/tan references");
  // Canon blue drives the current-phase treatment.
  assert.match(css, /\.phaseCardCurrent \{[\s\S]*?var\(--cvp-blue\)/);
});
