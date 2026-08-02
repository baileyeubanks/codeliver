import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error TS5097: Node's source-TypeScript test runner requires explicit local extensions.
import {
  classifyProjectShotPlanDatabaseError,
  deriveProjectShotPlanContent,
  parseProjectShotPlanAppendRequest,
  parseProjectShotPlanContent,
  parseProjectShotPlanDecisionReceipt,
  parseProjectShotPlanDecisionRequest,
  parseProjectShotPlanGenerateRequest,
  parseProjectShotPlanRevisionReceipt,
  parseProjectShotPlanSnapshot,
  parseProjectShotPlanSubmitReceipt,
  parseProjectShotPlanSubmitRequest,
  PROJECT_SHOT_PLAN_SCHEMA_VERSION,
  ProjectShotPlanValidationError,
  SHOT_PLAN_SCHEMA_VERSION,
} from "../lib/preproduction/shot-plan.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const BASE_REVISION_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const ACTOR_ID = "77777777-7777-4777-8777-777777777777";
const BINDING_ID = "88888888-8888-4888-8888-888888888888";
const HASH = `sha256:${"a".repeat(64)}`;

function scriptContent() {
  return {
    schemaVersion: "cco.script-content.v1" as const,
    title: "Approved Field Story",
    logline: "The approved story.",
    format: "interview" as const,
    estimatedRuntimeSeconds: 90,
    sections: [
      {
        id: "opening",
        heading: "Opening",
        summary: "Establish why the work matters.",
        estimatedDurationSeconds: 30,
        blocks: [
          {
            id: "opening-heading",
            kind: "scene_heading" as const,
            text: "Workshop interior",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "opening-visual",
            kind: "visual" as const,
            text: "Hands prepare the approved materials.",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "opening-action",
            kind: "action" as const,
            text: "The team reviews the plan.",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "opening-question",
            kind: "interview_question" as const,
            text: "What changed after the plan was approved?",
            speaker: "Producer",
            parenthetical: null,
          },
          {
            id: "opening-b-roll",
            kind: "b_roll" as const,
            text: "Approved work moves through the room.",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "opening-text",
            kind: "on_screen_text" as const,
            text: "One approved plan",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "opening-graphic",
            kind: "graphic" as const,
            text: "Approved process graphic",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "opening-transition",
            kind: "transition" as const,
            text: "Transition to customer proof.",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "opening-dialogue",
            kind: "dialogue" as const,
            text: "This non-eligible block does not create a shot.",
            speaker: "Customer",
            parenthetical: null,
          },
        ],
      },
      {
        id: "closing",
        heading: "Closing",
        summary: "Close on the approved outcome.",
        estimatedDurationSeconds: 15,
        blocks: [
          {
            id: "closing-dialogue",
            kind: "dialogue" as const,
            text: "The outcome is clear.",
            speaker: "Customer",
            parenthetical: null,
          },
          {
            id: "closing-music",
            kind: "music" as const,
            text: "Music resolves.",
            speaker: null,
            parenthetical: null,
          },
        ],
      },
    ],
  };
}

function expectCode(code: string) {
  return (error: unknown) =>
    error instanceof ProjectShotPlanValidationError && error.code === code;
}

