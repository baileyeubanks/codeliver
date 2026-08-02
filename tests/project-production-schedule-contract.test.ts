import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !extname(specifier) &&
      context.parentURL?.startsWith("file:")
    ) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      if (existsSync(`${base}.ts`)) {
        return nextResolve(pathToFileURL(`${base}.ts`).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const contract = await import(
  pathToFileURL(
    resolve(repositoryRoot, "lib/preproduction/production-schedule.ts"),
  ).href
);

const {
  classifyProjectProductionScheduleDatabaseError,
  deriveProjectProductionScheduleContent,
  isProjectProductionScheduleSubmittable,
  parseProjectProductionScheduleAppendRequest,
  parseProjectProductionScheduleContent,
  parseProjectProductionScheduleDecisionReceipt,
  parseProjectProductionScheduleDecisionRequest,
  parseProjectProductionScheduleGenerateRequest,
  parseProjectProductionScheduleRevisionReceipt,
  parseProjectProductionScheduleSnapshot,
  parseProjectProductionScheduleSubmitReceipt,
  parseProjectProductionScheduleSubmitRequest,
  PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS,
  PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
  ProjectProductionScheduleValidationError,
} = contract;

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SHOT_PLAN_REVISION_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";
const BASE_REVISION_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR_ID = "66666666-6666-4666-8666-666666666666";
const APPROVAL_BINDING_ID = "77777777-7777-4777-8777-777777777777";
const HASH = `sha256:${"a".repeat(64)}`;

function shotPlanContent() {
  return {
    schemaVersion: "cco.shot-plan.v1" as const,
    title: "Approved Field Story",
    scenes: [
      {
        id: "scene-001",
        scriptSectionId: "opening",
        order: 1,
        heading: "Opening",
        objective: "Establish the approved work.",
        estimatedDurationSeconds: 300,
        shots: [
          {
            id: "shot-001-001",
            order: 1,
            scriptBlockIds: ["opening-wide"],
            purpose: "Establish the approved scene.",
            coverageKind: "establishing" as const,
            framing: "wide" as const,
            movement: "locked" as const,
            subject: null,
            description: "Approved wide coverage.",
            audioIntent: null,
            estimatedDurationSeconds: 120,
            storyboardPanels: [
              {
                id: "panel-001-001-001",
                order: 1,
                visualDescription: "Approved wide coverage.",
                assetId: null,
                versionId: null,
              },
            ],
          },
          {
            id: "shot-001-002",
            order: 2,
            scriptBlockIds: ["opening-detail"],
            purpose: "Capture the approved detail.",
            coverageKind: "coverage" as const,
            framing: "detail" as const,
            movement: "handheld" as const,
            subject: "Approved materials",
            description: "Approved detail coverage.",
            audioIntent: "Approved room tone.",
            estimatedDurationSeconds: 240,
            storyboardPanels: [
              {
                id: "panel-001-002-001",
                order: 1,
                visualDescription: "Approved detail coverage.",
                assetId: null,
                versionId: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

function expectCode(code: string) {
  return (error: unknown) =>
    error instanceof ProjectProductionScheduleValidationError &&
    error.code === code;
}

function allKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const child of value) allKeys(child, keys);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      allKeys(child, keys);
    }
  }
  return keys;
}

test("derivation is deterministic, exact, and never invents timing", () => {
  const first = deriveProjectProductionScheduleContent(shotPlanContent());
  const second = deriveProjectProductionScheduleContent(shotPlanContent());
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    "schemaVersion",
    "title",
    "timeZone",
    "days",
    "unscheduled",
  ]);
  assert.equal(first.schemaVersion, "cco.production-schedule.v1");
  assert.equal(first.title, "Approved Field Story production schedule");
  assert.equal(first.timeZone, null);
  assert.deepEqual(first.days, []);
  assert.deepEqual(first.unscheduled, [
    {
      id: "shot-001-001",
      order: 1,
      kind: "shot",
      sourceSceneId: "scene-001",
      sourceShotId: "shot-001-001",
      label: null,
      notes: null,
      startTime: null,
      plannedDurationMinutes: null,
    },
    {
      id: "shot-001-002",
      order: 2,
      kind: "shot",
      sourceSceneId: "scene-001",
      sourceShotId: "shot-001-002",
      label: null,
      notes: null,
      startTime: null,
      plannedDurationMinutes: null,
    },
  ]);
  assert.notEqual(
    first.unscheduled[0].plannedDurationMinutes,
    shotPlanContent().scenes[0].shots[0].estimatedDurationSeconds,
  );

  const keys = allKeys(first);
  for (const forbidden of [
    "crew",
    "location",
    "locations",
    "callSheet",
    "callSheets",
    "talent",
    "equipment",
  ]) {
    assert.equal(keys.has(forbidden), false, `unexpected key: ${forbidden}`);
  }
});

function editableContent() {
  const derived = deriveProjectProductionScheduleContent(shotPlanContent());
  return {
    ...derived,
    timeZone: "America/Chicago",
    days: [
      {
        id: "day-001",
        order: 1,
        date: "2026-08-03",
        unitCallTime: "07:30",
        notes: "Primary photography.",
        items: [
          {
            ...derived.unscheduled[0],
            order: 1,
            startTime: "08:00",
            plannedDurationMinutes: 45,
          },
          {
            id: "meal-001",
            order: 2,
            kind: "meal" as const,
            sourceSceneId: null,
            sourceShotId: null,
            label: "Lunch",
            notes: null,
            startTime: "12:00",
            plannedDurationMinutes: 30,
          },
        ],
      },
    ],
    unscheduled: [{ ...derived.unscheduled[1], order: 1 }],
  };
}

test("content parser normalizes exact days and item variants", () => {
  const parsed = parseProjectProductionScheduleContent({
    ...editableContent(),
    title: "  Approved Field Story production schedule  ",
    timeZone: "america/chicago",
    days: [
      {
        ...editableContent().days[0],
        notes: "  Primary photography.\r\nInterior unit.  ",
      },
    ],
  });
  assert.equal(parsed.title, "Approved Field Story production schedule");
  assert.equal(parsed.timeZone, "America/Chicago");
  assert.equal(parsed.days[0].notes, "Primary photography.\nInterior unit.");
  assert.deepEqual(Object.keys(parsed.days[0]), [
    "id",
    "order",
    "date",
    "unitCallTime",
    "notes",
    "items",
  ]);
  assert.deepEqual(Object.keys(parsed.days[0].items[0]), [
    "id",
    "order",
    "kind",
    "sourceSceneId",
    "sourceShotId",
    "label",
    "notes",
    "startTime",
    "plannedDurationMinutes",
  ]);
  assert.deepEqual(PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS, [
    "shot",
    "setup",
    "meal",
    "company_move",
    "break",
    "note",
  ]);
});

test("content parser rejects unknown, unordered, duplicate, invalid, and unbounded data", () => {
  const content = editableContent();
  assert.throws(
    () => parseProjectProductionScheduleContent({ ...content, crew: [] }),
    expectCode("unknown_field"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        days: [{ ...content.days[0], order: 2 }],
      }),
    expectCode("invalid_order"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        unscheduled: [
          {
            ...content.unscheduled[0],
            id: content.days[0].items[0].id,
          },
        ],
      }),
    expectCode("duplicate_id"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        unscheduled: [
          {
            ...content.unscheduled[0],
            id: "another-item",
            sourceShotId: content.days[0].items[0].sourceShotId,
          },
        ],
      }),
    expectCode("duplicate_source_shot"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        timeZone: "Central Standard Time",
      }),
    expectCode("invalid_time_zone"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        days: [{ ...content.days[0], date: "2026-02-30" }],
      }),
    expectCode("invalid_date"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        days: [{ ...content.days[0], unitCallTime: "24:00" }],
      }),
    expectCode("invalid_time"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        days: [
          {
            ...content.days[0],
            items: [
              {
                ...content.days[0].items[0],
                plannedDurationMinutes: 1_441,
              },
            ],
          },
        ],
      }),
    expectCode("invalid_integer"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        days: [
          {
            ...content.days[0],
            items: [{ ...content.days[0].items[0], label: "Invented" }],
          },
        ],
      }),
    expectCode("invalid_shot_item"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        days: [
          {
            ...content.days[0],
            items: [{ ...content.days[0].items[1], label: "   ", order: 1 }],
          },
        ],
      }),
    expectCode("invalid_non_shot_item"),
  );
  assert.throws(
    () =>
      parseProjectProductionScheduleContent({
        ...content,
        days: Array.from({ length: 367 }, (_, index) => ({
          id: `day-${index + 1}`,
          order: index + 1,
          date: null,
          unitCallTime: null,
          notes: null,
          items: [],
        })),
      }),
    expectCode("invalid_days"),
  );
});

