import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR_ID = "66666666-6666-4666-8666-666666666666";
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireStaffWithClient() {
    const state = globalThis.__projectScriptPlanApiState;
    state.authCalls += 1;
    if (state.authError) throw state.authError;
    return { user: state.user, staff: state.staff, supabase: state.client };
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    const state = globalThis.__projectScriptPlanApiState;
    state.accessCalls.push({ projectId, userId, minimumRole, client });
    if (state.accessError) throw state.accessError;
    return state.accessResult;
  }
`)}`;

const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    const state = globalThis.__projectScriptPlanApiState;
    if (state.schemaError) throw state.schemaError;
    return state.schema;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth/staff-client") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/data-authority") {
      return nextResolve(dataAuthorityStubUrl, context);
    }
    if (
      specifier === "@/lib/supabase"
      || specifier === "@/lib/auth-client"
      || specifier === "@/lib/auth"
    ) {
      throw new Error(`Script plan routes must not import ${specifier}`);
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

interface ScriptPlanApiState {
  user: { id: string } | null;
  staff: boolean;
  schema: string;
  authCalls: number;
  authError: Error | null;
  schemaError: Error | null;
  accessCalls: Array<Record<string, unknown>>;
  accessResult: AccessResult;
  accessError: Error | null;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  rpcResults: Record<string, RpcResult>;
  rpcError: Error | null;
  client: FakeClient;
}

class FakeClient {
  async rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
    const state = runtimeState.__projectScriptPlanApiState;
    assert.ok(state);
    state.rpcCalls.push({ name, args });
    if (state.rpcError) throw state.rpcError;
    return state.rpcResults[name] ?? { data: null, error: null };
  }
}

const runtimeState = globalThis as typeof globalThis & {
  __projectScriptPlanApiState?: ScriptPlanApiState;
};

function planContent() {
  return {
    title: "ICA field story production plan",
    summary: "An approved field story.",
    tasks: [
      {
        clientTaskId: "script-section-001",
        title: "Plan coverage: Opening",
        description: "Script cues:\nVisual: Establish the location.",
        priority: "normal",
        assigneeId: null,
        dueDate: null,
        sourceKind: "plan",
        sourceRef: "script-section:opening",
        dependsOnClientTaskIds: [],
      },
    ],
  };
}

function proposal() {
  return {
    projectId: PROJECT_ID,
    authorityVersion: 7,
    currentPlanRevision: 2,
    available: true,
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
    scriptTitle: "ICA field story",
    preview: planContent(),
    draft: null,
    alreadyMaterialized: false,
    materializedPlanRevision: null,
    permissions: { canGenerate: true, canApprove: true },
  };
}

function draftReceipt(replayed = false) {
  return {
    draftId: DRAFT_ID,
    projectId: PROJECT_ID,
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
    authorityVersion: 8,
    requestId: REQUEST_ID,
    replayed,
  };
}

function approvalReceipt(replayed = false) {
  return {
    planRevisionId: PLAN_ID,
    projectId: PROJECT_ID,
    revisionNumber: 3,
    authorityVersion: 9,
    taskCount: 1,
    requestId: REQUEST_ID,
    replayed,
    draftId: DRAFT_ID,
    scriptRevisionId: SCRIPT_ID,
    scriptRevisionNumber: 3,
  };
}

function resetState() {
  const client = new FakeClient();
  const state: ScriptPlanApiState = {
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
      get_project_script_plan_proposal: { data: proposal(), error: null },
      generate_project_script_plan_draft: { data: draftReceipt(), error: null },
      approve_project_script_plan_draft: { data: approvalReceipt(), error: null },
    },
    rpcError: null,
    client,
  };
  runtimeState.__projectScriptPlanApiState = state;
  return state;
}

const planRoute = await import(
  pathToFileURL(resolve(repositoryRoot, "app/api/projects/[id]/script/plan/route.ts")).href
);
const draftRoute = await import(
  pathToFileURL(
    resolve(repositoryRoot, "app/api/projects/[id]/script/plan/draft/route.ts"),
  ).href
);
const approvalRoute = await import(
  pathToFileURL(
    resolve(repositoryRoot, "app/api/projects/[id]/script/plan/approve/route.ts"),
  ).href
);

function context(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
}

