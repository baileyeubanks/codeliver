/**
 * P24 DOM tests for the project workspace tabs — transpile + mock-require
 * pattern (see tests/player-timeline-accessibility.test.ts). Real pure logic
 * (lib/projects/*) is loaded through the transpile chain; the demo store,
 * next/navigation, next/link, lucide-react, and the heavy cockpit are mocked.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

/* -------------------------------------------------------------------------- */
/* Module loader                                                              */
/* -------------------------------------------------------------------------- */

const moduleCache = new Map<string, unknown>();
const fileMocks = new Map<string, unknown>();

/** Mutable harness state the mocks read at render time. */
let fixtureWorkspace: Record<string, unknown> = {};
let currentSearch = "";
const savedBriefs: unknown[] = [];

const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
const LinkMock = (props: Record<string, unknown>) =>
  React.createElement("a", props as Record<string, never>);

const packageMocks: Record<string, unknown> = {
  "lucide-react": new Proxy(
    {},
    {
      get: () => Icon,
    },
  ),
  "next/link": { __esModule: true, default: LinkMock },
  "next/navigation": {
    useParams: () => ({ id: "ica" }),
    usePathname: () => "/projects/ica",
    useRouter: () => ({ replace: () => undefined, push: () => undefined }),
    useSearchParams: () => new URLSearchParams(currentSearch),
  },
};

const cssProxy: Record<string | symbol, unknown> = new Proxy(
  {},
  {
    get: (_, key) => {
      if (key === "__esModule") return true;
      if (key === "default") return cssProxy;
      if (typeof key === "symbol") return undefined;
      return String(key);
    },
  },
);

function normalizePath(candidate: string): string {
  if (/\.(ts|tsx|css|js|mjs)$/.test(candidate)) return candidate;
  for (const extension of [".ts", ".tsx"]) {
    if (existsSync(candidate + extension)) return candidate + extension;
  }
  return candidate;
}

function resolveSpecifier(specifier: string, fromFile: string): string {
  if (specifier.startsWith("@/")) return normalizePath(resolve(repositoryRoot, specifier.slice(2)));
  if (specifier.startsWith(".")) return normalizePath(resolve(dirname(fromFile), specifier));
  return specifier;
}

