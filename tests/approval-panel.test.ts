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

import type { ApprovalStep } from "../lib/types/codeliver.ts";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(repositoryRoot, "components/approvals/ApprovalPanel.tsx");

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

/* Minimal hook shim: lets the test invoke the function component directly,
 * fire its change/click handlers, and re-render with updated state — no DOM. */
const hookStates: unknown[] = [];
let hookCursor = 0;
const reactShim = {
  useState(initial: unknown) {
    const index = hookCursor++;
    if (!(index in hookStates)) {
      hookStates[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    const setState = (value: unknown) => {
      hookStates[index] =
        typeof value === "function" ? (value as (previous: unknown) => unknown)(hookStates[index]) : value;
    };
    return [hookStates[index], setState];
  },
};

const machineModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/approvals/approval-machine.ts")),
  () => {
    throw new Error("approval-machine.ts must stay dependency-free at runtime");
  },
);

function loadPanel() {
  const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
  function mockRequire(specifier: string): unknown {
    if (specifier === "react") return reactShim;
    if (specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") {
      return {
        AlertCircle: Icon,
        CheckCircle2: Icon,
        Clock: Icon,
        Loader2: Icon,
        Lock: Icon,
        XCircle: Icon,
      };
    }
    if (specifier === "@/lib/approvals/approval-machine") return machineModule;
    throw new Error(`Unexpected ApprovalPanel import: ${specifier}`);
  }
  return evaluateModule(transpileTsModule(componentPath), mockRequire) as {
    default: (props: Record<string, unknown>) => React.ReactNode;
  };
}

const ApprovalPanel = loadPanel().default;

interface RenderedElement {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function renderPanel(props: Record<string, unknown>): RenderedElement {
  hookCursor = 0;
  return ApprovalPanel(props) as unknown as RenderedElement;
}

function walk(node: unknown, visit: (element: RenderedElement) => void) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== "object") return;
  const element = node as RenderedElement;
  if ("props" in element && element.props && typeof element.props === "object") {
    visit(element);
    walk(element.props.children, visit);
  }
}

function findAll(node: unknown, predicate: (element: RenderedElement) => boolean): RenderedElement[] {
  const found: RenderedElement[] = [];
  walk(node, (element) => {
    if (predicate(element)) found.push(element);
  });
  return found;
}

function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as RenderedElement)) {
    return textOf((node as RenderedElement).props.children);
  }
  return "";
}

function makeStep(overrides: Partial<ApprovalStep> = {}): ApprovalStep {
  return {
    id: "approval-1",
    asset_id: "demo-asset",
    workflow_id: "workflow-1",
    step_order: 1,
    role_label: "Client Lead",
    assignee_email: "reviewer@client.example",
    assignee_id: null,
    status: "pending",
    decision_note: null,
    decided_at: null,
    created_at: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

const DEMO_STEPS: ApprovalStep[] = [
  makeStep(),
  makeStep({
    id: "approval-2",
    step_order: 2,
    role_label: "Content Co-op Producer",
    assignee_email: "producer@contentcoop.example",
    status: "approved",
    decision_note: "Editorial pass is complete.",
    decided_at: "2026-07-24T09:00:00.000Z",
  }),
];

test("panel renders the asset state pill and truthful step chips", () => {
  const markup = renderToStaticMarkup(
    React.createElement(loadPanelWithRealReact(), {
      steps: DEMO_STEPS,
      workflowMode: "sequential",
      identityName: "Client Reviewer",
      onDecide: () => {},
    }),
  );

  assert.match(markup, /data-approval-state="needs_review"/, "partial approval + no comments is needs_review");
  assert.match(markup, /Needs review/);
  assert.match(markup, /Client Lead/);
  assert.match(markup, /Content Co-op Producer/);
  assert.match(markup, /Current/, "the pending sequential step is the current one");
  assert.match(markup, />Approved</, "the decided step shows its approved chip");
  assert.match(markup, /data-step-id="approval-1"[^>]*data-chip-state="current"/);
  assert.match(markup, /data-step-id="approval-2"[^>]*data-chip-state="approved"/);
  assert.match(markup, /value="Client Reviewer"/, "name is prefilled from identity");
});

/* For static-markup tests we need the real React inside the component. */
function loadPanelWithRealReact() {
  const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") {
      return {
        AlertCircle: Icon,
        CheckCircle2: Icon,
        Clock: Icon,
        Loader2: Icon,
        Lock: Icon,
        XCircle: Icon,
      };
    }
    if (specifier === "@/lib/approvals/approval-machine") return machineModule;
    throw new Error(`Unexpected ApprovalPanel import: ${specifier}`);
  }
  return (
    evaluateModule(transpileTsModule(componentPath), mockRequire) as {
      default: React.ComponentType<Record<string, unknown>>;
    }
  ).default;
}

