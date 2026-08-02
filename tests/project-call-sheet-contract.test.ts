import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

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
  pathToFileURL(resolve(repositoryRoot, "lib/preproduction/call-sheet.ts")).href
);

const {
  classifyProjectCallSheetDatabaseError,
  deriveProjectCallSheetContent,
  isProjectCallSheetSubmittable,
  parseProjectCallSheetAppendRequest,
  parseProjectCallSheetContent,
  parseProjectCallSheetDecisionReceipt,
  parseProjectCallSheetDecisionRequest,
  parseProjectCallSheetGenerateRequest,
  parseProjectCallSheetRevisionReceipt,
  parseProjectCallSheetSnapshot,
  parseProjectCallSheetSubmitReceipt,
  parseProjectCallSheetSubmitRequest,
  PROJECT_CALL_SHEET_SCHEMA_VERSION,
  PROJECT_CALL_SHEET_SECTION_KINDS,
  ProjectCallSheetValidationError,
} = contract;

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SCHEDULE_REVISION_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";
const BASE_REVISION_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR_ID = "66666666-6666-4666-8666-666666666666";
const APPROVAL_BINDING_ID = "77777777-7777-4777-8777-777777777777";
const DAY_ID = "day-001";
const HASH = `sha256:${"a".repeat(64)}`;
const DAY_HASH = `sha256:${"b".repeat(64)}`;

