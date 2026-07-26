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

const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);

/** Load the real pure-logic chain (no stubs) so tests exercise production logic. */
function loadPure(relativePath: string, deps: Record<string, unknown> = {}) {
  return evaluateModule(transpileTsModule(resolve(repositoryRoot, relativePath)), (specifier) => {
    if (specifier in deps) return deps[specifier];
    throw new Error(`Unexpected import in ${relativePath}: ${specifier}`);
  });
}

const statusModule = loadPure("lib/portal/status.ts");
const actionsModule = loadPure("lib/portal/actions.ts");
const activityModule = loadPure("lib/portal/activity.ts");
const viewsModule = loadPure("lib/portal/views.ts", { "./status.ts": statusModule });

const cssModuleMock = new Proxy(
  {},
  { get: (_target, key) => String(key) },
) as Record<string, string>;

function sharedMocks(): Record<string, unknown> {
  return {
    "lucide-react": new Proxy({}, { get: () => Icon }),
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...rest }: Record<string, unknown>) =>
        React.createElement("a", { href, ...rest }, children as React.ReactNode),
    },
    "next/image": {
      __esModule: true,
      default: ({ src, alt }: Record<string, unknown>) =>
        React.createElement("img", { src, alt }),
    },
    "@/lib/portal/status.ts": statusModule,
    "@/lib/portal/actions.ts": actionsModule,
    "@/lib/portal/activity.ts": activityModule,
    "@/lib/portal/views.ts": viewsModule,
    "@/components/brand/CoProductionBrand": {
      __esModule: true,
      default: ({ label }: Record<string, unknown>) =>
        React.createElement("span", { "data-brand": true }, label as string),
    },
    "@/lib/demo/workspace-store": {
      signOutDemoSession: () => undefined,
    },
  };
}

function loadComponent(relativePath: string) {
  const mocks = sharedMocks();
  return evaluateModule(transpileTsModule(resolve(repositoryRoot, relativePath)), (specifier) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier.endsWith(".css")) return cssModuleMock;
    if (specifier in mocks) return mocks[specifier];
    throw new Error(`Unexpected ${relativePath} import: ${specifier}`);
  }) as { default: ComponentType<Record<string, unknown>> };
}

const ActionItemsPanel = loadComponent("components/portal/ActionItemsPanel.tsx");
const ActivityFeed = loadComponent("components/portal/ActivityFeed.tsx");
const DeliveryList = loadComponent("components/portal/DeliveryList.tsx");
const PortalShell = loadComponent("components/portal/PortalShell.tsx");
const ProjectList = loadComponent("components/portal/ProjectList.tsx");
const ReviewLinks = loadComponent("components/portal/ReviewLinks.tsx");

const { deriveActionItems } = actionsModule as {
  deriveActionItems: (input: Record<string, unknown>) => Array<Record<string, unknown>>;
};
const { clientSafeActivity } = activityModule as {
  clientSafeActivity: (items: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
};

/* Real demo-shaped fixtures (mirrors lib/demo seeds). */
const fixtureAssets = [
  { id: "denie-mcdonald-v4", project_id: "ica", title: "Denie McDonald_v4" },
];
const fixtureShareLinks = [
  {
    id: "share-ceraweek-cuts",
    asset_ids: ["denie-mcdonald-v4"],
    is_active: true,
    public_url: "/review/demo?demo=1&asset=denie-mcdonald-v4&intent=client_review&share=demo-ceraweek-cuts",
  },
];
const fixtureStages = [
  {
    id: "approval-denie-final",
    project_id: "ica",
    asset_id: "denie-mcdonald-v4",
    name: "Final Approval",
    reviewer_names: ["Lena Ortiz"],
    approved_reviewer_names: [],
    status: "pending",
  },
];

/* ── PortalShell ───────────────────────────────────────────────────────── */

test("portal shell renders brand, client company name, and a real user menu", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      PortalShell.default,
      {
        clientName: "Industrial Contractors Association",
        userName: "Morgan Lee",
      },
      React.createElement("p", null, "body"),
    ),
  );
  assert.match(markup, /Industrial Contractors Association/);
  assert.match(markup, /aria-label="Account menu for Morgan Lee"/);
  assert.match(markup, />ML</); // avatar initials
  assert.match(markup, /<button[^>]*type="button"[^>]*>[\s\S]*?Sign out/);
  assert.match(markup, /<main[^>]*>/);
});

/* ── What we need from you ─────────────────────────────────────────────── */

test("action panel renders a derived approval linking to the real review surface", () => {
  const items = deriveActionItems({
    assets: fixtureAssets,
    shareLinks: fixtureShareLinks,
    approvalStages: fixtureStages,
  });
  const markup = renderToStaticMarkup(
    React.createElement(ActionItemsPanel.default, { items }),
  );
  assert.match(markup, /What we need from you/);
  assert.match(markup, /Approve “Denie McDonald_v4”/);
  assert.match(markup, /Final Approval · 0 of 1 reviewers in/);
  assert.match(
    markup,
    /href="\/review\/demo\?demo=1[^"]*"[^>]*>Review &amp; approve/,
  );
});

