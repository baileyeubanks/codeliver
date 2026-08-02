import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const BASE_REVISION_ID = "55555555-5555-4555-8555-555555555555";
const HASH = `sha256:${"a".repeat(64)}`;

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireStaffWithClient() {
    const state = globalThis.__projectScriptApiState;
    state.authCalls += 1;
    if (state.authError) throw state.authError;
    return { user: state.user, staff: state.staff, supabase: state.client };
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    const state = globalThis.__projectScriptApiState;
    state.accessCalls.push({ projectId, userId, minimumRole, client });
    if (state.accessError) throw state.accessError;
    return state.accessResult;
  }
`)}`;

const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    const state = globalThis.__projectScriptApiState;
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
      throw new Error(`Project script routes must not import ${specifier}`);
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
type AccessCall = {
  projectId: string;
  userId: string;
  minimumRole: string;
  client: unknown;
};
type RpcCall = {
  client: unknown;
  name: string;
  args: Record<string, unknown>;
};

interface ProjectScriptApiState {
  user: { id: string } | null;
  staff: boolean;
  schema: string;
  authCalls: number;
  authError: Error | null;
  schemaError: Error | null;
  accessCalls: AccessCall[];
  accessResult: AccessResult;
  accessError: Error | null;
  rpcCalls: RpcCall[];
  rpcResult: RpcResult;
  rpcError: Error | null;
  client: FakeClient;
}

class FakeClient {
  async rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
    const state = runtimeState.__projectScriptApiState;
    assert.ok(state);
    state.rpcCalls.push({ client: this, name, args });
    if (state.rpcError) throw state.rpcError;
    return state.rpcResult;
  }
}

const runtimeState = globalThis as typeof globalThis & {
  __projectScriptApiState?: ProjectScriptApiState;
};

function resetState(): ProjectScriptApiState {
  const client = new FakeClient();
  const state: ProjectScriptApiState = {
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
    rpcResult: { data: null, error: null },
    rpcError: null,
    client,
  };
  runtimeState.__projectScriptApiState = state;
  return state;
}

const contract = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/preproduction/project-script.ts")).href
);
const scriptRoute = await import(
  pathToFileURL(resolve(repositoryRoot, "app/api/projects/[id]/script/route.ts")).href
);
const submitRoute = await import(
  pathToFileURL(
    resolve(repositoryRoot, "app/api/projects/[id]/script/submit/route.ts"),
  ).href
);
const decisionRoute = await import(
  pathToFileURL(
    resolve(repositoryRoot, "app/api/projects/[id]/script/decision/route.ts"),
  ).href
);

function validContent() {
  return {
    schemaVersion: "cco.script-content.v1",
    title: "  Launch Film  ",
    logline: "  A practical launch story.  ",
    format: "commercial",
    estimatedRuntimeSeconds: 90,
    sections: [
      {
        id: "  OPENING  ",
        heading: "  Opening  ",
        summary: null,
        estimatedDurationSeconds: 15,
        blocks: [
          {
            id: "  OPENING.VISUAL-1  ",
            kind: "visual",
            text: "  Product enters frame.\r\nCamera settles.  ",
            speaker: "   ",
            parenthetical: null,
          },
        ],
      },
    ],
  };
}

function appendBody() {
  return {
    requestId: REQUEST_ID.toUpperCase(),
    expectedAuthorityVersion: 7,
    baseRevisionId: BASE_REVISION_ID.toUpperCase(),
    changeSummary: "  Tighten the opening.\r\nKeep product detail.  ",
    content: validContent(),
  };
}

function submitBody() {
  return {
    requestId: REQUEST_ID,
    expectedAuthorityVersion: 8,
    revisionId: REVISION_ID,
    note: "  Ready for producer review.  ",
  };
}

function decisionBody() {
  return {
    requestId: REQUEST_ID,
    expectedAuthorityVersion: 9,
    revisionId: REVISION_ID,
    decision: "approved",
    note: null,
  };
}

function metadata() {
  return {
    revisionId: REVISION_ID,
    revisionNumber: 3,
    baseRevisionId: BASE_REVISION_ID,
    state: "submitted",
    changeSummary: "Tighten the opening.",
    contentHash: HASH,
    createdBy: ACTOR_ID,
    createdAt: "2026-07-16T14:00:00.000Z",
    submittedBy: ACTOR_ID,
    submittedAt: "2026-07-16T14:01:00.000Z",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  };
}

