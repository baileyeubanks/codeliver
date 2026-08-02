import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SCHEDULE_REVISION_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const APPROVAL_BINDING_ID = "66666666-6666-4666-8666-666666666666";
const DAY_ID = "day-001";
const HASH = `sha256:${"a".repeat(64)}`;
const DAY_HASH = `sha256:${"b".repeat(64)}`;

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireStaffWithClient() {
    const state = globalThis.__projectCallSheetApiState;
    state.authCalls += 1;
    if (state.authError) throw state.authError;
    return { user: state.user, staff: state.staff, supabase: state.client };
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    const state = globalThis.__projectCallSheetApiState;
    state.accessCalls.push({ projectId, userId, minimumRole, client });
    if (state.accessError) throw state.accessError;
    return state.accessResult;
  }
`)}`;

const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    const state = globalThis.__projectCallSheetApiState;
    if (state.schemaError) throw state.schemaError;
    return state.schema;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth/staff-client") {
      return nextResolve(authStubUrl, context);
    }
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessStubUrl, context);
    }
    if (specifier === "@/lib/data-authority") {
      return nextResolve(dataAuthorityStubUrl, context);
    }
    if (
      specifier === "@/lib/supabase" ||
      specifier === "@/lib/auth-client" ||
      specifier === "@/lib/auth"
    ) {
      throw new Error(`Call-sheet routes must not import ${specifier}`);
    }
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
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

type RpcError = { code?: string; message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type AccessResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };
type RpcCall = { name: string; args: Record<string, unknown> };

interface ProjectCallSheetApiState {
  user: { id: string } | null;
  staff: boolean;
  schema: string;
  authCalls: number;
  authError: Error | null;
  schemaError: Error | null;
  accessCalls: Array<{
    projectId: string;
    userId: string;
    minimumRole: string;
    client: unknown;
  }>;
  accessResult: AccessResult;
  accessError: Error | null;
  rpcCalls: RpcCall[];
  rpcResults: Record<string, RpcResult>;
  rpcError: Error | null;
  client: FakeClient;
}

class FakeClient {
  async rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
    const state = runtimeState.__projectCallSheetApiState;
    assert.ok(state);
    state.rpcCalls.push({ name, args });
    if (state.rpcError) throw state.rpcError;
    return state.rpcResults[name] ?? { data: null, error: null };
  }
}

const runtimeState = globalThis as typeof globalThis & {
  __projectCallSheetApiState?: ProjectCallSheetApiState;
};

const contract = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/preproduction/call-sheet.ts")).href
);
const callSheetRoute = await import(
  pathToFileURL(
    resolve(repositoryRoot, "app/api/projects/[id]/call-sheet/route.ts"),
  ).href
);
const generateRoute = await import(
  pathToFileURL(
    resolve(
      repositoryRoot,
      "app/api/projects/[id]/call-sheet/generate/route.ts",
    ),
  ).href
);
const submitRoute = await import(
  pathToFileURL(
    resolve(repositoryRoot, "app/api/projects/[id]/call-sheet/submit/route.ts"),
  ).href
);
const decisionRoute = await import(
  pathToFileURL(
    resolve(
      repositoryRoot,
      "app/api/projects/[id]/call-sheet/decision/route.ts",
    ),
  ).href
);

function productionScheduleContent() {
  return {
    schemaVersion: "cco.production-schedule.v1",
    title: "Approved Story production schedule",
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
            kind: "shot",
            sourceSceneId: "scene-001",
            sourceShotId: "shot-001-001",
            label: null,
            notes: null,
            startTime: "08:00",
            plannedDurationMinutes: 45,
          },
        ],
      },
    ],
    unscheduled: [],
  };
}

function content() {
  return contract.deriveProjectCallSheetContent(
    productionScheduleContent(),
    DAY_ID,
  );
}

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