test("submittable readiness requires a zoned, fully timed, uniquely dated schedule", () => {
  const content = editableContent();
  const ready = {
    ...content,
    days: [
      {
        ...content.days[0],
        items: [
          ...content.days[0].items,
          {
            ...content.unscheduled[0],
            order: 3,
            startTime: "13:00",
            plannedDurationMinutes: 60,
          },
        ],
      },
    ],
    unscheduled: [],
  };
  assert.equal(isProjectProductionScheduleSubmittable(ready), true);
  assert.equal(
    isProjectProductionScheduleSubmittable({ ...ready, timeZone: null }),
    false,
  );
  assert.equal(
    isProjectProductionScheduleSubmittable({
      ...ready,
      unscheduled: [{ ...ready.days[0].items[0], order: 1 }],
      days: [{ ...ready.days[0], items: ready.days[0].items.slice(1) }],
    }),
    false,
  );
});

test("commands are exact, normalized, bounded, and decision safe", () => {
  assert.deepEqual(
    parseProjectProductionScheduleGenerateRequest({
      requestId: REQUEST_ID.toUpperCase(),
      expectedAuthorityVersion: 8,
      expectedShotPlanRevisionId: SHOT_PLAN_REVISION_ID.toUpperCase(),
    }),
    {
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 8,
      expectedShotPlanRevisionId: SHOT_PLAN_REVISION_ID,
    },
  );
  assert.equal(
    parseProjectProductionScheduleAppendRequest({
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 9,
      baseRevisionId: BASE_REVISION_ID,
      changeSummary: "  Refine day one.\r\nKeep source facts exact.  ",
      content: editableContent(),
    }).changeSummary,
    "Refine day one.\nKeep source facts exact.",
  );
  assert.equal(
    parseProjectProductionScheduleSubmitRequest({
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 10,
      revisionId: REVISION_ID,
      note: null,
    }).revisionId,
    REVISION_ID,
  );
  assert.equal(
    parseProjectProductionScheduleDecisionRequest({
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
      parseProjectProductionScheduleDecisionRequest({
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
      parseProjectProductionScheduleGenerateRequest({
        requestId: REQUEST_ID,
        expectedAuthorityVersion: 8,
        expectedShotPlanRevisionId: SHOT_PLAN_REVISION_ID,
        schemaVersion: PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
      }),
    expectCode("unknown_field"),
  );
});

function sourceBinding() {
  return {
    shotPlanRevisionId: SHOT_PLAN_REVISION_ID,
    shotPlanRevisionNumber: 3,
    shotPlanContentHash: HASH,
    shotPlanApprovalBindingId: APPROVAL_BINDING_ID,
  };
}

function source() {
  return { ...sourceBinding(), shotPlanContent: shotPlanContent() };
}

function rpcRevision() {
  return {
    id: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    revisionKind: "generated" as const,
    derivationVersion: PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
    title: "Approved Field Story production schedule",
    changeSummary: null,
    contentHash: HASH,
    source: sourceBinding(),
    workflow: {
      state: "approved" as const,
      isStale: false,
      isActive: true,
      submittedBy: ACTOR_ID,
      submittedAt: "2026-07-16T19:01:00.000Z",
      submissionNote: null,
      decision: "approved" as const,
      decidedBy: ACTOR_ID,
      decidedAt: "2026-07-16T19:02:00.000Z",
      decisionNote: null,
    },
    createdBy: ACTOR_ID,
    createdAt: "2026-07-16T19:00:00.000Z",
  };
}

function rpcSnapshot() {
  const revision = rpcRevision();
  return {
    projectId: PROJECT_ID,
    authorityVersion: 12,
    eventHeadHash: HASH,
    source: source(),
    head: {
      ...revision,
      content: deriveProjectProductionScheduleContent(shotPlanContent()),
    },
    revisions: [revision],
    permissions: {
      canRead: true,
      canGenerate: false,
      canRevise: true,
      canSubmit: false,
      canDecide: false,
    },
  };
}

test("snapshot and receipt parsers require exact immutable source evidence", () => {
  const parsed = parseProjectProductionScheduleSnapshot(rpcSnapshot());
  assert.ok(parsed);
  assert.deepEqual(parsed.source, source());
  assert.equal(parsed.active?.revisionId, REVISION_ID);
  assert.equal(parsed.head?.content.unscheduled.length, 2);
  assert.equal(
    parseProjectProductionScheduleSnapshot({
      ...rpcSnapshot(),
      source: sourceBinding(),
    }),
    null,
  );
  assert.equal(
    parseProjectProductionScheduleSnapshot({
      ...rpcSnapshot(),
      source: { ...source(), secret: "not public" },
    }),
    null,
  );
  assert.equal(
    parseProjectProductionScheduleSnapshot({
      ...rpcSnapshot(),
      head: {
        ...rpcSnapshot().head,
        content: {
          ...rpcSnapshot().head.content,
          unscheduled: rpcSnapshot().head.content.unscheduled.slice(0, 1),
        },
      },
    }),
    null,
  );
  assert.equal(
    parseProjectProductionScheduleSnapshot({
      ...rpcSnapshot(),
      permissions: { ...rpcSnapshot().permissions, canRead: false },
    }),
    null,
  );
  const draftRevision = {
    ...rpcRevision(),
    workflow: {
      state: "draft",
      isStale: false,
      isActive: false,
      submittedBy: null,
      submittedAt: null,
      submissionNote: null,
      decision: null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    },
  };
  assert.equal(
    parseProjectProductionScheduleSnapshot({
      ...rpcSnapshot(),
      head: {
        ...draftRevision,
        content: deriveProjectProductionScheduleContent(shotPlanContent()),
      },
      revisions: [draftRevision],
      permissions: {
        canRead: true,
        canGenerate: false,
        canRevise: true,
        canSubmit: true,
        canDecide: false,
      },
    }),
    null,
  );

  const revisionReceipt = {
    productionScheduleRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    workflowState: "draft",
    source: sourceBinding(),
    authorityVersion: 9,
    requestId: REQUEST_ID,
    replayed: false,
  };
  assert.deepEqual(
    parseProjectProductionScheduleRevisionReceipt(revisionReceipt),
    revisionReceipt,
  );
  assert.equal(
    parseProjectProductionScheduleRevisionReceipt({
      ...revisionReceipt,
      source: source(),
    }),
    null,
  );
  const transitionReceipt = {
    productionScheduleRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    workflowState: "submitted",
    authorityVersion: 10,
    requestId: REQUEST_ID,
    replayed: false,
  };
  assert.deepEqual(
    parseProjectProductionScheduleSubmitReceipt(transitionReceipt),
    transitionReceipt,
  );
  assert.deepEqual(
    parseProjectProductionScheduleDecisionReceipt({
      ...transitionReceipt,
      workflowState: "changes_requested",
    }),
    { ...transitionReceipt, workflowState: "changes_requested" },
  );
});

test("database errors are classified without leaking database detail", () => {
  assert.equal(
    classifyProjectProductionScheduleDatabaseError({
      code: "40001",
      message: "private detail",
    }).status,
    409,
  );
  assert.equal(
    classifyProjectProductionScheduleDatabaseError({
      code: "42501",
      message: "private detail",
    }).status,
    403,
  );
  assert.equal(
    classifyProjectProductionScheduleDatabaseError({
      code: "P0002",
      message: "private detail",
    }).status,
    404,
  );
  assert.equal(
    classifyProjectProductionScheduleDatabaseError({
      code: "23514",
      message: "private detail",
    }).status,
    422,
  );
  const fallback = classifyProjectProductionScheduleDatabaseError({
    code: "XX000",
    message: "secret table detail",
  });
  assert.equal(fallback.status, 503);
  assert.doesNotMatch(fallback.error, /secret|table detail/i);
});

test("stable public names and hook behavior remain explicit", () => {
  assert.equal(
    PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
    "cco.production-schedule.v1",
  );
  const hook = read("lib/hooks/useProjectProductionSchedule.ts");
  assert.match(hook, /export function useProjectProductionSchedule\(/);
  for (const method of [
    "generateRevision",
    "appendRevision",
    "submitRevision",
    "decideRevision",
  ]) {
    assert.match(hook, new RegExp(`${method}:`));
  }
  for (const endpoint of [
    "/production-schedule`",
    "/production-schedule/generate`",
    "/production-schedule/submit`",
    "/production-schedule/decision`",
  ]) {
    assert.match(hook, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.match(hook, /requestId: crypto\.randomUUID\(\)/);
  assert.match(hook, /requestVersionRef\.current !== requestVersion/);
  assert.match(hook, /abortRef\.current\?\.abort\(\)/);
  assert.match(hook, /if \(!enabled \|\| !projectId\) return/);
  assert.match(hook, /setConflict\(message\);[\s\S]*?await load\(true\)/);
  assert.equal((hook.match(/response\.status === 409/g) ?? []).length, 4);
});