function productionScheduleContent() {
  return {
    schemaVersion: "cco.production-schedule.v1" as const,
    title: "Approved Field Story production schedule",
    timeZone: "America/Chicago",
    days: [
      {
        id: DAY_ID,
        order: 1,
        date: "2026-08-03",
        unitCallTime: "07:30",
        notes: "Primary photography.",
        items: [
          {
            id: "shot-001-001",
            order: 1,
            kind: "shot" as const,
            sourceSceneId: "scene-001",
            sourceShotId: "shot-001-001",
            label: null,
            notes: "Approved coverage.",
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
    unscheduled: [],
  };
}

function derivedContent() {
  return deriveProjectCallSheetContent(productionScheduleContent(), DAY_ID);
}

function readyContent() {
  return parseProjectCallSheetContent({
    ...derivedContent(),
    location: {
      name: "CERAWeek production stage",
      address: "1001 Avenida de las Americas\nHouston, TX 77010",
      parkingNotes: "Crew parking in the south garage.",
      accessNotes: null,
      contactName: "Jordan Miles",
      contactPhone: "+1 713 555 0142",
    },
    contacts: [
      {
        id: "contact-001",
        order: 1,
        name: "Charles Rivera",
        role: "Producer",
        department: "Production",
        email: "Charles@ContentCo-op.com",
        phone: null,
        callTime: "06:30",
        notes: "Production lead.",
      },
    ],
    sections: [
      {
        id: "section-001",
        order: 1,
        kind: "safety",
        title: "Stage safety",
        body: "Keep cable paths covered and exits clear.",
      },
    ],
  });
}

function expectCode(code: string) {
  return (error: unknown) =>
    error instanceof ProjectCallSheetValidationError && error.code === code;
}

test("derivation is deterministic, exact, and copies only governed day timing", () => {
  const first = derivedContent();
  assert.deepEqual(first, derivedContent());
  assert.deepEqual(Object.keys(first), [
    "schemaVersion",
    "title",
    "scheduleDayId",
    "shootDate",
    "timeZone",
    "unitCallTime",
    "location",
    "contacts",
    "sections",
    "agenda",
    "generalNotes",
  ]);
  assert.equal(first.schemaVersion, "cco.call-sheet.v1");
  assert.equal(
    first.title,
    "Approved Field Story production schedule - 2026-08-03",
  );
  assert.equal(first.scheduleDayId, DAY_ID);
  assert.equal(first.shootDate, "2026-08-03");
  assert.equal(first.timeZone, "America/Chicago");
  assert.equal(first.unitCallTime, "07:30");
  assert.deepEqual(first.location, {
    name: null,
    address: null,
    parkingNotes: null,
    accessNotes: null,
    contactName: null,
    contactPhone: null,
  });
  assert.deepEqual(first.contacts, []);
  assert.deepEqual(first.sections, []);
  assert.deepEqual(first.agenda, [
    {
      scheduleItemId: "shot-001-001",
      order: 1,
      kind: "shot",
      sourceSceneId: "scene-001",
      sourceShotId: "shot-001-001",
      label: "Shot shot-001-001",
      startTime: "08:00",
      plannedDurationMinutes: 45,
    },
    {
      scheduleItemId: "meal-001",
      order: 2,
      kind: "meal",
      sourceSceneId: null,
      sourceShotId: null,
      label: "Lunch",
      startTime: "12:00",
      plannedDurationMinutes: 30,
    },
  ]);
  assert.equal(first.generalNotes, "Primary photography.");
  assert.throws(
    () => deriveProjectCallSheetContent(productionScheduleContent(), "day-404"),
    expectCode("schedule_day_not_found"),
  );
});

test("content parser normalizes exact location, contact, section, and agenda shapes", () => {
  const parsed = parseProjectCallSheetContent({
    ...readyContent(),
    title: "  Approved call sheet  ",
    location: {
      ...readyContent().location,
      parkingNotes: "  South garage.\r\nValidate at desk.  ",
    },
    contacts: [
      {
        ...readyContent().contacts[0],
        name: "  Charles Rivera  ",
        email: "Charles@ContentCo-op.com",
      },
    ],
  });
  assert.equal(parsed.title, "Approved call sheet");
  assert.equal(parsed.location.parkingNotes, "South garage.\nValidate at desk.");
  assert.equal(parsed.contacts[0].name, "Charles Rivera");
  assert.equal(parsed.contacts[0].email, "Charles@ContentCo-op.com");
  assert.deepEqual(Object.keys(parsed.location), [
    "name",
    "address",
    "parkingNotes",
    "accessNotes",
    "contactName",
    "contactPhone",
  ]);
  assert.deepEqual(Object.keys(parsed.contacts[0]), [
    "id",
    "order",
    "name",
    "role",
    "department",
    "email",
    "phone",
    "callTime",
    "notes",
  ]);
  assert.deepEqual(Object.keys(parsed.sections[0]), [
    "id",
    "order",
    "kind",
    "title",
    "body",
  ]);
  assert.deepEqual(Object.keys(parsed.agenda[0]), [
    "scheduleItemId",
    "order",
    "kind",
    "sourceSceneId",
    "sourceShotId",
    "label",
    "startTime",
    "plannedDurationMinutes",
  ]);
  assert.deepEqual(PROJECT_CALL_SHEET_SECTION_KINDS, [
    "safety",
    "weather",
    "transport",
    "meal",
    "equipment",
    "note",
  ]);
});

test("content rejects unknown, incomplete source timing, malformed rows, and unsafe text", () => {
  const valid = readyContent();
  const cases: Array<[string, unknown]> = [
    ["unknown_field", { ...valid, recipients: [] }],
    ["invalid_date", { ...valid, shootDate: null }],
    ["invalid_time_zone", { ...valid, timeZone: null }],
    ["invalid_time", { ...valid, unitCallTime: null }],
    [
      "invalid_order",
      {
        ...valid,
        contacts: [{ ...valid.contacts[0], order: 2 }],
      },
    ],
    [
      "invalid_email",
      {
        ...valid,
        contacts: [{ ...valid.contacts[0], email: "not-an-email" }],
      },
    ],
    [
      "invalid_string",
      {
        ...valid,
        sections: [{ ...valid.sections[0], title: "Safety\nbrief" }],
      },
    ],
    [
      "invalid_string",
      {
        ...valid,
        agenda: [{ ...valid.agenda[0], label: null }, valid.agenda[1]],
      },
    ],
    [
      "invalid_time",
      {
        ...valid,
        agenda: [{ ...valid.agenda[0], startTime: null }, valid.agenda[1]],
      },
    ],
    [
      "invalid_non_shot_item",
      {
        ...valid,
        agenda: [
          valid.agenda[0],
          { ...valid.agenda[1], sourceSceneId: "scene-001" },
        ],
      },
    ],
  ];
  for (const [code, value] of cases) {
    assert.throws(() => parseProjectCallSheetContent(value), expectCode(code));
  }
});

test("submittable readiness requires location, reachable timed contacts, and safety", () => {
  const ready = readyContent();
  assert.equal(isProjectCallSheetSubmittable(ready), true);
  assert.equal(
    isProjectCallSheetSubmittable({
      ...ready,
      location: { ...ready.location, address: null },
    }),
    false,
  );
  assert.equal(isProjectCallSheetSubmittable({ ...ready, contacts: [] }), false);
  assert.equal(
    isProjectCallSheetSubmittable({
      ...ready,
      contacts: [
        { ...ready.contacts[0], email: null, phone: null },
      ],
    }),
    false,
  );
  assert.equal(
    isProjectCallSheetSubmittable({
      ...ready,
      contacts: [{ ...ready.contacts[0], callTime: null }],
    }),
    false,
  );
  assert.equal(
    isProjectCallSheetSubmittable({
      ...ready,
      sections: [{ ...ready.sections[0], kind: "note" }],
    }),
    false,
  );
});

test("commands are exact, normalized, bounded, and decision safe", () => {
  assert.deepEqual(
    parseProjectCallSheetGenerateRequest({
      requestId: REQUEST_ID.toUpperCase(),
      expectedAuthorityVersion: 8,
      expectedProductionScheduleRevisionId: SCHEDULE_REVISION_ID.toUpperCase(),
      scheduleDayId: DAY_ID,
    }),
    {
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 8,
      expectedProductionScheduleRevisionId: SCHEDULE_REVISION_ID,
      scheduleDayId: DAY_ID,
    },
  );
  assert.equal(
    parseProjectCallSheetAppendRequest({
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 9,
      baseRevisionId: BASE_REVISION_ID,
      changeSummary: "  Add crew and safety.\r\nConfirm access.  ",
      content: readyContent(),
    }).changeSummary,
    "Add crew and safety.\nConfirm access.",
  );
  assert.equal(
    parseProjectCallSheetSubmitRequest({
      requestId: REQUEST_ID,
      expectedAuthorityVersion: 10,
      revisionId: REVISION_ID,
      note: null,
    }).revisionId,
    REVISION_ID,
  );
  assert.equal(
    parseProjectCallSheetDecisionRequest({
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
      parseProjectCallSheetDecisionRequest({
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
      parseProjectCallSheetGenerateRequest({
        requestId: REQUEST_ID,
        expectedAuthorityVersion: 8,
        expectedProductionScheduleRevisionId: SCHEDULE_REVISION_ID,
        scheduleDayId: DAY_ID,
        schemaVersion: PROJECT_CALL_SHEET_SCHEMA_VERSION,
      }),
    expectCode("unknown_field"),
  );
});

function publicSourceBinding() {
  return {
    productionScheduleRevisionId: SCHEDULE_REVISION_ID,
    productionScheduleRevisionNumber: 3,
    productionScheduleContentHash: HASH,
    productionScheduleApprovalBindingId: APPROVAL_BINDING_ID,
    scheduleDayId: DAY_ID,
  };
}

function databaseSourceBinding() {
  return { ...publicSourceBinding(), scheduleDayContentHash: DAY_HASH };
}

function databaseSource() {
  return {
    ...databaseSourceBinding(),
    productionScheduleContent: productionScheduleContent(),
    scheduleDay: productionScheduleContent().days[0],
  };
}

function rpcRevision() {
  return {
    id: REVISION_ID,
    projectId: PROJECT_ID,
    scheduleDayId: DAY_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    revisionKind: "generated" as const,
    derivationVersion: PROJECT_CALL_SHEET_SCHEMA_VERSION,
    title: derivedContent().title,
    changeSummary: null,
    contentHash: HASH,
    source: databaseSourceBinding(),
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
    selectedScheduleDayId: DAY_ID,
    authorityVersion: 12,
    eventHeadHash: HASH,
    source: databaseSource(),
    head: { ...revision, content: derivedContent() },
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

test("snapshot parser accepts bootstrap and strips internal day-hash evidence", () => {
  const parsed = parseProjectCallSheetSnapshot(rpcSnapshot());
  assert.ok(parsed);
  assert.deepEqual(parsed.source, {
    ...publicSourceBinding(),
    productionScheduleContent: productionScheduleContent(),
  });
  assert.equal(parsed.selectedScheduleDayId, DAY_ID);
  assert.equal(parsed.active?.revisionId, REVISION_ID);
  assert.equal("scheduleDay" in (parsed.source ?? {}), false);
  assert.equal("scheduleDayContentHash" in (parsed.source ?? {}), false);
  assert.deepEqual(parseProjectCallSheetSnapshot(parsed), parsed);

  const emptyBootstrap = {
    projectId: PROJECT_ID,
    selectedScheduleDayId: null,
    authorityVersion: 0,
    eventHeadHash: `sha256:${"0".repeat(64)}`,
    source: null,
    head: null,
    revisions: [],
    permissions: {
      canRead: true,
      canGenerate: false,
      canRevise: false,
      canSubmit: false,
      canDecide: false,
    },
  };
  assert.deepEqual(parseProjectCallSheetSnapshot(emptyBootstrap), {
    ...emptyBootstrap,
    active: null,
  });
  assert.deepEqual(
    parseProjectCallSheetSnapshot({ ...emptyBootstrap, active: null }),
    { ...emptyBootstrap, active: null },
  );
});

test("snapshot rejects cross-day, extra, misaligned, and contradictory evidence", () => {
  assert.equal(
    parseProjectCallSheetSnapshot({
      ...rpcSnapshot(),
      selectedScheduleDayId: "day-002",
    }),
    null,
  );
  assert.equal(
    parseProjectCallSheetSnapshot({
      ...rpcSnapshot(),
      source: { ...databaseSource(), secret: "not public" },
    }),
    null,
  );
  assert.equal(
    parseProjectCallSheetSnapshot({
      ...rpcSnapshot(),
      head: {
        ...rpcSnapshot().head,
        content: {
          ...rpcSnapshot().head.content,
          agenda: [
            {
              ...rpcSnapshot().head.content.agenda[0],
              startTime: "09:00",
            },
            rpcSnapshot().head.content.agenda[1],
          ],
        },
      },
    }),
    null,
  );
  assert.equal(
    parseProjectCallSheetSnapshot({
      ...rpcSnapshot(),
      permissions: { ...rpcSnapshot().permissions, canRead: false },
    }),
    null,
  );
  assert.equal(
    parseProjectCallSheetSnapshot({
      ...rpcSnapshot(),
      permissions: { ...rpcSnapshot().permissions, canGenerate: true },
    }),
    null,
  );
});

test("receipt parsers accept exact RPC evidence and sanitize source bindings", () => {
  const databaseReceipt = {
    callSheetRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    scheduleDayId: DAY_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    workflowState: "draft",
    source: databaseSourceBinding(),
    authorityVersion: 9,
    requestId: REQUEST_ID,
    replayed: false,
  };
  assert.deepEqual(parseProjectCallSheetRevisionReceipt(databaseReceipt), {
    ...databaseReceipt,
    source: publicSourceBinding(),
  });
  assert.equal(
    parseProjectCallSheetRevisionReceipt({
      ...databaseReceipt,
      scheduleDayId: "day-002",
    }),
    null,
  );
  const transitionReceipt = {
    callSheetRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    scheduleDayId: DAY_ID,
    revisionNumber: 1,
    workflowState: "submitted",
    authorityVersion: 10,
    requestId: REQUEST_ID,
    replayed: false,
  };
  assert.deepEqual(
    parseProjectCallSheetSubmitReceipt(transitionReceipt),
    transitionReceipt,
  );
  assert.deepEqual(
    parseProjectCallSheetDecisionReceipt({
      ...transitionReceipt,
      workflowState: "changes_requested",
    }),
    { ...transitionReceipt, workflowState: "changes_requested" },
  );
});

test("database errors are classified without leaking database detail", () => {
  assert.equal(
    classifyProjectCallSheetDatabaseError({
      code: "40001",
      message: "private detail",
    }).status,
    409,
  );
  assert.equal(
    classifyProjectCallSheetDatabaseError({
      code: "42501",
      message: "private detail",
    }).status,
    403,
  );
  assert.equal(
    classifyProjectCallSheetDatabaseError({
      code: "P0002",
      message: "private detail",
    }).status,
    404,
  );
  assert.equal(
    classifyProjectCallSheetDatabaseError({
      code: "23514",
      message: "private detail",
    }).status,
    422,
  );
  const fallback = classifyProjectCallSheetDatabaseError({
    code: "XX000",
    message: "secret table detail",
  });
  assert.equal(fallback.status, 503);
  assert.doesNotMatch(fallback.error, /secret|table detail/i);
});

test("stable public names and bootstrap-aware hook behavior remain explicit", () => {
  assert.equal(PROJECT_CALL_SHEET_SCHEMA_VERSION, "cco.call-sheet.v1");
  const hook = read("lib/hooks/useProjectCallSheet.ts");
  assert.match(hook, /export function useProjectCallSheet\(/);
  for (const method of [
    "selectDay",
    "generateRevision",
    "appendRevision",
    "saveRevision",
    "submitRevision",
    "decideRevision",
  ]) {
    assert.match(hook, new RegExp(`${method}:`));
  }
  assert.match(hook, /selectedScheduleDayId === null/);
  assert.match(hook, /adoptedBootstrapDayRef\.current/);
  assert.match(hook, /call-sheet\?dayId=/);
  assert.match(hook, /requestId: crypto\.randomUUID\(\)/);
  assert.match(hook, /requestVersionRef\.current !== requestVersion/);
  assert.match(hook, /abortRef\.current\?\.abort\(\)/);
  assert.match(hook, /setConflict\(message\);[\s\S]*?await load\(true\)/);
  assert.equal((hook.match(/response\.status === 409/g) ?? []).length, 4);
});