function databaseSnapshot(projectId = PROJECT_ID) {
  return {
    projectId,
    selectedScheduleDayId: DAY_ID,
    authorityVersion: 8,
    eventHeadHash: HASH,
    source: databaseSource(),
    head: null,
    revisions: [],
    permissions: {
      canRead: true,
      canGenerate: true,
      canRevise: false,
      canSubmit: false,
      canDecide: false,
    },
  };
}

function publicSnapshot(projectId = PROJECT_ID) {
  return {
    projectId,
    selectedScheduleDayId: DAY_ID,
    authorityVersion: 8,
    eventHeadHash: HASH,
    source: {
      ...publicSourceBinding(),
      productionScheduleContent: productionScheduleContent(),
    },
    head: null,
    active: null,
    revisions: [],
    permissions: {
      canRead: true,
      canGenerate: true,
      canRevise: false,
      canSubmit: false,
      canDecide: false,
    },
  };
}

function revisionReceipt(overrides: Record<string, unknown> = {}) {
  return {
    callSheetRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    scheduleDayId: DAY_ID,
    scheduleDayId: DAY_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    workflowState: "draft",
    source: databaseSourceBinding(),
    authorityVersion: 9,
    requestId: REQUEST_ID,
    replayed: false,
    ...overrides,
  };
}

function publicRevisionReceipt(overrides: Record<string, unknown> = {}) {
  return {
    ...revisionReceipt(),
    source: publicSourceBinding(),
    ...overrides,
  };
}

function transitionReceipt(overrides: Record<string, unknown> = {}) {
  return {
    callSheetRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    scheduleDayId: DAY_ID,
    revisionNumber: 1,
    workflowState: "submitted",
    authorityVersion: 10,
    requestId: REQUEST_ID,
    replayed: false,
    ...overrides,
  };
}

function resetState(): ProjectCallSheetApiState {
  const client = new FakeClient();
  const state: ProjectCallSheetApiState = {
    user: { id: ACTOR_ID },
    staff: true,
    schema: "co_production",
    authCalls: 0,
    authError: null,
    schemaError: null,
    accessCalls: [],
    accessResult: { ok: true, data: { id: PROJECT_ID } },
    accessError: null,
    rpcCalls: [],
    rpcResults: {
      get_project_call_sheet: { data: databaseSnapshot(), error: null },
      generate_project_call_sheet_revision: {
        data: revisionReceipt(),
        error: null,
      },
      append_project_call_sheet_revision: {
        data: revisionReceipt({
          revisionNumber: 2,
          baseRevisionId: REVISION_ID,
        }),
        error: null,
      },
      submit_project_call_sheet_revision: {
        data: transitionReceipt(),
        error: null,
      },
      decide_project_call_sheet_revision: {
        data: transitionReceipt({
          workflowState: "approved",
          authorityVersion: 11,
        }),
        error: null,
      },
    },
    rpcError: null,
    client,
  };
  runtimeState.__projectCallSheetApiState = state;
  return state;
}

function context(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
}