function snapshot(projectId = PROJECT_ID) {
  const revision = metadata();
  return {
    projectId,
    authorityVersion: 8,
    eventHeadHash: HASH,
    head: { ...revision, content: contract.parseProjectScriptContent(validContent()) },
    revisions: [revision],
    permissions: { canRevise: true, canSubmit: true, canDecide: false },
  };
}

function revisionReceipt(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    projectId: PROJECT_ID,
    revisionId: REVISION_ID,
    revisionNumber: 3,
    authorityVersion: 8,
    requestId: REQUEST_ID,
    replayed: false,
    ...overrides,
  };
}

function commandReceipt(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    projectId: PROJECT_ID,
    revisionId: REVISION_ID,
    authorityVersion: 9,
    requestId: REQUEST_ID,
    replayed: false,
    ...overrides,
  };
}

function context(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
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

function expectCode(code: string) {
  return (error: unknown) =>
    error instanceof contract.ProjectScriptValidationError &&
    error.code === code;
}

test("request parsers normalize safe strings and enforce exact command shapes", () => {
  const append = contract.parseAppendProjectScriptRevisionRequest(appendBody());
  assert.equal(append.requestId, REQUEST_ID);
  assert.equal(append.baseRevisionId, BASE_REVISION_ID);
  assert.equal(append.changeSummary, "Tighten the opening.\nKeep product detail.");
  assert.equal(append.content.title, "Launch Film");
  assert.equal(append.content.sections[0].id, "opening");
  assert.equal(append.content.sections[0].blocks[0].id, "opening.visual-1");
  assert.equal(
    append.content.sections[0].blocks[0].text,
    "Product enters frame.\nCamera settles.",
  );
  assert.equal(append.content.sections[0].blocks[0].speaker, null);

  assert.equal(
    contract.parseSubmitProjectScriptRevisionRequest(submitBody()).note,
    "Ready for producer review.",
  );
  assert.equal(
    contract.parseDecideProjectScriptRevisionRequest(decisionBody()).decision,
    "approved",
  );

  for (const invalid of [
    { ...appendBody(), unexpected: true },
    { ...appendBody(), content: { ...validContent(), unexpected: true } },
    {
      ...appendBody(),
      content: {
        ...validContent(),
        sections: [{ ...validContent().sections[0], unexpected: true }],
      },
    },
    {
      ...appendBody(),
      content: {
        ...validContent(),
        sections: [
          {
            ...validContent().sections[0],
            blocks: [
              { ...validContent().sections[0].blocks[0], unexpected: true },
            ],
          },
        ],
      },
    },
  ]) {
    assert.throws(
      () => contract.parseAppendProjectScriptRevisionRequest(invalid),
      expectCode("unknown_field"),
    );
  }

  const missingNullable = { ...appendBody() } as Record<string, unknown>;
  delete missingNullable.baseRevisionId;
  assert.throws(
    () => contract.parseAppendProjectScriptRevisionRequest(missingNullable),
    expectCode("missing_field"),
  );
  assert.throws(
    () =>
      contract.parseSubmitProjectScriptRevisionRequest({
        ...submitBody(),
        revisionId: "not-a-uuid",
      }),
    expectCode("invalid_uuid"),
  );
  assert.throws(
    () =>
      contract.parseDecideProjectScriptRevisionRequest({
        ...decisionBody(),
        decision: "changes_requested",
        note: "   ",
      }),
    expectCode("note_required"),
  );
});

test("content parser enforces section, aggregate block, text, enum, and stable-id bounds", () => {
  assert.throws(
    () =>
      contract.parseProjectScriptContent({ ...validContent(), sections: [] }),
    expectCode("invalid_sections"),
  );
  assert.throws(
    () =>
      contract.parseProjectScriptContent({
        ...validContent(),
        sections: Array.from({ length: 201 }, (_, index) => ({
          ...validContent().sections[0],
          id: `section-${index}`,
          blocks: [],
        })),
      }),
    expectCode("invalid_sections"),
  );
  assert.throws(
    () =>
      contract.parseProjectScriptContent({
        ...validContent(),
        sections: [
          {
            ...validContent().sections[0],
            blocks: Array.from({ length: 2_001 }, (_, index) => ({
              ...validContent().sections[0].blocks[0],
              id: `block-${index}`,
              text: "x",
            })),
          },
        ],
      }),
    expectCode("too_many_blocks"),
  );
  assert.throws(
    () =>
      contract.parseProjectScriptContent({
        ...validContent(),
        sections: [
          {
            ...validContent().sections[0],
            blocks: Array.from({ length: 11 }, (_, index) => ({
              ...validContent().sections[0].blocks[0],
              id: `block-${index}`,
              text: "x".repeat(20_000),
            })),
          },
        ],
      }),
    expectCode("too_much_text"),
  );
  assert.throws(
    () =>
      contract.parseProjectScriptContent({
        ...validContent(),
        format: "podcast",
      }),
    expectCode("invalid_enum"),
  );
  assert.throws(
    () =>
      contract.parseProjectScriptContent({
        ...validContent(),
        sections: [
          {
            ...validContent().sections[0],
            blocks: [
              validContent().sections[0].blocks[0],
              { ...validContent().sections[0].blocks[0], id: "OPENING" },
            ],
          },
        ],
      }),
    expectCode("duplicate_id"),
  );
  assert.throws(
    () =>
      contract.parseProjectScriptContent({
        ...validContent(),
        title: "unsafe\u0000title",
      }),
    expectCode("invalid_string"),
  );
  assert.throws(
    () =>
      contract.parseProjectScriptContent({
        ...validContent(),
        sections: [
          {
            ...validContent().sections[0],
            blocks: Array.from({ length: 27 }, (_, index) => ({
              ...validContent().sections[0].blocks[0],
              id: `oversized-${index}`,
              text: "x".repeat(20_000),
            })),
          },
        ],
      }),
    expectCode("content_too_large"),
  );
});

test("snapshot and receipt parsers reject incomplete, foreign, and extra output", () => {
  assert.deepEqual(contract.parseProjectScriptSnapshot(snapshot()), snapshot());
  assert.equal(
    contract.parseProjectScriptSnapshot({ ...snapshot(), extra: "secret" }),
    null,
  );
  assert.equal(
    contract.parseProjectScriptSnapshot({
      ...snapshot(),
      permissions: { canRevise: true, canSubmit: true },
    }),
    null,
  );
  assert.deepEqual(
    contract.parseProjectScriptRevisionReceipt(revisionReceipt()),
    revisionReceipt(),
  );
  assert.deepEqual(
    contract.parseProjectScriptCommandReceipt(commandReceipt()),
    commandReceipt(),
  );
  assert.equal(
    contract.parseProjectScriptRevisionReceipt(commandReceipt()),
    null,
  );
  assert.equal(
    contract.parseProjectScriptCommandReceipt({
      ...commandReceipt(),
      internalReceiptHash: HASH,
    }),
    null,
  );
});

test("current RPC JSON normalizes to the strict public snapshot and receipt shapes", () => {
  const content = contract.parseProjectScriptContent(validContent());
  const rpcRevision = {
    id: REVISION_ID,
    projectId: PROJECT_ID,
    revisionNumber: 3,
    baseRevisionId: BASE_REVISION_ID,
    effectiveState: "submitted",
    changeSummary: "Tighten the opening.",
    content,
    contentHash: HASH,
    sourceKind: "manual",
    sourceProjectBriefRevisionId: null,
    sourceProjectBriefContentHash: null,
    createdBy: ACTOR_ID,
    createdAt: "2026-07-16T14:00:00.000Z",
  };
  const parsedSnapshot = contract.parseProjectScriptSnapshot({
    projectId: PROJECT_ID,
    authorityVersion: 8,
    eventHeadHash: HASH,
    script: rpcRevision,
    revisions: [rpcRevision],
    permissions: {
      role: "editor",
      canAppend: true,
      canSubmit: true,
      canDecide: false,
    },
  });
  assert.equal(parsedSnapshot?.head?.revisionId, REVISION_ID);
  assert.deepEqual(parsedSnapshot?.head?.content, content);
  assert.deepEqual(parsedSnapshot?.permissions, {
    canRevise: true,
    canSubmit: true,
    canDecide: false,
  });
  assert.equal(parsedSnapshot?.revisions[0].submittedBy, null);

  assert.deepEqual(
    contract.parseProjectScriptRevisionReceipt({
      scriptRevisionId: REVISION_ID,
      projectId: PROJECT_ID,
      revisionNumber: 3,
      baseRevisionId: BASE_REVISION_ID,
      effectiveState: "draft",
      contentHash: HASH,
      sourceProjectBriefRevisionId: null,
      sourceProjectBriefContentHash: null,
      authorityVersion: 8,
      requestId: REQUEST_ID,
      replayed: false,
    }),
    revisionReceipt(),
  );
  assert.deepEqual(
    contract.parseProjectScriptCommandReceipt({
      scriptRevisionId: REVISION_ID,
      projectId: PROJECT_ID,
      revisionNumber: 3,
      effectiveState: "submitted",
      authorityVersion: 9,
      requestId: REQUEST_ID,
      replayed: false,
    }),
    commandReceipt(),
  );
});

test("all routes reject anonymous and non-staff identities before params, access, or body", async () => {
  const commands = [
    { handler: scriptRoute.POST, path: `/api/projects/${PROJECT_ID}/script` },
    {
      handler: submitRoute.POST,
      path: `/api/projects/${PROJECT_ID}/script/submit`,
    },
    {
      handler: decisionRoute.POST,
      path: `/api/projects/${PROJECT_ID}/script/decision`,
    },
  ];

  for (const expected of [
    { user: null, staff: false, status: 401 },
    { user: { id: ACTOR_ID }, staff: false, status: 403 },
  ]) {
    for (const command of commands) {
      const state = resetState();
      state.user = expected.user;
      state.staff = expected.staff;
      let bodyReads = 0;
      let paramsReads = 0;
      const request = {
        headers: new Headers({ "content-type": "application/json" }),
        async text() {
          bodyReads += 1;
          return JSON.stringify(appendBody());
        },
      } as Request;
      const params = {
        then(resolveValue: (value: { id: string }) => unknown) {
          paramsReads += 1;
          return Promise.resolve(resolveValue({ id: PROJECT_ID }));
        },
      } as Promise<{ id: string }>;
      const response = await command.handler(request, { params });
      assert.equal(response.status, expected.status);
      assert.equal(paramsReads, 0);
      assert.equal(bodyReads, 0);
      assert.deepEqual(state.accessCalls, []);
      assert.deepEqual(state.rpcCalls, []);
    }
  }

  const anonymousGet = resetState();
  anonymousGet.user = null;
  anonymousGet.staff = false;
  const getResponse = await scriptRoute.GET(
    new Request(`http://localhost/api/projects/${PROJECT_ID}/script`),
    context(),
  );
  assert.equal(getResponse.status, 401);
  assert.deepEqual(anonymousGet.accessCalls, []);
  assert.deepEqual(anonymousGet.rpcCalls, []);
});

test("routes bind exact user-scoped clients, role floors, and RPC payloads", async () => {
  const read = resetState();
  read.rpcResult = { data: snapshot(), error: null };
  const readResponse = await scriptRoute.GET(
    new Request(`http://localhost/api/projects/${PROJECT_ID}/script`),
    context(),
  );
  assert.equal(readResponse.status, 200);
  assert.deepEqual(read.accessCalls, [
    {
      projectId: PROJECT_ID,
      userId: ACTOR_ID,
      minimumRole: "member",
      client: read.client,
    },
  ]);
  assert.deepEqual(read.rpcCalls, [
    {
      client: read.client,
      name: "get_project_script",
      args: { p_project_id: PROJECT_ID },
    },
  ]);

  const append = resetState();
  append.rpcResult = { data: revisionReceipt(), error: null };
  const appendResponse = await scriptRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script`, appendBody()),
    context(),
  );
  assert.equal(appendResponse.status, 201);
  assert.equal(append.accessCalls[0].minimumRole, "editor");
  assert.equal(append.accessCalls[0].client, append.client);
  assert.deepEqual(append.rpcCalls, [
    {
      client: append.client,
      name: "append_project_script_revision",
      args: {
        p_project_id: PROJECT_ID,
        p_expected_authority_version: 7,
        p_request_id: REQUEST_ID,
        p_base_revision_id: BASE_REVISION_ID,
        p_change_summary: "Tighten the opening.\nKeep product detail.",
        p_content: contract.parseProjectScriptContent(validContent()),
      },
    },
  ]);

  const submit = resetState();
  submit.rpcResult = { data: commandReceipt(), error: null };
  const submitResponse = await submitRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/submit`, submitBody()),
    context(),
  );
  assert.equal(submitResponse.status, 201);
  assert.equal(submit.accessCalls[0].minimumRole, "editor");
  assert.equal(submit.accessCalls[0].client, submit.client);
  assert.deepEqual(submit.rpcCalls[0], {
    client: submit.client,
    name: "submit_project_script_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_script_revision_id: REVISION_ID,
      p_expected_authority_version: 8,
      p_request_id: REQUEST_ID,
      p_note: "Ready for producer review.",
    },
  });

  const decision = resetState();
  decision.rpcResult = {
    data: commandReceipt({ authorityVersion: 10 }),
    error: null,
  };
  const decisionResponse = await decisionRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/decision`, decisionBody()),
    context(),
  );
  assert.equal(decisionResponse.status, 201);
  assert.equal(decision.accessCalls[0].minimumRole, "producer");
  assert.equal(decision.accessCalls[0].client, decision.client);
  assert.deepEqual(decision.rpcCalls[0], {
    client: decision.client,
    name: "decide_project_script_revision",
    args: {
      p_project_id: PROJECT_ID,
      p_script_revision_id: REVISION_ID,
      p_expected_authority_version: 9,
      p_request_id: REQUEST_ID,
      p_decision: "approved",
      p_note: null,
    },
  });
});

test("access and schema gates run before command body processing", async () => {
  for (const route of [scriptRoute.POST, submitRoute.POST, decisionRoute.POST]) {
    const state = resetState();
    state.accessResult = { ok: false, status: 404, error: "sensitive lookup" };
    let bodyReads = 0;
    const request = {
      headers: new Headers({ "content-type": "application/json" }),
      async text() {
        bodyReads += 1;
        return "{}";
      },
    } as Request;
    const response = await route(request, context());
    assert.equal(response.status, 404);
    assert.equal(bodyReads, 0);
    assert.deepEqual(state.rpcCalls, []);
    assert.equal((await response.text()).includes("sensitive"), false);
  }

  const schema = resetState();
  schema.schema = "public";
  const response = await scriptRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script`, appendBody()),
    context(),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(schema.accessCalls, []);
  assert.deepEqual(schema.rpcCalls, []);
});

