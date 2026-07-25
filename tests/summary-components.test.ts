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
const panelPath = resolve(repositoryRoot, "components/summary/ProducerSummaryPanel.tsx");
const boardPath = resolve(repositoryRoot, "components/summary/TriageBoard.tsx");
const boardSource = readFileSync(boardPath, "utf8");
const panelSource = readFileSync(panelPath, "utf8");

interface SummaryCommentForTest {
  id: string;
  author_name: string;
  body: string;
  timecode_seconds: number | null;
  status: string;
}

interface PanelPropsForTest {
  projectName: string;
  assetTitle: string;
  versionLabel: string;
  reviewWindow: string;
  approvalStatus: string;
  comments: SummaryCommentForTest[];
  completerName: string;
}

interface TriageStoreState {
  triage: Record<string, { comment_id: string; state: string; completed_by: string; completed_at: string }>;
  overrides: Record<string, string>;
  markTriaged: (commentId: string, state: string, completedBy: string) => void;
  clearTriageRecord: (commentId: string) => void;
  setClassificationOverride: (commentId: string, classification: string | null) => void;
  reset: () => void;
}

type TriageStoreHook = {
  <T>(selector: (state: TriageStoreState) => T): T;
  getState: () => TriageStoreState;
};

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

// Real pure-logic chain — the production classifier/consolidator/triage run
// inside these tests, not stubs.
const classifyModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/summary/classify.ts")),
  () => {
    throw new Error("classify.ts must stay dependency-free");
  },
);
const consolidateModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/summary/consolidate.ts")),
  (specifier: string) => {
    if (specifier === "./classify") return classifyModule;
    throw new Error(`Unexpected consolidate import: ${specifier}`);
  },
);
const triageModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/summary/triage.ts")),
  () => {
    throw new Error("triage.ts must stay dependency-free");
  },
);

// The store mock keeps the exact action semantics of lib/summary/triageStore
// (upsert with completer + timestamp, clear, override) over a mutable snapshot.
// A real zustand store would report its *initial* state under
// renderToStaticMarkup (useSyncExternalStore's server snapshot), which would
// make every re-render assertion meaningless; the production store's own
// logic is covered in tests/summary.test.ts instead.
let mockState: TriageStoreState;

function buildMockState(): TriageStoreState {
  const state = {
    triage: {},
    overrides: {},
    markTriaged: (commentId: string, triageState: string, completedBy: string) => {
      mockState = {
        ...mockState,
        triage: {
          ...mockState.triage,
          [commentId]: {
            comment_id: commentId,
            state: triageState,
            completed_by: completedBy,
            completed_at: "2026-07-25T12:00:00.000Z",
          },
        },
      };
    },
    clearTriageRecord: (commentId: string) => {
      const next = { ...mockState.triage };
      delete next[commentId];
      mockState = { ...mockState, triage: next };
    },
    setClassificationOverride: (commentId: string, classification: string | null) => {
      const overrides = { ...mockState.overrides };
      if (classification === null) delete overrides[commentId];
      else overrides[commentId] = classification;
      mockState = { ...mockState, overrides };
    },
    reset: () => {
      const actions = mockState;
      mockState = {
        ...buildMockState(),
        triage: {},
        overrides: {},
      };
      // Keep the same action identities across resets.
      mockState.markTriaged = actions.markTriaged;
      mockState.clearTriageRecord = actions.clearTriageRecord;
      mockState.setClassificationOverride = actions.setClassificationOverride;
      mockState.reset = actions.reset;
    },
  } as TriageStoreState;
  return state;
}

mockState = buildMockState();

const triageStore = (<T,>(selector: (state: TriageStoreState) => T): T =>
  selector(mockState)) as TriageStoreHook;
triageStore.getState = () => mockState;

const cssModuleMock = new Proxy(
  {},
  { get: (_target, property) => String(property) },
);

function loadPanelModule(): { default: ComponentType<PanelPropsForTest> } {
  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "@/lib/summary/classify") return classifyModule;
    if (specifier === "@/lib/summary/consolidate") return consolidateModule;
    if (specifier === "@/lib/summary/triage") return triageModule;
    if (specifier === "@/lib/summary/triageStore") {
      return { useSummaryTriageStore: triageStore };
    }
    if (specifier === "./summary.module.css") return cssModuleMock;
    if (specifier === "./TriageBoard") {
      return evaluateModule(transpileTsModule(boardPath), mockRequire);
    }
    throw new Error(`Unexpected summary component import: ${specifier}`);
  }
  return evaluateModule(transpileTsModule(panelPath), mockRequire) as unknown as {
    default: ComponentType<PanelPropsForTest>;
  };
}