test("derivation is deterministic, source-faithful, and conservative", () => {
  const first = deriveProjectShotPlanContent(scriptContent());
  const second = deriveProjectShotPlanContent(scriptContent());
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, "cco.shot-plan.v1");
  assert.equal(first.title, "Approved Field Story");
  assert.equal(first.scenes.length, 2);
  assert.deepEqual(
    first.scenes.map((scene) => [scene.id, scene.scriptSectionId, scene.order]),
    [
      ["scene-001", "opening", 1],
      ["scene-002", "closing", 2],
    ],
  );
  assert.equal(first.scenes[0].objective, "Establish why the work matters.");
  assert.equal(first.scenes[0].estimatedDurationSeconds, 30);
  assert.equal(first.scenes[0].shots.length, 8);
  assert.deepEqual(
    first.scenes[0].shots.map((shot) => shot.coverageKind),
    [
      "establishing",
      "coverage",
      "action",
      "interview",
      "b_roll",
      "graphic",
      "graphic",
      "transition",
    ],
  );
  assert.deepEqual(
    first.scenes[0].shots.map((shot) => shot.purpose),
    [
      "Establish the scripted scene.",
      "Capture the scripted visual.",
      "Capture the scripted action.",
      "Capture the scripted interview question.",
      "Capture the scripted B-roll.",
      "Present the scripted on-screen text.",
      "Present the scripted graphic.",
      "Capture the scripted transition.",
    ],
  );
  const interview = first.scenes[0].shots[3];
  assert.equal(interview.id, "shot-001-004");
  assert.deepEqual(interview.scriptBlockIds, ["opening-question"]);
  assert.equal(
    interview.audioIntent,
    "What changed after the plan was approved?",
  );
  assert.equal(
    interview.description,
    "What changed after the plan was approved?",
  );
  assert.equal(
    interview.storyboardPanels[0].visualDescription,
    "What changed after the plan was approved?",
  );
  assert.equal(interview.storyboardPanels[0].id, "panel-001-004-001");

  for (const shot of first.scenes.flatMap((scene) => scene.shots)) {
    assert.equal(shot.framing, "unspecified");
    assert.equal(shot.movement, "unspecified");
    assert.equal(shot.subject, null);
    assert.equal(shot.estimatedDurationSeconds, null);
    for (const panel of shot.storyboardPanels) {
      assert.equal(panel.assetId, null);
      assert.equal(panel.versionId, null);
    }
    if (shot.id !== interview.id) assert.equal(shot.audioIntent, null);
  }

  const fallback = first.scenes[1].shots[0];
  assert.equal(fallback.id, "shot-002-001");
  assert.deepEqual(fallback.scriptBlockIds, []);
  assert.equal(
    fallback.purpose,
    "Define visual coverage for this script section.",
  );
  assert.match(fallback.description, /Visual coverage is not specified/);
  assert.match(fallback.description, /Close on the approved outcome/);
  assert.equal(fallback.description, fallback.storyboardPanels[0].visualDescription);

  const serialized = JSON.stringify(first).toLowerCase();
  for (const excluded of ["date", "location", "talent", "equipment", "lens"]) {
    assert.doesNotMatch(serialized, new RegExp(`\\"${excluded}\\"`));
  }
});

test("content parser normalizes text and enforces exact ordered v1 content", () => {
  const derived = deriveProjectShotPlanContent(scriptContent());
  const normalized = parseProjectShotPlanContent({
    ...derived,
    title: "  Approved Field Story shot plan  ",
    scenes: [
      {
        ...derived.scenes[0],
        heading: "  Opening\r\nsection  ",
        shots: [
          {
            ...derived.scenes[0].shots[0],
            purpose: "  Establish the approved script scene  ",
          },
        ],
      },
    ],
  });
  assert.equal(normalized.title, "Approved Field Story shot plan");
  assert.equal(normalized.scenes[0].heading, "Opening\nsection");

  assert.throws(
    () => parseProjectShotPlanContent({ ...derived, extra: true }),
    expectCode("unknown_field"),
  );
  assert.throws(
    () =>
      parseProjectShotPlanContent({
        ...derived,
        scenes: [{ ...derived.scenes[0], order: 2 }],
      }),
    expectCode("invalid_order"),
  );
  assert.throws(
    () =>
      parseProjectShotPlanContent({
        ...derived,
        scenes: [
          {
            ...derived.scenes[0],
            shots: [
              {
                ...derived.scenes[0].shots[0],
                coverageKind: "schedule",
              },
            ],
          },
        ],
      }),
    expectCode("invalid_enum"),
  );
  assert.throws(
    () =>
      parseProjectShotPlanContent({
        ...derived,
        scenes: [
          {
            ...derived.scenes[0],
            shots: [
              {
                ...derived.scenes[0].shots[0],
                storyboardPanels: [
                  {
                    ...derived.scenes[0].shots[0].storyboardPanels[0],
                    assetId: PROJECT_ID,
                  },
                ],
              },
            ],
          },
        ],
      }),
    expectCode("attachment_not_supported"),
  );
});