test("commands return 200 only for replay and reject malformed or mismatched receipts", async () => {
  const replay = resetState();
  replay.rpcResult = {
    data: revisionReceipt({ replayed: true }),
    error: null,
  };
  const replayResponse = await scriptRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script`, appendBody()),
    context(),
  );
  assert.equal(replayResponse.status, 200);

  const cases = [
    {
      handler: scriptRoute.POST,
      body: appendBody(),
      data: commandReceipt(),
      path: `/api/projects/${PROJECT_ID}/script`,
    },
    {
      handler: submitRoute.POST,
      body: submitBody(),
      data: commandReceipt({ projectId: BASE_REVISION_ID }),
      path: `/api/projects/${PROJECT_ID}/script/submit`,
    },
    {
      handler: decisionRoute.POST,
      body: decisionBody(),
      data: commandReceipt({ revisionId: BASE_REVISION_ID }),
      path: `/api/projects/${PROJECT_ID}/script/decision`,
    },
  ];
  for (const invalid of cases) {
    const state = resetState();
    state.rpcResult = { data: invalid.data, error: null };
    const invalidResponse = await invalid.handler(
      jsonRequest(invalid.path, invalid.body),
      context(),
    );
    assert.equal(invalidResponse.status, 503);
    assert.deepEqual(await invalidResponse.json(), {
      error: "Project script is temporarily unavailable",
    });
  }
});

test("database failures map to fixed statuses without leaking provider details", async () => {
  const failures = [
    ["project_script_stale_authority", 409],
    ["project_script_idempotency_conflict", 409],
    ["project_script_decision_conflict", 409],
    ["project_script_forbidden", 403],
    ["project_script_not_found", 404],
    ["invalid_project_script", 422],
    ["connection failed password=super-secret", 503],
  ] as const;

  for (const [marker, status] of failures) {
    const state = resetState();
    state.rpcResult = {
      data: null,
      error: { code: "P0001", message: `${marker}: internal-secret-table` },
    };
    const response = await scriptRoute.POST(
      jsonRequest(`/api/projects/${PROJECT_ID}/script`, appendBody()),
      context(),
    );
    assert.equal(response.status, status, marker);
    const text = await response.text();
    assert.equal(text.includes(marker), false, marker);
    assert.equal(text.includes("internal-secret-table"), false, marker);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
});

test("thrown auth, schema, access, and RPC failures stay unavailable and sanitized", async () => {
  for (const boundary of ["auth", "schema", "access", "rpc"] as const) {
    const state = resetState();
    const secret = `${boundary}-provider-secret`;
    if (boundary === "auth") state.authError = new Error(secret);
    if (boundary === "schema") state.schemaError = new Error(secret);
    if (boundary === "access") state.accessError = new Error(secret);
    if (boundary === "rpc") state.rpcError = new Error(secret);
    const response = await scriptRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/script`),
      context(),
    );
    assert.equal(response.status, 503, boundary);
    assert.equal((await response.text()).includes(secret), false, boundary);
  }
});

