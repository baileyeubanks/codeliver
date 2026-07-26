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

// Any lucide icon renders as a plain svg; icons are decorative here.
const lucideMock = new Proxy(
  {},
  {
    get: () => (props: Record<string, unknown>) => React.createElement("svg", props),
  },
);

const modelModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/requests/model.ts")),
  (specifier: string) => {
    throw new Error(`model.ts must stay dependency-free, got: ${specifier}`);
  },
);
const lifecycleModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/requests/lifecycle.ts")),
  (specifier: string) => {
    throw new Error(`lifecycle.ts must stay dependency-free, got: ${specifier}`);
  },
);
const viewsModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/requests/views.ts")),
  () => ({}), // type-only imports are erased at transpile
);

function loadComponent(relativePath: string): { default: ComponentType<never> } {
  return evaluateModule(
    transpileTsModule(resolve(repositoryRoot, relativePath)),
    (specifier: string) => {
      if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
      if (specifier === "lucide-react") return lucideMock;
      if (specifier === "@/lib/requests/model.ts") return modelModule;
      if (specifier === "@/lib/requests/lifecycle.ts") return lifecycleModule;
      if (specifier === "@/lib/requests/views.ts") return viewsModule;
      if (specifier === "./StatusChip") return statusChipModule;
      throw new Error(`Unexpected import in ${relativePath}: ${specifier}`);
    },
  ) as unknown as { default: ComponentType<never> };
}

const statusChipModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "components/requests/StatusChip.tsx")),
  (specifier: string) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "@/lib/requests/lifecycle.ts") return lifecycleModule;
    throw new Error(`Unexpected StatusChip import: ${specifier}`);
  },
);

const formModule = loadComponent("components/requests/RequestForm.tsx");
const threadModule = loadComponent("components/requests/RequestThread.tsx");

const RequestForm = formModule.default as ComponentType<{
  assets: { id: string; title: string }[];
  onSubmit: () => { ok: boolean };
  doneHref: string;
  initialKind?: string | null;
}>;
const RequestThread = threadModule.default as ComponentType<{
  messages: unknown[];
  audience: "client" | "team";
  onPost: () => { ok: boolean };
}>;
const StatusChip = (statusChipModule as unknown as { default: ComponentType<{ status: string }> })
  .default;

/* ── StatusChip ────────────────────────────────────────────────────────── */

test("StatusChip renders the truthful status label", () => {
  const markup = renderToStaticMarkup(React.createElement(StatusChip, { status: "in_progress" }));
  assert.match(markup, /data-testid="status-chip-in_progress"/);
  assert.match(markup, /In progress/);
});

/* ── RequestForm ───────────────────────────────────────────────────────── */

const FORM_ASSETS = [{ id: "ica-ceo-hero-v1", title: "ICA CEO Hero Cut_v1" }];
const noopSubmit = () => ({ ok: true });

test("kind picker offers all seven kinds as reachable radio targets", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RequestForm, {
      assets: FORM_ASSETS,
      onSubmit: noopSubmit,
      doneHref: "/portal/requests",
    }),
  );
  for (const kind of [
    "new_project",
    "edit",
    "resize",
    "caption_update",
    "social_cutdown",
    "content_refresh",
    "asset_retrieval",
  ]) {
    assert.match(markup, new RegExp(`data-testid="request-kind-${kind}"`));
  }
  // 44px touch targets on the kind cards.
  assert.match(markup, /role="radio"[^>]*class="[^"]*min-h-11/);
});

test("social_cutdown progressively reveals platform, duration, and source asset only", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RequestForm, {
      assets: FORM_ASSETS,
      onSubmit: noopSubmit,
      doneHref: "/portal/requests",
      initialKind: "social_cutdown",
    }),
  );
  assert.match(markup, /data-testid="request-source-asset"/);
  assert.match(markup, /data-testid="request-platform"/);
  assert.match(markup, /data-testid="request-duration"/);
  assert.match(markup, /aria-label="Source asset"/);
  assert.doesNotMatch(markup, /data-testid="request-ratio-/);
  assert.doesNotMatch(markup, /data-testid="request-asset-reference"/);
});

test("resize reveals aspect-ratio toggles; asset_retrieval reveals the free-text reference", () => {
  const resize = renderToStaticMarkup(
    React.createElement(RequestForm, {
      assets: FORM_ASSETS,
      onSubmit: noopSubmit,
      doneHref: "/portal/requests",
      initialKind: "resize",
    }),
  );
  assert.match(resize, /data-testid="request-ratio-9-16"/);
  assert.match(resize, /data-testid="request-ratio-1-1"/);
  assert.doesNotMatch(resize, /data-testid="request-duration"/);

  const retrieval = renderToStaticMarkup(
    React.createElement(RequestForm, {
      assets: FORM_ASSETS,
      onSubmit: noopSubmit,
      doneHref: "/portal/requests",
      initialKind: "asset_retrieval",
    }),
  );
  assert.match(retrieval, /data-testid="request-asset-reference"/);
  assert.doesNotMatch(retrieval, /data-testid="request-source-asset"/);
});

test("form controls carry labels and 44px submit target", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RequestForm, {
      assets: FORM_ASSETS,
      onSubmit: noopSubmit,
      doneHref: "/portal/requests",
      initialKind: "edit",
    }),
  );
  for (const label of ["Short title", "Source asset", "Requested due date", "Notes"]) {
    assert.match(markup, new RegExp(`aria-label="${label}"`));
  }
  assert.match(markup, /data-testid="request-submit"[^>]*class="[^"]*min-h-11/);
});

/* ── RequestThread ─────────────────────────────────────────────────────── */

const THREAD_MESSAGES = [
  {
    id: "m-client",
    request_id: "r1",
    author_name: "Morgan Lee",
    author_role: "client",
    visibility: "client",
    body: "Can we see a first pass?",
    created_at: "2026-07-15T14:22:00.000Z",
  },
  {
    id: "m-internal",
    request_id: "r1",
    author_name: "Bailey Eubanks",
    author_role: "team",
    visibility: "internal",
    body: "Rush fee applies.",
    created_at: "2026-07-15T15:05:00.000Z",
  },
];

test("client audience never renders internal notes", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RequestThread, {
      messages: THREAD_MESSAGES,
      audience: "client",
      onPost: () => ({ ok: true }),
    }),
  );
  assert.match(markup, /Can we see a first pass\?/);
  assert.doesNotMatch(markup, /Rush fee applies/);
  assert.doesNotMatch(markup, /internal-note-badge/);
  // Clients get no channel toggle at all.
  assert.doesNotMatch(markup, /data-testid="visibility-internal"/);
});

test("team audience sees internal notes with a badge and the channel toggle", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RequestThread, {
      messages: THREAD_MESSAGES,
      audience: "team",
      onPost: () => ({ ok: true }),
    }),
  );
  assert.match(markup, /Rush fee applies/);
  assert.match(markup, /data-testid="internal-note-badge"/);
  assert.match(markup, /Internal note/);
  assert.match(markup, /data-testid="visibility-internal"/);
  assert.match(markup, /data-testid="visibility-client"/);
});

test("thread composer is labeled with a 44px post target", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RequestThread, {
      messages: [],
      audience: "client",
      onPost: () => ({ ok: true }),
    }),
  );
  assert.match(markup, /data-testid="request-composer"/);
  assert.match(markup, /data-testid="request-post"[^>]*class="[^"]*min-h-11/);
  assert.match(markup, /data-testid="request-thread-empty"/);
});