test("one click approves the current step with identity-prefilled name and a shaped audit entry", () => {
  const decisions: Array<Record<string, unknown>> = [];
  const tree = renderPanel({
    steps: DEMO_STEPS,
    workflowMode: "sequential",
    identityName: "Client Reviewer",
    identityEmail: "reviewer@client.example",
    onDecide: (decision: Record<string, unknown>) => decisions.push(decision),
  });

  const [approveButton] = findAll(
    tree,
    (element) => element.type === "button" && textOf(element).trim() === "Approve",
  );
  assert.ok(approveButton, "Approve button renders");
  assert.equal(approveButton.props.disabled, false, "one-click approve is enabled");
  (approveButton.props.onClick as () => void)();

  assert.equal(decisions.length, 1);
  const decision = decisions[0];
  assert.equal(decision.stepId, "approval-1");
  assert.equal(decision.decision, "approved");
  assert.equal(decision.actorName, "Client Reviewer");
  assert.equal(decision.note, null);

  const audit = decision.audit as Record<string, unknown>;
  assert.equal(audit.step_id, "approval-1");
  assert.equal(audit.role_label, "Client Lead");
  assert.equal(audit.action, "approved");
  // JSON round-trip: the machine module is evaluated in a separate VM realm,
  // so strict deepEqual needs a same-realm plain object.
  assert.deepEqual(JSON.parse(JSON.stringify(audit.actor)), {
    id: null,
    name: "Client Reviewer",
    email: "reviewer@client.example",
  });
  assert.ok(!Number.isNaN(Date.parse(audit.decided_at as string)), "audit timestamp is real");
  assert.equal("user_agent" in audit, false, "userAgent is never fabricated");
});

test("typed name + note are recorded on the decision and in the audit entry", () => {
  hookStates.length = 0;
  const decisions: Array<Record<string, unknown>> = [];
  const props = {
    steps: DEMO_STEPS,
    workflowMode: "sequential",
    identityName: null,
    identityEmail: "reviewer@client.example",
    userAgent: "Mozilla/5.0 (P20 test)",
    onDecide: (decision: Record<string, unknown>) => decisions.push(decision),
  };

  let tree = renderPanel(props);
  const [nameInput] = findAll(tree, (element) => element.type === "input");
  (nameInput.props.onChange as (event: unknown) => void)({ target: { value: "Morgan Lee" } });
  tree = renderPanel(props);
  const [noteInput] = findAll(tree, (element) => element.type === "textarea");
  (noteInput.props.onChange as (event: unknown) => void)({ target: { value: "Looks good to ship." } });
  tree = renderPanel(props);

  const [approveButton] = findAll(
    tree,
    (element) => element.type === "button" && textOf(element).trim() === "Approve",
  );
  (approveButton.props.onClick as () => void)();

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].actorName, "Morgan Lee");
  assert.equal(decisions[0].note, "Looks good to ship.");
  const audit = decisions[0].audit as Record<string, unknown>;
  assert.equal((audit.actor as Record<string, unknown>).name, "Morgan Lee");
  assert.equal(audit.note, "Looks good to ship.");
  assert.equal(audit.user_agent, "Mozilla/5.0 (P20 test)", "genuine userAgent is passed through");
});

test("request changes and reject require a note before they are enabled", () => {
  hookStates.length = 0;
  const decisions: Array<Record<string, unknown>> = [];
  const props = {
    steps: DEMO_STEPS,
    workflowMode: "sequential",
    onDecide: (decision: Record<string, unknown>) => decisions.push(decision),
  };

  let tree = renderPanel(props);
  const negativeButtons = () =>
    findAll(
      tree,
      (element) =>
        element.type === "button" &&
        ["Request changes", "Reject"].includes(textOf(element).trim()),
    );

  let [requestChanges, reject] = negativeButtons();
  assert.equal(requestChanges.props.disabled, true, "request changes is gated on a note");
  assert.equal(reject.props.disabled, true, "reject is gated on a note");

  const [noteInput] = findAll(tree, (element) => element.type === "textarea");
  (noteInput.props.onChange as (event: unknown) => void)({ target: { value: "Trim the open by 8 frames." } });
  tree = renderPanel(props);

  [requestChanges, reject] = negativeButtons();
  assert.equal(requestChanges.props.disabled, false);
  assert.equal(reject.props.disabled, false);

  (requestChanges.props.onClick as () => void)();
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].decision, "changes_requested");
  assert.equal(decisions[0].note, "Trim the open by 8 frames.");
});

test("locked is terminal: the decision area is gone and the lock notice shows", () => {
  const RealReactPanel = loadPanelWithRealReact();
  const markup = renderToStaticMarkup(
    React.createElement(RealReactPanel, {
      steps: DEMO_STEPS.map((step) => ({ ...step, status: "approved" as const })),
      workflowMode: "sequential",
      locked: true,
      onDecide: () => {},
      onLock: () => {},
    }),
  );

  assert.match(markup, /data-approval-state="locked"/);
  assert.match(markup, /Locked/);
  assert.match(markup, /this approval is final/i);
  assert.doesNotMatch(markup, /Your decision/, "no approval actions render when locked");
  assert.doesNotMatch(markup, /Lock approval/, "already locked — no second lock action");
});

test("an approved (not yet locked) asset offers the lock gate", () => {
  hookStates.length = 0;
  let locks = 0;
  const tree = renderPanel({
    steps: DEMO_STEPS.map((step) => ({ ...step, status: "approved" as const })),
    workflowMode: "sequential",
    locked: false,
    onLock: () => {
      locks += 1;
    },
    onDecide: () => {},
  });

  const [lockButton] = findAll(
    tree,
    (element) => element.type === "button" && textOf(element).includes("Lock approval"),
  );
  assert.ok(lockButton, "lock gate renders once the asset is approved");
  (lockButton.props.onClick as () => void)();
  assert.equal(locks, 1);
});

test("a non-approved asset cannot be locked", () => {
  hookStates.length = 0;
  const tree = renderPanel({
    steps: DEMO_STEPS,
    workflowMode: "sequential",
    onLock: () => {},
    onDecide: () => {},
  });
  const lockButtons = findAll(
    tree,
    (element) => element.type === "button" && textOf(element).includes("Lock approval"),
  );
  assert.equal(lockButtons.length, 0, "lock only from approved");
});
