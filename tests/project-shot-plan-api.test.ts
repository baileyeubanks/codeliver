import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR_ID = "66666666-6666-4666-8666-666666666666";
const BINDING_ID = "77777777-7777-4777-8777-777777777777";
const HASH = `sha256:${"a".repeat(64)}`;

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireStaffWithClient() {
    const state = globalThis.__projectShotPlanApiState;
    state.authCalls += 1;
    if (state.authError) throw state.authError;
    return { user: state.user, staff: state.staff, supabase: state.client };
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    const state = globalThis.__projectShotPlanApiState;
    state.accessCalls.push({ projectId, userId, minimumRole, client });
    if (state.accessError) throw state.accessError;
    return state.accessResult;
  }
`)}`;

const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    const state = globalThis.__projectShotPlanApiState;
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
      throw new Error(`Shot plan routes must not import ${specifier}`);
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
    return nextResolve(specifier, context);
  },
});

type RpcError = { code?: string; message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type AccessResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };
type RpcCall = { name: string; args: Record<string, unknown> };

interface ProjectShotPlanApiState {
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
    const state = runtimeState.__projectShotPlanApiState;
    assert.ok(state);
    state.rpcCalls.push({ name, args });
    if (state.rpcError) throw state.rpcError;
    return state.rpcResults[name] ?? { data: null, error: null };
  }
}

const runtimeState = globalThis as typeof globalThis & {
  __projectShotPlanApiState?: ProjectShotPlanApiState;
};

const contract = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/preproduction/shot-plan.ts")).href
);
const shotPlanRoute = await import(
  pathToFileURL(
    resolve(repositoryRoot, "app/api/projects/[id]/shot-plan/route.ts"),
  ).href
);
const generateRoute = await import(
  pathToFileURL(
    resolve(
      repositoryRoot,
      "app/api/projects/[id]/shot-plan/generate/route.ts",
    ),
  ).href
);
const submitRoute = await import(
  pathToFileURL(
    resolve(
      repositoryRoot,
      "app/api/projects/[id]/shot-plan/submit/route.ts",
    ),
  ).href
);
const decisionRoute = await import(
  pathToFileURL(
    resolve(
      repositoryRoot,
      "app/api/projects/[id]/shot-plan/decision/route.ts",
    ),
  ).href
);

function scriptContent() {
  return {
    schemaVersion: "cco.script-content.v1",
    title: "Approved Story",
    logline: null,
    format: "interview",
    estimatedRuntimeSeconds: 30,
    sections: [
      {
        id: "opening",
        heading: "Opening",
        summary: "Establish the approved idea.",
        estimatedDurationSeconds: 15,
        blocks: [
          {
            id: "opening-visual",
            kind: "visual",
            text: "Approved visual coverage.",
            speaker: null,
            parenthetical: null,
          },
        ],
      },
    ],
  };
}

function content() {
  return contract.deriveProjectShotPlanContent(scriptContent());
}

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

function snapshot(projectId = PROJECT_ID) {
  return {
    projectId,
    authorityVersion: 8,
    eventHeadHash: HASH,
    source: source(),
    head: null,
    revisions: [],
    permissions: {
      canGenerate: true,
      canRevise: false,
      canSubmit: false,
      canDecide: false,
    },
  };
}

function publicSnapshot(projectId = PROJECT_ID) {
  return { ...snapshot(projectId), active: null };
}

function revisionReceipt(overrides: Record<string, unknown> = {}) {
  return {
    shotPlanRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    workflowState: "draft",
    source: source(),
    authorityVersion: 9,
    requestId: REQUEST_ID,
    replayed: false,
    ...overrides,
  };
}

function transitionReceipt(overrides: Record<string, unknown> = {}) {
  return {
    shotPlanRevisionId: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 1,
    workflowState: "submitted",
    authorityVersion: 10,
    requestId: REQUEST_ID,
    replayed: false,
    ...overrides,
  };
}