function getRequest() {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/script/plan`);
}

function jsonRequest(pathname: string, body: unknown, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json; charset=utf-8");
  }
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: requestHeaders,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function draftCommand() {
  return {
    expectedAuthorityVersion: 7,
    expectedScriptRevisionId: SCRIPT_ID,
    requestId: REQUEST_ID,
  };
}

function approvalCommand() {
  return {
    draftId: DRAFT_ID,
    expectedPlanRevision: 2,
    requestId: REQUEST_ID,
    note: "  Approved against the locked script.\r\nProceed to production.  ",
  };
}

test("GET returns only a validated producer-scoped script plan proposal", async () => {
  const state = resetState();
  const response = await planRoute.GET(getRequest(), context());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), proposal());
  assert.deepEqual(state.accessCalls.map(({ projectId, userId, minimumRole }) => ({
    projectId,
    userId,
    minimumRole,
  })), [{ projectId: PROJECT_ID, userId: ACTOR_ID, minimumRole: "producer" }]);
  assert.deepEqual(state.rpcCalls, [{
    name: "get_project_script_plan_proposal",
    args: { p_project_id: PROJECT_ID },
  }]);
});

test("draft generation and producer approval send exact normalized RPC commands", async () => {
  const state = resetState();
  const draftResponse = await draftRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/plan/draft`, draftCommand()),
    context(),
  );
  assert.equal(draftResponse.status, 201);
  assert.deepEqual(await draftResponse.json(), draftReceipt());
  assert.deepEqual(state.rpcCalls.at(-1), {
    name: "generate_project_script_plan_draft",
    args: {
      p_project_id: PROJECT_ID,
      p_expected_authority_version: 7,
      p_expected_script_revision_id: SCRIPT_ID,
      p_request_id: REQUEST_ID,
    },
  });

  const approvalResponse = await approvalRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/plan/approve`, approvalCommand()),
    context(),
  );
  assert.equal(approvalResponse.status, 201);
  assert.deepEqual(await approvalResponse.json(), approvalReceipt());
  assert.deepEqual(state.rpcCalls.at(-1), {
    name: "approve_project_script_plan_draft",
    args: {
      p_project_id: PROJECT_ID,
      p_draft_id: DRAFT_ID,
      p_expected_plan_revision: 2,
      p_request_id: REQUEST_ID,
      p_note: "Approved against the locked script.\nProceed to production.",
    },
  });

  state.rpcResults.generate_project_script_plan_draft = {
    data: draftReceipt(true),
    error: null,
  };
  const replay = await draftRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/plan/draft`, draftCommand()),
    context(),
  );
  assert.equal(replay.status, 200);
});

test("script plan routes fail closed across identity, schema, project, and body gates", async (t) => {
  await t.test("authentication and staff role", async () => {
    const state = resetState();
    state.user = null;
    assert.equal((await planRoute.GET(getRequest(), context())).status, 401);
    assert.equal(state.accessCalls.length, 0);

    state.user = { id: ACTOR_ID };
    state.staff = false;
    assert.equal((await planRoute.GET(getRequest(), context())).status, 403);
    assert.equal(state.accessCalls.length, 0);
  });

  await t.test("schema and project authority", async () => {
    const state = resetState();
    state.schema = "public";
    assert.equal((await planRoute.GET(getRequest(), context())).status, 503);

    resetState();
    assert.equal((await planRoute.GET(getRequest(), context("not-a-uuid"))).status, 404);

    const denied = resetState();
    denied.accessResult = { ok: false, status: 403, error: "Forbidden" };
    assert.equal((await planRoute.GET(getRequest(), context())).status, 403);
    assert.equal(denied.rpcCalls.length, 0);
  });

  await t.test("content type, length, JSON, and exact shape", async () => {
    resetState();
    const wrongType = jsonRequest(
      `/api/projects/${PROJECT_ID}/script/plan/draft`,
      draftCommand(),
      { "content-type": "text/plain" },
    );
    assert.equal((await draftRoute.POST(wrongType, context())).status, 415);

    resetState();
    const oversized = jsonRequest(
      `/api/projects/${PROJECT_ID}/script/plan/draft`,
      draftCommand(),
      { "content-length": String(16 * 1024 + 1) },
    );
    assert.equal((await draftRoute.POST(oversized, context())).status, 413);

    resetState();
    const malformed = jsonRequest(
      `/api/projects/${PROJECT_ID}/script/plan/approve`,
      "{not-json",
    );
    assert.equal((await approvalRoute.POST(malformed, context())).status, 400);

    resetState();
    const unknown = jsonRequest(
      `/api/projects/${PROJECT_ID}/script/plan/draft`,
      { ...draftCommand(), clientPlan: planContent() },
    );
    assert.equal((await draftRoute.POST(unknown, context())).status, 422);
  });
});

test("database conflicts are actionable and malformed receipts fail closed", async () => {
  const state = resetState();
  state.rpcResults.generate_project_script_plan_draft = {
    data: null,
    error: { message: "production_plan_draft_authority_version_conflict" },
  };
  const conflict = await draftRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/plan/draft`, draftCommand()),
    context(),
  );
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /changed elsewhere/i);

  state.rpcResults.approve_project_script_plan_draft = {
    data: { ...approvalReceipt(), projectId: SCRIPT_ID },
    error: null,
  };
  const malformed = await approvalRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/plan/approve`, approvalCommand()),
    context(),
  );
  assert.equal(malformed.status, 503);
});