test("commands are exact, normalized, source-bound, and decision-safe", () => {
  assert.deepEqual(
    parseProjectShotPlanGenerateRequest({
      requestId: REQUEST_ID.toUpperCase(),
      expectedAuthorityVersion: 8,
      expectedScriptRevisionId: SCRIPT_ID.toUpperCase(),
      expectedProductionPlanRevisionId: PLAN_ID.toUpperCase(),
    }),
    {
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 8,
      expectedScriptRevisionId: SCRIPT_ID,
      expectedProductionPlanRevisionId: PLAN_ID,
    },
  );
  const content = deriveProjectShotPlanContent(scriptContent());
  assert.equal(
    parseProjectShotPlanAppendRequest({
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 9,
      baseRevisionId: BASE_REVISION_ID,
      changeSummary: "  Refine coverage.\r\nKeep source facts exact.  ",
      content,
    }).changeSummary,
    "Refine coverage.\nKeep source facts exact.",
  );
  assert.equal(
    parseProjectShotPlanSubmitRequest({
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 10,
      revisionId: REVISION_ID,
      note: null,
    }).revisionId,
    REVISION_ID,
  );
  assert.equal(
    parseProjectShotPlanDecisionRequest({
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 11,
      revisionId: REVISION_ID,
      decision: "approved",
      note: null,
    }).decision,
    "approved",
  );
  assert.throws(
    () =>
      parseProjectShotPlanDecisionRequest({
        requestId: REQUEST_ID,
        expectedAuthorityVersion: 11,
        revisionId: REVISION_ID,
        decision: "changes_requested",
        note: "   ",
      }),
    expectCode("note_required"),
  );
  assert.throws(
    () =>
      parseProjectShotPlanGenerateRequest({
        requestId: REQUEST_ID,
        expectedAuthorityVersion: 8,
        expectedScriptRevisionId: SCRIPT_ID,
        expectedProductionPlanRevisionId: PLAN_ID,
        generatedContent: content,
      }),
    expectCode("unknown_field"),
  );
});

function source() {
  return {
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
    scriptContentHash: HASH,
    productionPlanRevisionId: PLAN_ID,
    productionPlanRevisionNumber: 2,
    productionPlanContentHash: HASH,
    productionPlanScriptBindingId: BINDING_ID,
  };
}

function rpcRevision() {
  return {
    id: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    revisionKind: "generated" as const,
    derivationVersion: PROJECT_SHOT_PLAN_SCHEMA_VERSION,
    title: "Approved Field Story",
    changeSummary: null,
    contentHash: HASH,
    source: source(),
    workflow: {
      state: "approved" as const,
      isStale: false,
      isActive: true,
      submittedBy: ACTOR_ID,
      submittedAt: "2026-07-16T17:01:00.000Z",
      submissionNote: null,
      decision: "approved" as const,
      decidedBy: ACTOR_ID,
      decidedAt: "2026-07-16T17:02:00.000Z",
      decisionNote: null,
    },
    createdBy: ACTOR_ID,
    createdAt: "2026-07-16T17:00:00.000Z",
  };
}

function metadata() {
  return {
    revisionId: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    revisionKind: "generated" as const,
    derivationVersion: PROJECT_SHOT_PLAN_SCHEMA_VERSION,
    title: "Approved Field Story",
    state: "approved" as const,
    stale: false,
    active: true,
    changeSummary: null,
    contentHash: HASH,
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
    scriptContentHash: HASH,
    productionPlanRevisionId: PLAN_ID,
    productionPlanRevisionNumber: 2,
    productionPlanContentHash: HASH,
    productionPlanScriptBindingId: BINDING_ID,
    createdBy: ACTOR_ID,
    createdAt: "2026-07-16T17:00:00.000Z",
    submittedBy: ACTOR_ID,
    submittedAt: "2026-07-16T17:01:00.000Z",
    submissionNote: null,
    decision: "approved" as const,
    decidedBy: ACTOR_ID,
    decidedAt: "2026-07-16T17:02:00.000Z",
    decisionNote: null,
  };
}

function rpcSnapshot() {
  const revision = rpcRevision();
  const content = deriveProjectShotPlanContent(scriptContent());
  return {
    projectId: PROJECT_ID,
    authorityVersion: 12,
    eventHeadHash: HASH,
    source: source(),
    head: { ...revision, content },
    revisions: [revision],
    permissions: {
      canGenerate: false,
      canRevise: true,
      canSubmit: false,
      canDecide: false,
    },
  };
}

function publicSnapshot() {
  const revision = metadata();
  return {
    projectId: PROJECT_ID,
    authorityVersion: 12,
    eventHeadHash: HASH,
    source: source(),
    head: { ...revision, content: deriveProjectShotPlanContent(scriptContent()) },
    active: revision,
    revisions: [revision],
    permissions: {
      canGenerate: false,
      canRevise: true,
      canSubmit: false,
      canDecide: false,
    },
  };
}