function resetState(): ProjectShotPlanApiState {
  const client = new FakeClient();
  const state: ProjectShotPlanApiState = {
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
      get_project_shot_plan: { data: snapshot(), error: null },
      generate_project_shot_plan_revision: {
        data: revisionReceipt(),
        error: null,
      },
      append_project_shot_plan_revision: {
        data: revisionReceipt({
          revisionNumber: 2,
          baseRevisionId: REVISION_ID,
        }),
        error: null,
      },
      submit_project_shot_plan_revision: {
        data: transitionReceipt(),
        error: null,
      },
      decide_project_shot_plan_revision: {
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
  runtimeState.__projectShotPlanApiState = state;
  return state;
}

function context(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
}

function getRequest() {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/shot-plan`);
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
    expectedScriptRevisionId: SCRIPT_ID.toUpperCase(),
    expectedProductionPlanRevisionId: PLAN_ID.toUpperCase(),
  };
}

function appendBody() {
  return {
    requestId: REQUEST_ID,
    expectedAuthorityVersion: 8,
    baseRevisionId: REVISION_ID,
    changeSummary: "  Refine approved coverage.  ",
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

test("GET returns only the strict snapshot through the editor-gated RPC", async () => {
  const state = resetState();
  const response = await shotPlanRoute.GET(getRequest(), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), publicSnapshot());
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["editor"]);
  assert.deepEqual(state.rpcCalls, [
    { name: "get_project_shot_plan", args: { p_project_id: PROJECT_ID } },
  ]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("all four commands call only their exact bounded RPC contracts", async () => {
  let state = resetState();
  let response = await generateRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/generate`, generateBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["producer"]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "generate_project_shot_plan_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 8,
      p_expected_script_revision_id: SCRIPT_ID,
      p_expected_production_plan_revision_id: PLAN_ID,
      p_request_id: REQUEST_ID,
    },
  });

  state = resetState();
  response = await shotPlanRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan`, appendBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["editor"]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "append_project_shot_plan_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 8,
      p_base_revision_id: REVISION_ID,
      p_request_id: REQUEST_ID,
      p_change_summary: "Refine approved coverage.",
      p_content: content(),
    },
  });

  state = resetState();
  response = await submitRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/submit`, submitBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["editor"]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "submit_project_shot_plan_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 9,
      p_shot_plan_revision_id: REVISION_ID,
      p_request_id: REQUEST_ID,
      p_note: "Ready for producer review.",
    },
  });

  state = resetState();
  response = await decisionRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/decision`, decisionBody()),
    context(),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.accessCalls.map((call) => call.minimumRole), ["producer"]);
  assert.deepEqual(state.rpcCalls[0], {
    name: "decide_project_shot_plan_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 10,
      p_shot_plan_revision_id: REVISION_ID,
      p_request_id: REQUEST_ID,
      p_decision: "approved",
      p_note: null,
    },
  });
});

test("anonymous and non-staff identities are rejected before params or body", async () => {
  const commands = [
    shotPlanRoute.POST,
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

test("schema, project role, identifier, media type, bytes, JSON, and shape fail closed", async () => {
  let state = resetState();
  state.schema = "public";
  assert.equal((await shotPlanRoute.GET(getRequest(), context())).status, 503);
  assert.equal(state.accessCalls.length, 0);

  state = resetState();
  state.accessResult = { ok: false, status: 403, error: "Forbidden" };
  assert.equal(
    (
      await generateRoute.POST(
        jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/generate`, generateBody()),
        context(),
      )
    ).status,
    403,
  );
  assert.equal(state.rpcCalls.length, 0);

  resetState();
  assert.equal((await shotPlanRoute.GET(getRequest(), context("not-a-uuid"))).status, 404);

  resetState();
  assert.equal(
    (
      await generateRoute.POST(
        jsonRequest(
          `/api/projects/${PROJECT_ID}/shot-plan/generate`,
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
        jsonRequest(
          `/api/projects/${PROJECT_ID}/shot-plan/submit`,
          submitBody(),
          { "content-length": String(16 * 1024 + 1) },
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
        rawRequest(`/api/projects/${PROJECT_ID}/shot-plan/decision`, "{not-json"),
        context(),
      )
    ).status,
    400,
  );

  resetState();
  assert.equal(
    (
      await generateRoute.POST(
        jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/generate`, {
          ...generateBody(),
          content: content(),
        }),
        context(),
      )
    ).status,
    422,
  );
});

test("database errors, thrown dependencies, and malformed receipts fail closed", async () => {
  let state = resetState();
  state.rpcResults.generate_project_shot_plan_revision = {
    data: null,
    error: { code: "40001", message: "project_shot_plan_version_conflict" },
  };
  let response = await generateRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/generate`, generateBody()),
    context(),
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /changed elsewhere/i);

  state = resetState();
  state.rpcResults.append_project_shot_plan_revision = {
    data: revisionReceipt({ projectId: SCRIPT_ID }),
    error: null,
  };
  response = await shotPlanRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan`, appendBody()),
    context(),
  );
  assert.equal(response.status, 503);

  state = resetState();
  state.rpcResults.get_project_shot_plan = {
    data: { ...snapshot(), secret: "not public" },
    error: null,
  };
  assert.equal((await shotPlanRoute.GET(getRequest(), context())).status, 503);

  state = resetState();
  state.rpcError = new Error("network detail");
  response = await submitRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/submit`, submitBody()),
    context(),
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch((await response.json()).error, /network detail/);

  state = resetState();
  state.authError = new Error("auth dependency detail");
  assert.equal((await shotPlanRoute.GET(getRequest(), context())).status, 503);
});

test("idempotent replay receipts return 200", async () => {
  const state = resetState();
  state.rpcResults.decide_project_shot_plan_revision = {
    data: transitionReceipt({
      workflowState: "approved",
      authorityVersion: 11,
      replayed: true,
    }),
    error: null,
  };
  const response = await decisionRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/shot-plan/decision`, decisionBody()),
    context(),
  );
  assert.equal(response.status, 200);
});