function transpile(modulePath: string): string {
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

function loadModule(modulePath: string): Record<string, unknown> {
  if (fileMocks.has(modulePath)) return fileMocks.get(modulePath) as Record<string, unknown>;
  if (moduleCache.has(modulePath)) return moduleCache.get(modulePath) as Record<string, unknown>;
  const loadedModule = { exports: {} as Record<string, unknown> };
  moduleCache.set(modulePath, loadedModule.exports);
  const localRequire = (specifier: string): unknown => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier in packageMocks) return packageMocks[specifier];
    const resolved = resolveSpecifier(specifier, modulePath);
    if (resolved.endsWith(".css")) return cssProxy;
    if (!resolved.startsWith(repositoryRoot)) return require(resolved);
    return loadModule(resolved);
  };
  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${transpile(modulePath)}\n })`,
  ) as (loader: typeof localRequire, moduleRecord: typeof loadedModule, exports: unknown) => void;
  evaluate(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

/* -------------------------------------------------------------------------- */
/* Shared fixture (ICA-flavored, mirrors lib/demo seeds)                      */
/* -------------------------------------------------------------------------- */

function baseWorkspace(): Record<string, unknown> {
  return {
    projects: [{ id: "ica", name: "ICA", stage: "review", organization_id: "org-ica", primary_contact_id: "contact-morgan-ica" }],
    organizations: [{ id: "org-ica", name: "Industrial Contractors Association" }],
    contacts: [
      { id: "contact-morgan-ica", organization_id: "org-ica", name: "Morgan Lee", email: "morgan@ica.example", role: "Director of Communications", is_primary: true },
      { id: "contact-jordan-ica", organization_id: "org-ica", name: "Jordan Miles", email: "jordan@ica.example", role: "Events Manager", is_primary: false },
    ],
    briefs: [
      {
        id: "brief-ica", project_id: "ica", version: 2, status: "approved",
        objectives: "Open the roadshow with a 60-second film and a social cutdown.",
        audience: "Roadshow attendees.",
        message: "Precision work, honored publicly.",
        references: ["2025 roadshow open", "ICA brand guidelines 2026"],
        deliverables_notes: "16:9 master, 9:16 social cut, captioned.",
        created_at: "2026-07-10T15:00:00.000Z", updated_at: "2026-07-14T20:10:00.000Z", created_by: "user-bailey",
      },
      {
        id: "brief-ica", project_id: "ica", version: 1, status: "superseded",
        objectives: "Open the roadshow with a 60-second film.",
        audience: "Roadshow attendees.",
        message: "Precision work, honored publicly.",
        references: ["2025 roadshow open"],
        deliverables_notes: "16:9 master, captioned.",
        created_at: "2026-07-10T15:00:00.000Z", updated_at: "2026-07-13T16:30:00.000Z", created_by: "user-bailey",
      },
    ],
    proposals: [],
    planItems: [
      { id: "plan-ica-task-captions", project_id: "ica", kind: "task", title: "Caption pass on roadshow master", date: "2026-07-16", assignee: "Edit", status: "done", depends_on: [], meta: {} },
    ],
    productionDays: [],
    revisionRequests: [
      { id: "rr-1", project_id: "ica", asset_id: "charles-drummond-v5", round: 2, status: "in_progress", summary: "Round 2", comment_ids: [], created_at: "2026-07-14T20:10:00.000Z", updated_at: "2026-07-15T18:45:00.000Z" },
    ],
    approvalStages: [
      { id: "a1", project_id: "ica", asset_id: "denie-mcdonald-v4", status: "in_progress" },
      { id: "a2", project_id: "ica", asset_id: "denie-mcdonald-v4", status: "pending" },
      { id: "a3", project_id: "ica", asset_id: "ica-roadshow-final", status: "approved" },
    ],
    deliverables: [
      {
        id: "del-ica-master", project_id: "ica", name: "ICA_ROADSHOW_MASTER_16x9.mov",
        spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9", captions: true, audio: "stereo 48kHz", watermark: false },
        source_version_id: "ver-ica-final-v5", status: "delivered", qc_checks: [], qc_notes: "",
        delivered_at: "2026-03-09T19:30:00.000Z", created_at: "2026-07-10T15:00:00.000Z", updated_at: "2026-03-09T19:30:00.000Z", created_by: "user-bailey",
      },
      {
        id: "del-ica-social", project_id: "ica", name: "ICA_ROADSHOW_SOCIAL_9x16.mp4",
        spec: { resolution: "1080x1920", codec: "H.264 12Mbps", aspect: "9:16", captions: true, audio: "stereo 48kHz", watermark: false },
        source_version_id: "ver-ica-final-v5", status: "qc", qc_checks: [], qc_notes: "",
        delivered_at: null, created_at: "2026-07-11T16:30:00.000Z", updated_at: "2026-07-13T16:30:00.000Z", created_by: "user-bailey",
      },
    ],
    assets: [
      { id: "ica-roadshow-final", project_id: "ica", title: "ICA_ROADSHOW_x_FINAL", file_type: "video", duration_seconds: 60, status: "approved" },
      { id: "denie-mcdonald-v4", project_id: "ica", title: "Denie McDonald_v4", file_type: "video", duration_seconds: 71, status: "in_review" },
      { id: "ica-ceo-hero-v1", project_id: "ica", title: "ICA CEO Hero_v1", file_type: "video", duration_seconds: 45, status: "approved", file_url: "/demo/ica-ceo-preview.mp4" },
    ],
    releases: [],
    decisions: [
      {
        id: "dec-ica-logo", project_id: "ica",
        subject: "Ship roadshow master with updated logo animation",
        body: "Client approved v5 with the new logo animation in the close.",
        decided_by: "morgan@ica.example", source: "review", comment_ids: [],
        supersedes_id: null, implementation_status: "done",
        created_at: "2026-03-08T16:20:00.000Z", updated_at: "2026-03-08T16:20:00.000Z", created_by: "user-bailey",
      },
    ],
    reviewComments: [
      { id: "comment-denie-1", project_id: "ica", asset_id: "denie-mcdonald-v4", author_name: "Client Reviewer", body: "Please shorten this section.", time_seconds: 1, status: "open", created_at: "2026-07-14T21:56:00.000Z" },
      { id: "comment-denie-resolved", project_id: "ica", asset_id: "denie-mcdonald-v4", author_name: "Morgan Lee", body: "Audio level is approved.", time_seconds: 2, status: "resolved", created_at: "2026-07-14T20:44:00.000Z" },
    ],
    crewMembers: [],
    settings: { profile: { firstName: "Bailey", lastName: "Eubanks" } },
    session: { email: "bailey@contentco-op.com" },
  };
}

/* Mocks registered once; they read the mutable harness state above. */
fileMocks.set(resolve(repositoryRoot, "lib/demo/workspace-store.ts"), {
  useDemoWorkspace: () => fixtureWorkspace,
  saveBrief: (input: unknown) => {
    savedBriefs.push(input);
    return { ok: true, id: "brief-ica" };
  },
});

const stubPanel = (marker: string) => ({
  __esModule: true,
  default: () => React.createElement("div", { "data-testid": marker }),
});
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"), stubPanel("cockpit-stub"));
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectBriefPanel.tsx"), stubPanel("brief-stub"));
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectMilestonesPanel.tsx"), stubPanel("milestones-stub"));
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectDeliverablesPanel.tsx"), stubPanel("deliverables-stub"));
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectTeamPanel.tsx"), stubPanel("team-stub"));
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectFilesPanel.tsx"), stubPanel("files-stub"));
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectCommsPanel.tsx"), stubPanel("comms-stub"));
fileMocks.set(resolve(repositoryRoot, "components/projects/ProjectCalendarPanel.tsx"), stubPanel("calendar-stub"));

/* Evaluate the tabs module while the panel stubs are in place (its imports
 * capture them), then drop the stubs so the panels can be rendered for real
 * in their own tests. */
const tabsModulePath = resolve(repositoryRoot, "components/projects/ProjectWorkspaceTabs.tsx");
loadModule(tabsModulePath);
for (const stubbed of [...fileMocks.keys()]) {
  if (stubbed.includes("components/projects/")) fileMocks.delete(stubbed);
}

function render(modulePath: string, props: Record<string, unknown>): string {
  const component = loadModule(modulePath).default as ComponentType<Record<string, unknown>>;
  return renderToStaticMarkup(React.createElement(component, props));
}

function tabsProps(): Record<string, unknown> {
  return {
    project: { id: "ica", name: "ICA", stage: "review", organization_id: "org-ica" },
    assets: [],
    projects: [{ id: "ica", name: "ICA" }],
    uploading: false,
    uploadStatus: null,
    onUpload: () => undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Tab bar                                                                    */
/* -------------------------------------------------------------------------- */

const tabsPath = resolve(repositoryRoot, "components/projects/ProjectWorkspaceTabs.tsx");
const tabsSource = readFileSync(tabsPath, "utf8");

test("tab bar exposes tablist semantics with all eight tabs plus the whiteboard link", () => {
  fixtureWorkspace = baseWorkspace();
  currentSearch = "";
  const markup = render(tabsPath, tabsProps());

  assert.match(markup, /role="tablist"[^>]*aria-label="ICA project workspace"/);
  assert.equal(markup.match(/role="tab"/g)?.length, 8, "eight tabs");
  assert.match(markup, /id="project-tab-overview"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(markup, /id="project-tab-brief"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  assert.match(markup, /aria-controls="project-tabpanel-calendar"/);
  assert.match(markup, /role="tabpanel"[^>]*id="project-tabpanel-overview"[^>]*aria-labelledby="project-tab-overview"/);
  assert.ok(markup.includes('href="/projects/ica/whiteboard?demo=1"'), "whiteboard links to the existing route");
  assert.ok(markup.includes("cockpit-stub"), "overview renders the existing cockpit");
});

test("tab selection follows the ?tab= search param", () => {
  fixtureWorkspace = baseWorkspace();
  currentSearch = "demo=1&tab=brief";
  const markup = render(tabsPath, tabsProps());
  assert.match(markup, /id="project-tab-brief"[^>]*aria-selected="true"/);
  assert.match(markup, /id="project-tabpanel-brief"/);
  assert.ok(markup.includes("brief-stub"));
  assert.ok(!markup.includes("cockpit-stub"), "cockpit unmounts outside the overview tab");
});

test("arrow-key tab switching is wired on the tablist", () => {
  assert.match(tabsSource, /onKeyDown=\{onTabListKeyDown\}/);
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.ok(tabsSource.includes(`"${key}"`), `handles ${key}`);
  }
  assert.match(tabsSource, /tabRefs\.current\[nextIndex\]\?\.focus\(\)/, "focus follows the active tab");
});

/* -------------------------------------------------------------------------- */
/* Brief panel                                                                */
/* -------------------------------------------------------------------------- */

test("brief panel renders version history, current badge, guardrails, and the v1→v2 diff", () => {
  fixtureWorkspace = baseWorkspace();
  const markup = render(resolve(repositoryRoot, "components/projects/ProjectBriefPanel.tsx"), { projectId: "ica", projectName: "ICA" });

  assert.match(markup, />v1</);
  assert.match(markup, />v2</);
  assert.equal(markup.match(/Current/g)?.length, 1, "exactly one current badge");
  assert.ok(markup.includes("social cutdown"), "current version content renders");
  assert.ok(markup.includes("ICA brand guidelines 2026"), "references render");
  assert.ok(markup.includes("Brand guardrails"), "guardrails section renders");
  assert.ok(markup.includes("full PPE"), "guardrail content renders");

  assert.ok(markup.includes("Changes from v1 → v2"), "diff section present");
  assert.match(markup, /class="diffAdded"[^>]*>[^<]*social cutdown\./, "added phrase highlighted");
  assert.ok(markup.includes("+ ICA brand guidelines 2026"), "added reference chip");
});

test("brief panel edit creates a new version through saveBrief (append, never overwrite)", () => {
  fixtureWorkspace = baseWorkspace();
  const source = readFileSync(resolve(repositoryRoot, "components/projects/ProjectBriefPanel.tsx"), "utf8");
  assert.match(source, /saveBrief\(\{/);
  assert.match(source, /Save as v\{\(current\?\.version \?\? 0\) \+ 1\}/);
  assert.match(source, /earlier versions stay on file/i);
});

/* -------------------------------------------------------------------------- */
/* Deliverables panel                                                         */
/* -------------------------------------------------------------------------- */

test("deliverables panel rolls up statuses and links rows to the real review surface", () => {
  fixtureWorkspace = baseWorkspace();
  const markup = render(resolve(repositoryRoot, "components/projects/ProjectDeliverablesPanel.tsx"), { projectId: "ica" });

  assert.ok(markup.includes("ICA_ROADSHOW_MASTER_16x9.mov"), "export row renders");
  assert.ok(markup.includes("Denie McDonald_v4"), "media row renders");
  assert.ok(markup.includes("1 delivered"), "rollup counts delivered");
  assert.ok(markup.includes("1 in qc"), "rollup counts QC");
  assert.ok(
    markup.includes('href="/projects/ica?demo=1&amp;asset=ica-roadshow-final&amp;view=review"'),
    "review link points at the real review surface",
  );
  assert.ok(markup.includes("1:11"), "duration formats as m:ss");
  assert.ok(markup.includes("Not scheduled"), "no invented due dates");
  assert.ok(!/markup_pct|margin|unit_rate/i.test(markup), "no internal margin vocabulary");
});

/* -------------------------------------------------------------------------- */
/* Milestones / Team / Files / Comms / Calendar panels                        */
/* -------------------------------------------------------------------------- */

test("milestones panel derives truthful states from the record", () => {
  fixtureWorkspace = baseWorkspace();
  const markup = render(resolve(repositoryRoot, "components/projects/ProjectMilestonesPanel.tsx"), { projectId: "ica" });
  for (const label of ["Kickoff", "Pre-production", "Shoot dates", "Edit rounds", "Approval", "Delivery"]) {
    assert.ok(markup.includes(label), `${label} milestone present`);
  }
  assert.ok(markup.includes("Round 2 in progress."), "open revision round drives the edit milestone");
  assert.ok(markup.includes("1 of 3 approvals complete."), "approval counts from seeds");
});

test("team panel lists client stakeholders and the Content Co-op owner", () => {
  fixtureWorkspace = baseWorkspace();
  const markup = render(resolve(repositoryRoot, "components/projects/ProjectTeamPanel.tsx"), { projectId: "ica" });
  assert.ok(markup.includes("Morgan Lee") && markup.includes("Jordan Miles"));
  assert.ok(markup.includes('href="mailto:morgan@ica.example"'));
  assert.ok(markup.includes("Bailey Eubanks"), "workspace owner listed");
  assert.ok(markup.includes(">ML<"), "avatar initials render");
  assert.ok(markup.includes("Industrial Contractors Association"));
});

test("files panel groups honestly: real downloads only, request states otherwise", () => {
  fixtureWorkspace = baseWorkspace();
  const markup = render(resolve(repositoryRoot, "components/projects/ProjectFilesPanel.tsx"), { projectId: "ica" });
  for (const group of ["Briefs", "Scripts", "Brand assets", "Uploads", "Release forms", "Exports"]) {
    assert.ok(markup.includes(group), `${group} group present`);
  }
  assert.ok(markup.includes('href="/demo/ica-ceo-preview.mp4"'), "real file downloads");
  assert.ok(markup.includes("Available on request"), "request-only rows are honest");
  assert.ok(markup.includes("No scripts on file yet."), "empty groups say so");
});

test("comms panel renders the decision log and per-asset conversations", () => {
  fixtureWorkspace = baseWorkspace();
  const markup = render(resolve(repositoryRoot, "components/projects/ProjectCommsPanel.tsx"), { projectId: "ica" });
  assert.ok(markup.includes("Decision log"));
  assert.ok(markup.includes("Ship roadshow master with updated logo animation"));
  assert.ok(markup.includes("Decided by morgan@ica.example"));
  assert.ok(markup.includes("Denie McDonald_v4"), "thread grouped by asset");
  assert.ok(markup.includes("Please shorten this section."));
  assert.ok(markup.includes("Resolved"), "comment status chips render");
});

test("calendar panel places real seed dates and marks today", () => {
  const workspace = baseWorkspace();
  const now = new Date();
  const inMonthDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-15`;
  (workspace.planItems as { date: string | null }[])[0].date = inMonthDate;
  fixtureWorkspace = workspace;

  const markup = render(resolve(repositoryRoot, "components/projects/ProjectCalendarPanel.tsx"), { projectId: "ica" });
  assert.ok(markup.includes('aria-current="date"'), "today marker present");
  assert.ok(markup.includes("Caption pass on roadshow master"), "seed task lands on its date");
  assert.match(markup, /aria-label="Previous month"/);
  assert.match(markup, /aria-label="Next month"/);
  const cellCount = markup.match(/role="gridcell"/g)?.length ?? 0;
  assert.ok(cellCount === 35 || cellCount === 42, `full month grid renders (${cellCount} cells)`);
});