test("snapshot and receipt parsers fail closed on mismatched authority output", () => {
  assert.deepEqual(parseProjectShotPlanSnapshot(rpcSnapshot()), publicSnapshot());
  assert.equal(
    parseProjectShotPlanSnapshot({ ...rpcSnapshot(), internal: HASH }),
    null,
  );
  assert.equal(
    parseProjectShotPlanSnapshot({
      ...rpcSnapshot(),
      head: {
        ...rpcSnapshot().head,
        workflow: { ...rpcRevision().workflow, isStale: true },
      },
    }),
    null,
  );
  assert.equal(
    parseProjectShotPlanSnapshot({
      ...rpcSnapshot(),
      revisions: [{ ...rpcRevision(), id: BASE_REVISION_ID }],
    }),
    null,
  );

  const revisionReceipt = {
    shotPlanRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    workflowState: "draft",
    source: source(),
    authorityVersion: 9,
    requestId: REQUEST_ID,
    replayed: false,
  };
  assert.deepEqual(
    parseProjectShotPlanRevisionReceipt(revisionReceipt),
    revisionReceipt,
  );
  assert.equal(
    parseProjectShotPlanRevisionReceipt({ ...revisionReceipt, receiptHash: HASH }),
    null,
  );
  const transitionReceipt = {
    shotPlanRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    workflowState: "submitted",
    authorityVersion: 10,
    requestId: REQUEST_ID,
    replayed: false,
  };
  assert.deepEqual(
    parseProjectShotPlanSubmitReceipt(transitionReceipt),
    transitionReceipt,
  );
  assert.deepEqual(
    parseProjectShotPlanDecisionReceipt({
      ...transitionReceipt,
      workflowState: "approved",
    }),
    { ...transitionReceipt, workflowState: "approved" },
  );
});

test("database errors are classified without leaking database detail", () => {
  assert.equal(
    classifyProjectShotPlanDatabaseError({ code: "40001", message: "detail" }).status,
    409,
  );
  assert.equal(
    classifyProjectShotPlanDatabaseError({ code: "42501", message: "detail" }).status,
    403,
  );
  assert.equal(
    classifyProjectShotPlanDatabaseError({ code: "P0002", message: "detail" }).status,
    404,
  );
  assert.equal(
    classifyProjectShotPlanDatabaseError({ code: "23514", message: "detail" }).status,
    422,
  );
  assert.deepEqual(classifyProjectShotPlanDatabaseError(null), {
    status: 503,
    error: "Project shot planning is temporarily unavailable",
  });
});

test("public integration names and route boundaries remain explicit", () => {
  assert.equal(PROJECT_SHOT_PLAN_SCHEMA_VERSION, "cco.shot-plan.v1");
  assert.equal(SHOT_PLAN_SCHEMA_VERSION, PROJECT_SHOT_PLAN_SCHEMA_VERSION);
  const hook = read("lib/hooks/useProjectShotPlan.ts");
  assert.match(hook, /export function useProjectShotPlan\(/);
  assert.match(hook, /generateRevision:/);
  assert.match(hook, /appendRevision:/);
  assert.match(hook, /submitRevision:/);
  assert.match(hook, /decideRevision:/);

  const routes = [
    ["app/api/projects/[id]/shot-plan/route.ts", "get_project_shot_plan", "editor"],
    [
      "app/api/projects/[id]/shot-plan/generate/route.ts",
      "generate_project_shot_plan_revision",
      "producer",
    ],
    [
      "app/api/projects/[id]/shot-plan/submit/route.ts",
      "submit_project_shot_plan_revision",
      "editor",
    ],
    [
      "app/api/projects/[id]/shot-plan/decision/route.ts",
      "decide_project_shot_plan_revision",
      "producer",
    ],
  ] as const;
  for (const [path, rpc, minimumRole] of routes) {
    const route = read(path);
    assert.match(route, /requireStaffWithClient\(\)/);
    assert.match(
      route,
      new RegExp(`getProjectAccess\\(projectId, user\\.id, "${minimumRole}", supabase\\)`),
    );
    assert.match(route, /getSupabaseDataSchema\(\) !== "co_production"/);
    assert.match(route, /Cache-Control": "private, no-store"/);
    assert.match(route, new RegExp(`\\.rpc\\(\\"${rpc}\\"`));
    assert.doesNotMatch(route, /\.from\(/);
  }
});
