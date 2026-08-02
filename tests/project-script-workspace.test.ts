import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(
  repositoryRoot,
  "components/projects/ProjectScriptWorkspace.tsx",
);
const cssPath = resolve(
  repositoryRoot,
  "components/projects/ProjectScriptWorkspace.module.css",
);
const hookPath = resolve(repositoryRoot, "lib/hooks/useProjectScript.ts");
const scriptPlanHookPath = resolve(
  repositoryRoot,
  "lib/hooks/useProjectScriptPlan.ts",
);
const demoStorePath = resolve(repositoryRoot, "lib/demo/workspace-store.ts");
const cockpitPath = resolve(
  repositoryRoot,
  "components/projects/ProjectCockpit.tsx",
);
const cockpitCssPath = resolve(
  repositoryRoot,
  "components/projects/ProjectCockpit.module.css",
);
const cockpitNavigationPath = resolve(
  repositoryRoot,
  "components/cockpit/cockpit-navigation.ts",
);
const contractPath = resolve(
  repositoryRoot,
  "lib/preproduction/project-script.ts",
);

const component = readFileSync(componentPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const hook = readFileSync(hookPath, "utf8");
const scriptPlanHook = readFileSync(scriptPlanHookPath, "utf8");
const demoStore = readFileSync(demoStorePath, "utf8");
const cockpit = readFileSync(cockpitPath, "utf8");
const cockpitCss = readFileSync(cockpitCssPath, "utf8");
const cockpitNavigation = readFileSync(cockpitNavigationPath, "utf8");
const contract = await import(pathToFileURL(contractPath).href);

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const HASH = `sha256:${"a".repeat(64)}`;

test("workspace stays embedded and exposes exactly the requested props", () => {
  const props = /export interface ProjectScriptWorkspaceProps \{([\s\S]*?)\n\}/.exec(component)?.[1];
  assert.ok(props);
  assert.deepEqual(
    [...props.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]),
    ["projectId", "projectName", "demoMode", "workspaceRole"],
  );
  assert.match(component, /workspaceRole: WorkspaceRole/);
  assert.match(component, /<section[\s\S]*?Co-Script workspace/);
  assert.doesNotMatch(component, /<main\b|<nav\b|\bShell\b|ProjectCockpit|next\/navigation|next\/link/);
  assert.doesNotMatch(component, /\bCard\b|cardGrid|cardWall/i);
});

test("workspace covers authoring controls, all block kinds, and lifecycle states", () => {
  for (const kind of [
    "scene_heading",
    "visual",
    "action",
    "dialogue",
    "voice_over",
    "interview_question",
    "b_roll",
    "on_screen_text",
    "graphic",
    "music",
    "sfx",
    "transition",
    "note",
  ]) {
    assert.match(component, new RegExp(`${kind}:`), kind);
  }
  for (const label of [
    "Script title",
    "Format",
    "Runtime (minutes)",
    "Logline",
    "Revision history",
    "Change summary",
    "Add section",
    "Remove section",
    "Move section up",
    "Move section down",
    "Add block",
    "Remove block",
    "Move block up",
    "Move block down",
    "Submit for review",
    "Request changes",
    "Record approval",
  ]) {
    assert.match(component, new RegExp(label.replace(/[()]/g, "\\$&")), label);
  }
  for (const stateCopy of [
    "Loading Co-Script",
    "No script revisions yet",
    "Revision conflict",
    "Co-Script is unavailable",
    "Saving",
    "Submitted revision",
    "Read only",
  ]) {
    assert.match(component, new RegExp(stateCopy), stateCopy);
  }
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /onKeyDown=\{\(event\) => handleSectionKeyDown/);
  assert.match(component, /aria-label="Add section"[\s\S]*?title="Add section"/);
  assert.match(component, /Required producer note/);
  assert.match(component, /decisionNote\.trim\(\)/);
  assert.match(component, /A producer note is required for either decision/);
  assert.doesNotMatch(component, /contentHash|eventHeadHash/);
});

