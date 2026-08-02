import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error TS5097: Node's source-TypeScript test runner requires explicit extensions.
import {
  deriveProjectScriptPlanDraft,
  parseProjectScriptPlanApprovalCommand,
  parseProjectScriptPlanApprovalReceipt,
  parseProjectScriptPlanDraftCommand,
  parseProjectScriptPlanDraftReceipt,
  parseProjectScriptPlanProposal,
  PROJECT_SCRIPT_PLAN_DERIVATION_VERSION,
} from "../lib/preproduction/script-plan.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const planRoute = read("app/api/projects/[id]/script/plan/route.ts");
const draftRoute = read("app/api/projects/[id]/script/plan/draft/route.ts");
const approvalRoute = read("app/api/projects/[id]/script/plan/approve/route.ts");
const proxy = read("proxy.ts");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const HASH = `sha256:${"a".repeat(64)}`;

function scriptContent() {
  return {
    schemaVersion: "cco.script-content.v1" as const,
    title: "ICA field story",
    logline: "A concise field story built from approved interview and coverage cues.",
    format: "interview" as const,
    estimatedRuntimeSeconds: 90,
    sections: [
      {
        id: "opening",
        heading: "Opening context",
        summary: "Establish the setting and the central question.",
        estimatedDurationSeconds: 30,
        blocks: [
          {
            id: "opening-visual",
            kind: "visual" as const,
            text: "Wide exterior, then hands preparing the workspace.",
            speaker: null,
            parenthetical: null,
          },
        ],
      },
      {
        id: "proof",
        heading: "Customer proof",
        summary: null,
        estimatedDurationSeconds: 45,
        blocks: [
          {
            id: "proof-question",
            kind: "interview_question" as const,
            text: "What changed once the team could see the whole plan?",
            speaker: "Producer",
            parenthetical: null,
          },
          {
            id: "proof-broll",
            kind: "b_roll" as const,
            text: "Team reviews the active plan and moves into production.",
            speaker: null,
            parenthetical: null,
          },
        ],
      },
    ],
  };
}

test("approved script derivation creates one bounded task per section without inventing logistics", () => {
  const plan = deriveProjectScriptPlanDraft(scriptContent());
  assert.equal(plan.title, "ICA field story production plan");
  assert.equal(plan.summary, scriptContent().logline);
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].clientTaskId, "script-section-001");
  assert.equal(plan.tasks[0].title, "Plan coverage: Opening context");
  assert.match(plan.tasks[0].description ?? "", /Purpose: Establish the setting/);
  assert.match(plan.tasks[0].description ?? "", /Target runtime: 30 seconds/);
  assert.match(plan.tasks[0].description ?? "", /Visual: Wide exterior/);
  assert.equal(plan.tasks[1].title, "Plan interview: Customer proof");
  assert.match(plan.tasks[1].description ?? "", /Interview question \(Producer\): What changed/);
  for (const task of plan.tasks) {
    assert.equal(task.assigneeId, null);
    assert.equal(task.dueDate, null);
    assert.equal(task.priority, "normal");
    assert.equal(task.sourceKind, "plan");
    assert.deepEqual(task.dependsOnClientTaskIds, []);
  }
});

test("proposal parser distinguishes preview, persisted draft, and materialized plan", () => {
  const preview = deriveProjectScriptPlanDraft(scriptContent());
  const proposal = parseProjectScriptPlanProposal({
    projectId: PROJECT_ID,
    authorityVersion: 9,
    currentPlanRevision: 1,
    available: true,
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
    scriptTitle: "ICA field story",
    preview,
    draft: {
      id: DRAFT_ID,
      derivationVersion: PROJECT_SCRIPT_PLAN_DERIVATION_VERSION,
      content: preview,
      contentHash: HASH,
      generatedAt: "2026-07-16T16:00:00.000Z",
    },
    alreadyMaterialized: false,
    materializedPlanRevision: null,
    permissions: { canGenerate: true, canApprove: true },
  });
  assert.equal(proposal?.draft?.id, DRAFT_ID);
  assert.equal(proposal?.preview?.tasks.length, 2);

  assert.equal(parseProjectScriptPlanProposal({
    projectId: PROJECT_ID,
    authorityVersion: 0,
    currentPlanRevision: 0,
    available: false,
    scriptRevisionId: null,
    scriptRevisionNumber: null,
    scriptTitle: null,
    preview: null,
    draft: null,
    alreadyMaterialized: false,
    materializedPlanRevision: null,
    permissions: { canGenerate: true, canApprove: true },
  })?.available, false);

  assert.equal(parseProjectScriptPlanProposal({
    ...(proposal as object),
    alreadyMaterialized: true,
    materializedPlanRevision: null,
  }), null);
});