const Panel = loadPanelModule().default;

const DEMO_COMMENTS: SummaryCommentForTest[] = [
  {
    id: "c-fix",
    author_name: "Client Reviewer",
    body: "Fix the typo in the lower third before this ships.",
    timecode_seconds: 2.0,
    status: "open",
  },
  {
    id: "c-ok",
    author_name: "Agency Producer",
    body: "Approved from the agency side — this section works as-is.",
    timecode_seconds: 2.2,
    status: "open",
  },
  {
    id: "c-q",
    author_name: "Client Reviewer",
    body: "Can we confirm the music license covers broadcast use?",
    timecode_seconds: 0.5,
    status: "open",
  },
];

function renderPanel() {
  return renderToStaticMarkup(
    React.createElement(Panel, {
      projectName: "ICA / Nashville Roadshow",
      assetTitle: "Denie McDonald_v4",
      versionLabel: "v4",
      reviewWindow: "Jul 21 – Jul 25, 2026",
      approvalStatus: "1 of 2 steps approved",
      comments: DEMO_COMMENTS,
      completerName: "Demo Producer",
    }),
  );
}

test.beforeEach(() => {
  triageStore.getState().reset();
});

test("panel renders the one-page brief header truthfully", () => {
  const markup = renderPanel();
  assert.match(markup, /Producer review summary/);
  assert.match(markup, /ICA \/ Nashville Roadshow/);
  assert.match(markup, /Denie McDonald_v4/);
  assert.match(markup, /Jul 21 – Jul 25, 2026/);
  assert.match(markup, /1 of 2 steps approved/);
});

test("heuristic classifications are labeled Suggested, never presented as fact", () => {
  const markup = renderPanel();
  assert.match(markup, /Suggested: Required correction/);
  assert.match(markup, /Suggested: Approval/);
  assert.match(markup, /Suggested: Question/);
  assert.match(markup, /rule-based suggestions, not AI/);
});

test("stakeholder conflict at the same timecode is surfaced on the board", () => {
  const markup = renderPanel();
  assert.match(markup, /1 stakeholder\s+conflict to resolve/);
  assert.match(markup, /Client Reviewer requests changes while Agency Producer approves/);
});

test("triage buttons carry honest labels and pressed state; print action is the browser dialog", () => {
  const markup = renderPanel();
  // Attribute order in SSR markup is not guaranteed; assert both attributes
  // on the same button with lookaheads.
  assert.match(
    markup,
    /<button(?=[^>]*aria-pressed="false")(?=[^>]*aria-label="Mark comment c-fix as Resolved")[^>]*>/,
  );
  assert.match(markup, /aria-label="Mark comment c-fix as Duplicate"/);
  assert.match(markup, /aria-label="Mark comment c-fix as Out of scope"/);
  assert.match(markup, /aria-label="Mark comment c-fix as Needs clarification"/);
  assert.match(markup, /Open print dialog to save as PDF/);

  // Wiring is real: triage buttons call the store actions, print calls window.print.
  assert.match(boardSource, /markTriaged\(comment\.id, state, completerName\)/);
  assert.match(boardSource, /clearTriageRecord\(comment\.id\)/);
  assert.match(panelSource, /window\.print\(\)/);
});

test("triaging a comment updates counts live and records the completer", () => {
  const before = renderPanel();
  assert.match(before, /3 comments/);
  assert.match(before, /3 untriaged/);
  assert.match(before, /0 resolved/);

  // The exact store action the Resolved button invokes.
  triageStore.getState().markTriaged("c-fix", "resolved", "Demo Producer");
  const after = renderPanel();
  assert.match(after, /2 untriaged/);
  assert.match(after, /1 resolved/);
  assert.match(after, /Resolved by Demo Producer/);
  assert.match(
    after,
    /<button(?=[^>]*aria-pressed="true")(?=[^>]*aria-label="Mark comment c-fix as Resolved")[^>]*>/,
  );

  triageStore.getState().clearTriageRecord("c-fix");
  const cleared = renderPanel();
  assert.match(cleared, /3 untriaged/);
});

test("producer override replaces the Suggested badge with a confirmed one", () => {
  triageStore.getState().setClassificationOverride("c-fix", "creative_preference");
  const markup = renderPanel();
  assert.match(markup, /Producer confirmed \(suggested: Required correction\)/);
  // The heuristic badge (with its signal tooltip) is gone from the card; the
  // select still offers "Suggested: …" as the reset path, which is intended.
  assert.doesNotMatch(markup, /Heuristic signals: imperative-fix/);
});