test("demo mode is clearly local and cannot enable API traffic", () => {
  assert.match(component, /Local demo draft/);
  assert.match(
    component,
    /This is a local-only demo\. Changes stay in this preview, never call project APIs, and are not authoritative\./,
  );
  assert.match(component, /useProjectScript\(projectId, !demoMode\)/);
  assert.doesNotMatch(component, /\bfetch\s*\(/);
  assert.match(hook, /if \(!enabled \|\| !projectId\) return/);
  assert.match(hook, /if \(!enabled\) \{[\s\S]*?abortRef\.current\?\.abort\(\)/);
});

test("first render uses deterministic draft identities and demo history time", () => {
  const blankScriptSource = component.slice(
    component.indexOf("function blankScript"),
    component.indexOf("function demoScript"),
  );
  assert.match(blankScriptSource, /id: "section-draft-1"/);
  assert.match(blankScriptSource, /blankBlock\("action", "block-draft-1"\)/);
  assert.doesNotMatch(blankScriptSource, /createStableId/);
  assert.match(component, /const DEMO_REVISION_CREATED_AT = "2026-07-16T12:00:00\.000Z"/);
  assert.match(component, /createdAt: DEMO_REVISION_CREATED_AT/);
});

test("Co-Script stays inside the existing Plan surface and URL state", () => {
  const planStart = cockpit.indexOf('{activeSection === "tasks"');
  const scriptWorkspace = cockpit.indexOf("<ProjectScriptWorkspace", planStart);
  const approvedBrief = cockpit.indexOf("<ApprovedProjectBrief", planStart);

  assert.ok(planStart >= 0);
  assert.ok(approvedBrief > planStart);
  assert.ok(scriptWorkspace > approvedBrief);
  assert.match(cockpit, /<h2>Plan<\/h2>/);
  assert.match(cockpit, /aria-label="Plan workspace"/);
  assert.match(cockpit, /aria-pressed=\{activePlanWorkspace === "script"\}/);
  assert.match(cockpit, /aria-pressed=\{activePlanWorkspace === "shots"\}/);
  assert.match(cockpit, /aria-pressed=\{activePlanWorkspace === "tasks"\}/);
  assert.match(cockpit, /aria-pressed=\{activePlanWorkspace === "schedule"\}/);
  assert.match(
    cockpit,
    /function selectPlanWorkspace[\s\S]*?params\.set\("surface", "tasks"\)[\s\S]*?params\.set\("plan", mode\)[\s\S]*?router\.replace/,
  );
  assert.match(cockpit, /if \(section !== "tasks"\) params\.delete\("plan"\)/);
  assert.doesNotMatch(cockpit, /activeSection === "script"/);
  assert.doesNotMatch(cockpitNavigation, /id:\s*"script"|label:\s*"Script"/);
  assert.match(
    cockpitCss,
    /@media \(max-width: 640px\)[\s\S]*?\.planHeaderControls,[\s\S]*?\.planWorkspaceSwitcher \{[\s\S]*?width: 100%/,
  );
});

test("approved scripts gain a two-step governed plan handoff without another shell", () => {
  assert.match(component, /Production plan handoff/);
  assert.match(component, /Generate governed draft/);
  assert.match(component, /Approve and activate plan/);
  assert.match(component, /Required producer approval note/);
  assert.match(component, /Generation stores an immutable draft\. It does not change the active plan\./);
  assert.match(component, /useProjectScriptPlan\(projectId, !demoMode && roleCanDecide\)/);
  assert.match(component, /deriveProjectScriptPlanDraft/);
  assert.match(component, /replaceDemoProjectTasksFromScript\(projectId, handoffPlan\.tasks\)/);
  assert.match(component, /await onPlanMaterialized\?\.\(\)/);
  assert.match(demoStore, /export function replaceDemoProjectTasksFromScript/);
  assert.match(cockpit, /onPlanMaterialized=\{async \(\) => \{/);
  assert.match(cockpit, /await productionPlan\.reload\(\)/);
  assert.match(cockpit, /selectPlanWorkspace\("tasks"\)/);
  assert.doesNotMatch(component, /<main\b|<nav\b|\bShell\b|next\/navigation|next\/link/);
});

test("script plan hook owns exact draft and approval endpoints with stable replay IDs", () => {
  assert.match(scriptPlanHook, /\/script\/plan`/);
  assert.match(scriptPlanHook, /\/script\/plan\/draft`/);
  assert.match(scriptPlanHook, /\/script\/plan\/approve`/);
  assert.match(scriptPlanHook, /stableRequestId\(generateRequestRef/);
  assert.match(scriptPlanHook, /stableRequestId\(approvalRequestRef/);
  assert.match(scriptPlanHook, /if \(response\.status === 409\) await reload\(\)/);
  assert.match(scriptPlanHook, /parseProjectScriptPlanDraftReceipt/);
  assert.match(scriptPlanHook, /parseProjectScriptPlanApprovalReceipt/);
  assert.match(scriptPlanHook, /requestVersionRef\.current !== requestVersion/);
  assert.match(scriptPlanHook, /if \(!enabled\) \{[\s\S]*?abortRef\.current\?\.abort\(\)/);
});

test("hook owns exact endpoints, stale-load aborts, stable retries, and conflict reloads", () => {
  assert.match(hook, /`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/script`/);
  assert.match(hook, /`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/script\/submit`/);
  assert.match(hook, /`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/script\/decision`/);
  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /requestVersionRef\.current !== requestVersion/);
  assert.match(
    hook,
    /reference\.current\?\.fingerprint === nextFingerprint[\s\S]*?return reference\.current\.request/,
  );
  assert.match(hook, /requestId: crypto\.randomUUID\(\)/);
  assert.equal((hook.match(/response\.status === 409/g) ?? []).length, 3);
  assert.match(hook, /setConflict\(message\);[\s\S]*?await load\(true\)/);
  assert.match(hook, /parseProjectScriptSnapshot\(body\)/);
  assert.match(hook, /parseProjectScriptAppendReceipt\(body\)/);
  assert.match(hook, /parseProjectScriptSubmitReceipt\(body\)/);
  assert.match(hook, /parseProjectScriptDecisionReceipt\(body\)/);
  assert.doesNotMatch(hook, /setSnapshot\([^n]/);
  assert.match(hook, /setSnapshot\(nextSnapshot\)/);
});

test("receipt parsers accept the authority fields consumed by the hook", () => {
  const append = contract.parseProjectScriptAppendReceipt({
    projectId: PROJECT_ID,
    scriptRevisionId: REVISION_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    effectiveState: "draft",
    contentHash: HASH,
    sourceProjectBriefRevisionId: null,
    sourceProjectBriefContentHash: null,
    authorityVersion: 1,
    requestId: REQUEST_ID,
    replayed: false,
  });
  assert.equal(append?.projectId, PROJECT_ID);
  assert.equal(append?.revisionId, REVISION_ID);
  assert.equal(append?.requestId, REQUEST_ID);

  const submitted = contract.parseProjectScriptSubmitReceipt({
    projectId: PROJECT_ID,
    scriptRevisionId: REVISION_ID,
    revisionNumber: 1,
    effectiveState: "submitted",
    authorityVersion: 2,
    requestId: REQUEST_ID,
    replayed: false,
  });
  assert.equal(submitted?.revisionId, REVISION_ID);
  assert.equal(submitted?.authorityVersion, 2);

  const decisionReceipt = {
    projectId: PROJECT_ID,
    scriptRevisionId: REVISION_ID,
    revisionNumber: 1,
    effectiveState: "approved",
    authorityVersion: 3,
    requestId: REQUEST_ID,
    replayed: false,
  };
  const decided = contract.parseProjectScriptDecisionReceipt(decisionReceipt);
  assert.equal(decided?.revisionId, REVISION_ID);
  assert.equal(decided?.authorityVersion, 3);
  assert.equal(
    contract.parseProjectScriptDecisionReceipt({ ...decisionReceipt, effectiveState: "submitted" }),
    null,
  );
});

test("responsive CSS is one-column on mobile with compact token-driven geometry", () => {
  assert.match(css, /--script-accent: var\(--cockpit-accent, var\(--blue, #145bb8\)\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.editorGrid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(css, /max-width: 100%;[\s\S]*?overflow-x: hidden/);
  assert.match(css, /\.blockFields \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /font-size:\s*(?:clamp|min|max|calc)\(/);
  for (const match of css.matchAll(/border-radius:\s*(\d+)px/g)) {
    assert.ok(Number(match[1]) <= 8, `radius ${match[1]}px exceeds the 8px cap`);
  }
});

test("workspace uses lucide without inline SVG or emoji decoration", () => {
  assert.match(component, /from "lucide-react"/);
  assert.doesNotMatch(component, /<svg\b|<path\b|dangerouslySetInnerHTML/);
  assert.doesNotMatch(css, /data:image\/svg|url\([^)]*\.svg/);
  assert.doesNotMatch(component + css, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
});