test("action panel empty state is an honest 'all set', never a fake task", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ActionItemsPanel.default, { items: [] }),
  );
  assert.match(markup, /You’re all set\./);
  assert.doesNotMatch(markup, /<ul/);
});

/* ── Projects: plain-language status only ──────────────────────────────── */

test("project cards speak plain language — internal stage names never render", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ProjectList.default, {
      projects: [
        { id: "ica", name: "ICA", status: "Awaiting Feedback", milestoneTitle: null, nextDateLabel: null, thumbnailUrl: "/demo/refinery-sunset.jpg" },
        { id: "bp", name: "bp", status: "Production", milestoneTitle: "Rough cut to Rachel", nextDateLabel: "Jul 24", thumbnailUrl: null },
        { id: "conexon", name: "Conexon", status: "Planning", milestoneTitle: null, nextDateLabel: null, thumbnailUrl: null },
      ],
    }),
  );
  assert.match(markup, /Awaiting Feedback/);
  assert.match(markup, /Production/);
  assert.match(markup, /Planning/);
  assert.match(markup, /Next: Rough cut to Rachel · Jul 24/);
  assert.match(markup, /Schedule in progress/);
  for (const internal of ["Pre-production", "preproduction", "Post</span>", "In Review", "archived"]) {
    assert.ok(!markup.includes(internal), `internal stage name leaked: ${internal}`);
  }
});

/* ── Latest reviews ────────────────────────────────────────────────────── */

test("review rows carry version labels, status chips, and real review links", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ReviewLinks.default, {
      reviews: [
        { id: "r1", assetId: "ica-roadshow-final", title: "ICA_ROADSHOW_x_FINAL", projectId: "ica", versionLabel: "v5", status: "Approved", href: "/review/demo?demo=1&share=demo-ica-final", createdAt: "2026-07-14T21:58:00.000Z" },
        { id: "r2", assetId: "denie-mcdonald-v4", title: "Denie McDonald_v4", projectId: "ica", versionLabel: "v4", status: "Needs Review", href: "/review/demo?demo=1&share=demo-ceraweek-cuts", createdAt: "2026-07-14T20:35:00.000Z" },
      ],
      projectNames: { ica: "ICA" },
    }),
  );
  assert.match(markup, /ICA_ROADSHOW_x_FINAL · v5/);
  assert.match(markup, /Approved/);
  assert.match(markup, /Needs Review/);
  assert.match(markup, /href="\/review\/demo\?demo=1&amp;share=demo-ceraweek-cuts"/);
});

/* ── Recently delivered ────────────────────────────────────────────────── */

test("deliveries link real files only; file-less masters say 'on request'", () => {
  const markup = renderToStaticMarkup(
    React.createElement(DeliveryList.default, {
      deliveries: [
        { id: "a1", name: "ICA CEO Hero Cut_v1", projectId: "ica", formatChips: ["VIDEO", "MP4"], deliveredAt: "2026-07-10T15:00:00.000Z", downloadHref: "/demo/ica-ceo-preview.mp4" },
        { id: "d1", name: "ICA_ROADSHOW_MASTER_16x9.mov", projectId: "ica", formatChips: ["ProRes 422 HQ", "16:9"], deliveredAt: "2026-03-09T19:30:00.000Z", downloadHref: null },
      ],
      projectNames: { ica: "ICA" },
    }),
  );
  assert.match(markup, /href="\/demo\/ica-ceo-preview\.mp4"[^>]*download/);
  assert.match(markup, /Available on request/);
  assert.match(markup, /ProRes 422 HQ/);
  assert.match(markup, /Delivered Jul 10/);
});

/* ── Activity feed ─────────────────────────────────────────────────────── */

test("activity feed renders client-safe phrasing and nothing internal", () => {
  const events = clientSafeActivity([
    { id: "a1", action: "uploaded_new_version", actor_name: "You", details: { asset_title: "Denie McDonald_v4" }, created_at: "2026-07-14T21:53:00.000Z", project_id: "ica", asset_id: "denie-mcdonald-v4" },
    { id: "a2", action: "added_comment", actor_name: "Alex Rivera", details: { asset_title: "Cut", body: "Hold the lower third" }, created_at: "2026-07-14T21:57:00.000Z", project_id: "ica", asset_id: "charles-drummond-v5" },
    { id: "a3", action: "milestone_paid", actor_name: "You", details: { label: "50%" }, created_at: "2026-07-14T21:00:00.000Z", project_id: "ica", asset_id: null },
  ]);
  assert.equal(events.length, 1);
  const markup = renderToStaticMarkup(
    React.createElement(ActivityFeed.default, { events }),
  );
  assert.match(markup, /New cut ready: Denie McDonald_v4/);
  assert.doesNotMatch(markup, /Hold the lower third/);
  assert.doesNotMatch(markup, /50%/);
});

test("activity feed empty state is honest", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ActivityFeed.default, { events: [] }),
  );
  assert.match(markup, /Progress will appear here as your projects move forward\./);
});