test("request media type, byte limits, and semantic validation fail before RPC", async () => {
  assert.equal(contract.PROJECT_SCRIPT_APPEND_MAX_BYTES, 512 * 1024);

  const wrongType = resetState();
  const wrongTypeResponse = await scriptRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script`, appendBody(), {
      "content-type": "text/plain",
    }),
    context(),
  );
  assert.equal(wrongTypeResponse.status, 415);
  assert.deepEqual(wrongType.rpcCalls, []);

  const declared = resetState();
  const declaredResponse = await submitRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/submit`, submitBody(), {
      "content-length": String(contract.PROJECT_SCRIPT_COMMAND_MAX_BYTES + 1),
    }),
    context(),
  );
  assert.equal(declaredResponse.status, 413);
  assert.deepEqual(declared.rpcCalls, []);

  const semantic = resetState();
  const semanticResponse = await decisionRoute.POST(
    jsonRequest(`/api/projects/${PROJECT_ID}/script/decision`, {
      ...decisionBody(),
      decision: "changes_requested",
      note: null,
    }),
    context(),
  );
  assert.equal(semanticResponse.status, 422);
  assert.deepEqual(semantic.rpcCalls, []);
});

test("route sources contain no service fallback and proxy rules are exact and method-aware", () => {
  const routePaths = [
    "app/api/projects/[id]/script/route.ts",
    "app/api/projects/[id]/script/submit/route.ts",
    "app/api/projects/[id]/script/decision/route.ts",
  ];
  for (const routePath of routePaths) {
    const source = readFileSync(resolve(repositoryRoot, routePath), "utf8");
    assert.match(source, /requireStaffWithClient\(\)/);
    assert.doesNotMatch(
      source,
      /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|createServiceRole|createClient\(|getSupabase\(/i,
    );
  }

  const proxy = readFileSync(resolve(repositoryRoot, "proxy.ts"), "utf8");
  const broadPatterns = proxy.slice(
    proxy.indexOf("const ADMIN_API_ROUTE_PATTERNS"),
    proxy.indexOf("const ADMIN_API_ROUTE_RULES"),
  );
  assert.doesNotMatch(broadPatterns, /\/script/);
  assert.match(
    proxy,
    /`\^\/api\/projects\/\$\{UUID_PATH_SEGMENT\}\/script\$`\),\s*methods: \["GET", "POST"\]/,
  );
  assert.match(
    proxy,
    /`\^\/api\/projects\/\$\{UUID_PATH_SEGMENT\}\/script\/submit\$`,[\s\S]*?methods: \["POST"\]/,
  );
  assert.match(
    proxy,
    /`\^\/api\/projects\/\$\{UUID_PATH_SEGMENT\}\/script\/decision\$`,[\s\S]*?methods: \["POST"\]/,
  );
  assert.doesNotMatch(
    proxy,
    /\^\/api\/projects\/\$\{UUID_PATH_SEGMENT\}\/script\(\?:\/\|\$\)/,
  );
});