function getRequest(query = "") {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/call-sheet${query}`,
  );
}

function jsonRequest(pathname: string, body: unknown, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json; charset=utf-8");
  }
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function rawRequest(pathname: string, body: string, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: requestHeaders,
    body,
  });
}

function generateBody() {
  return {
    requestId: REQUEST_ID.toUpperCase(),
    expectedAuthorityVersion: 8,
    expectedProductionScheduleRevisionId: SCHEDULE_REVISION_ID.toUpperCase(),
    scheduleDayId: DAY_ID,
  };
}

function appendBody() {
  return {
    requestId: REQUEST_ID,
    expectedAuthorityVersion: 8,
    baseRevisionId: REVISION_ID,
    changeSummary: "  Add crew contacts.  ",
    content: content(),
  };
}

function submitBody() {
  return {
    requestId: REQUEST_ID,
    expectedAuthorityVersion: 9,
    revisionId: REVISION_ID,
    note: "  Ready for producer review.  ",
  };
}

function decisionBody() {
  return {
    requestId: REQUEST_ID,
    expectedAuthorityVersion: 10,
    revisionId: REVISION_ID,
    decision: "approved",
    note: null,
  };
}

test("GET bootstraps with null day and returns the sanitized selected snapshot", async () => {
  const state = resetState();
  const response = await callSheetRoute.GET(getRequest(), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), publicSnapshot());
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["editor"]);
  assert.deepEqual(state.rpcCalls, [
    {
      name: "get_project_call_sheet",
      args: { p_project_id: PROJECT_ID, p_schedule_day_id: null },
    },
  ]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("GET passes one explicit day and rejects malformed query shapes", async () => {
  let state = resetState();
  let response = await callSheetRoute.GET(
    getRequest(`?dayId=${DAY_ID}`),
    context(),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(state.rpcCalls[0], {
    name: "get_project_call_sheet",
    args: { p_project_id: PROJECT_ID, p_schedule_day_id: DAY_ID },
  });

  for (const query of [
    "?dayId=bad%20day",
    `?dayId=${DAY_ID}&dayId=${DAY_ID}`,
    `?dayId=${DAY_ID}&secret=true`,
  ]) {
    state = resetState();
    response = await callSheetRoute.GET(getRequest(query), context());
    assert.equal(response.status, 404);
    assert.equal(state.rpcCalls.length, 0);
  }
});

test("all four commands call only their exact role-gated RPC contracts", async () => {
  let state = resetState();
  let response = await generateRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet/generate`, generateBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), publicRevisionReceipt());
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), [
    "producer",
  ]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "generate_project_call_sheet_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 8,
      p_expected_production_schedule_revision_id: SCHEDULE_REVISION_ID,
      p_schedule_day_id: DAY_ID,
      p_request_id: REQUEST_ID,
    },
  });

  state = resetState();
  response = await callSheetRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet`, appendBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["editor"]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "append_project_call_sheet_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 8,
      p_base_revision_id: REVISION_ID,
      p_request_id: REQUEST_ID,
      p_change_summary: "Add crew contacts.",
      p_content: content(),
    },
  });

  state = resetState();
  response = await submitRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet/submit`, submitBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["editor"]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "submit_project_call_sheet_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 9,
      p_call_sheet_revision_id: REVISION_ID,
      p_request_id: REQUEST_ID,
      p_note: "Ready for producer review.",
    },
  });

  state = resetState();
  response = await decisionRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet/decision`, decisionBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), [
    "producer",
  ]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "decide_project_call_sheet_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 10,
      p_call_sheet_revision_id: REVISION_ID,
      p_request_id: REQUEST_ID,
      p_decision: "approved",
      p_note: null,
    },
  });
});

test("anonymous and non-staff identities are rejected before params or body", async () => {
  const commands = [
    callSheetRoute.POST,
    generateRoute.POST,
    submitRoute.POST,
    decisionRoute.POST,
  ];
  for (const identity of [
    { user: null, staff: false, status: 401 },
    { user: { id: ACTOR_ID }, staff: false, status: 403 },
  ]) {
    for (const handler of commands) {
      const state = resetState();
      state.user = identity.user;
      state.staff = identity.staff;
      let bodyReads = 0;
      let paramsReads = 0;
      const request = {
        headers: new Headers({ "content-type": "application/json" }),
        async text() {
          bodyReads += 1;
          return JSON.stringify(generateBody());
        },
      } as Request;
      const params = {
        then(resolveValue: (value: { id: string }) => unknown) {
          paramsReads += 1;
          return Promise.resolve(resolveValue({ id: PROJECT_ID }));
        },
      } as Promise<{ id: string }>;
      const response = await handler(request, { params });
      assert.equal(response.status, identity.status);
      assert.equal(bodyReads, 0);
      assert.equal(paramsReads, 0);
      assert.equal(state.accessCalls.length, 0);
      assert.equal(state.rpcCalls.length, 0);
    }
  }
});

test("schema, role, identifier, media, bytes, JSON, and content fail closed", async () => {
  let state = resetState();
  state.schema = "public";
  assert.equal((await callSheetRoute.GET(getRequest(), context())).status, 503);
  assert.equal(state.accessCalls.length, 0);

  state = resetState();
  state.accessResult = { ok: false, status: 403, error: "Forbidden" };
  assert.equal(
    (
      await generateRoute.POST(
        jsonRequest(
          `/api/projects/${PROJECT_ID}/call-sheet/generate`,
          generateBody(),
        ),
        context(),
      )
    ).status,
    403,
  );
  assert.equal(state.rpcCalls.length, 0);

  resetState();
  assert.equal(
    (await callSheetRoute.GET(getRequest(), context("not-a-uuid"))).status,
    404,
  );

  resetState();
  assert.equal(
    (
      await generateRoute.POST(
        jsonRequest(
          `/api/projects/${PROJECT_ID}/call-sheet/generate`,
          generateBody(),
          { "content-type": "text/plain" },
        ),
        context(),
      )
    ).status,
    415,
  );

  resetState();
  assert.equal(
    (
      await submitRoute.POST(
        jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet/submit`, submitBody(), {
          "content-length": String(16 * 1024 + 1),
        }),
        context(),
      )
    ).status,
    413,
  );

  resetState();
  assert.equal(
    (
      await decisionRoute.POST(
        rawRequest(
          `/api/projects/${PROJECT_ID}/call-sheet/decision`,
          " ".repeat(16 * 1024 + 1),
        ),
        context(),
      )
    ).status,
    413,
  );

  resetState();
  assert.equal(
    (
      await decisionRoute.POST(
        rawRequest(`/api/projects/${PROJECT_ID}/call-sheet/decision`, "{bad"),
        context(),
      )
    ).status,
    400,
  );

  resetState();
  assert.equal(
    (
      await callSheetRoute.POST(
        jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet`, {
          ...appendBody(),
          content: { ...content(), schemaVersion: "cco.call-sheet.v2" },
        }),
        context(),
      )
    ).status,
    422,
  );
});

test("database errors, thrown dependencies, and malformed outputs are redacted", async () => {
  let state = resetState();
  state.rpcResults.generate_project_call_sheet_revision = {
    data: null,
    error: {
      code: "40001",
      message: "project_call_sheet_version_conflict private detail",
    },
  };
  let response = await generateRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet/generate`, generateBody()),
    context(),
  );
  assert.equal(response.status, 409);
  const conflictBody = await response.json();
  assert.match(conflictBody.error, /changed elsewhere/i);
  assert.doesNotMatch(conflictBody.error, /private detail/i);

  state = resetState();
  state.rpcResults.append_project_call_sheet_revision = {
    data: revisionReceipt({ projectId: SCHEDULE_REVISION_ID }),
    error: null,
  };
  response = await callSheetRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet`, appendBody()),
    context(),
  );
  assert.equal(response.status, 503);

  state = resetState();
  state.rpcResults.get_project_call_sheet = {
    data: { ...databaseSnapshot(), source: databaseSourceBinding() },
    error: null,
  };
  assert.equal((await callSheetRoute.GET(getRequest(), context())).status, 503);

  state = resetState();
  state.rpcError = new Error("network table secret");
  response = await submitRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet/submit`, submitBody()),
    context(),
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch((await response.json()).error, /network|table|secret/i);

  state = resetState();
  state.authError = new Error("auth dependency private detail");
  response = await callSheetRoute.GET(getRequest(), context());
  assert.equal(response.status, 503);
  assert.doesNotMatch((await response.json()).error, /private detail/i);
});

test("idempotent replay receipts return 200 without changing RPC shape", async () => {
  const state = resetState();
  state.rpcResults.decide_project_call_sheet_revision = {
    data: transitionReceipt({
      workflowState: "approved",
      authorityVersion: 11,
      replayed: true,
    }),
    error: null,
  };
  const response = await decisionRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/call-sheet/decision`, decisionBody()),
    context(),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).replayed, true);
  assert.equal(state.rpcCalls.length, 1);
});