test("draft and approval commands are exact, normalized, and require producer evidence", () => {
  assert.deepEqual(parseProjectScriptPlanDraftCommand({
    expectedAuthorityVersion: 9,
    expectedScriptRevisionId: SCRIPT_ID.toUpperCase(),
    requestId: REQUEST_ID,
  }), {
    expectedAuthorityVersion: 9,
    expectedScriptRevisionId: SCRIPT_ID,
    requestId: REQUEST_ID,
  });
  assert.equal(parseProjectScriptPlanDraftCommand({
    expectedAuthorityVersion: 9,
    expectedScriptRevisionId: SCRIPT_ID,
    requestId: REQUEST_ID,
    plan: "client-authored",
  }), null);
  assert.deepEqual(parseProjectScriptPlanApprovalCommand({
    draftId: DRAFT_ID,
    expectedPlanRevision: 1,
    requestId: REQUEST_ID,
    note: "  Approved against the locked script.\r\nProceed to production.  ",
  }), {
    draftId: DRAFT_ID,
    expectedPlanRevision: 1,
    requestId: REQUEST_ID,
    note: "Approved against the locked script.\nProceed to production.",
  });
  assert.equal(parseProjectScriptPlanApprovalCommand({
    draftId: DRAFT_ID,
    expectedPlanRevision: 1,
    requestId: REQUEST_ID,
    note: "   ",
  }), null);
});

test("receipt parsers bind exact draft, script, project, and plan identities", () => {
  assert.equal(parseProjectScriptPlanDraftReceipt({
    draftId: DRAFT_ID,
    projectId: PROJECT_ID,
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
    authorityVersion: 10,
    requestId: REQUEST_ID,
    replayed: false,
  })?.authorityVersion, 10);

  const receipt = parseProjectScriptPlanApprovalReceipt({
    planRevisionId: PLAN_ID,
    projectId: PROJECT_ID,
    revisionNumber: 2,
    authorityVersion: 11,
    taskCount: 2,
    requestId: REQUEST_ID,
    replayed: false,
    draftId: DRAFT_ID,
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
  });
  assert.equal(receipt?.draftId, DRAFT_ID);
  assert.equal(receipt?.planRevisionId, PLAN_ID);
});

test("script plan APIs are staff-only, producer-gated, bounded, and RPC-only", () => {
  for (const source of [planRoute, draftRoute, approvalRoute]) {
    assert.match(source, /requireStaffWithClient\(\)/);
    assert.match(source, /getProjectAccess\(projectId, user\.id, "producer", supabase\)/);
    assert.match(source, /getSupabaseDataSchema\(\) !== "co_production"/);
    assert.match(source, /Cache-Control": "private, no-store"/);
    assert.doesNotMatch(source, /\.from\(/);
  }
  assert.match(planRoute, /\.rpc\("get_project_script_plan_proposal"/);
  assert.match(draftRoute, /\.rpc\("generate_project_script_plan_draft"/);
  assert.match(approvalRoute, /\.rpc\("approve_project_script_plan_draft"/);
  assert.match(draftRoute, /PROJECT_SCRIPT_PLAN_COMMAND_MAX_BYTES/);
  assert.match(approvalRoute, /PROJECT_SCRIPT_PLAN_COMMAND_MAX_BYTES/);
});

test("production launch gate allows only the exact script-plan methods", () => {
  assert.match(proxy, /script\/plan\$`[\s\S]*?methods: \["GET"\]/);
  assert.match(proxy, /script\/plan\/\(\?:draft\|approve\)\$`[\s\S]*?methods: \["POST"\]/);
  assert.match(proxy, /production-plan\$`[\s\S]*?methods: \["GET", "POST"\]/);
  assert.match(proxy, /production-tasks\/\$\{UUID_PATH_SEGMENT\}\$`[\s\S]*?methods: \["PATCH"\]/);
});
