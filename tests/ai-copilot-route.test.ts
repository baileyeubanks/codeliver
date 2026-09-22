import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = resolve(repositoryRoot, "app/api/ai/copilot/route.ts");
const helperPath = resolve(repositoryRoot, "lib/ai/copilot.ts");

const projectId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const commentId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";

type AccessResult =
  | { ok: true; data: { id: string; name: string } }
  | { ok: false; status: number; error: string };

type ProviderCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

type CopilotState = typeof globalThis & {
  __ccoCopilotAuth: () => Promise<Record<string, unknown> | null>;
  __ccoCopilotRole: (user: Record<string, unknown>) => "staff" | "client" | null;
  __ccoCopilotAccess: (...args: unknown[]) => Promise<AccessResult>;
  __ccoCopilotAccessCalls: unknown[][];
  __ccoCopilotSupabase: FakeSupabase;
  __ccoCopilotProviderCalls: ProviderCall[];
  __ccoCopilotProvider: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
};

const state = globalThis as CopilotState;

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const authStub = dataModule(`
  export async function requireAuth() {
    return globalThis.__ccoCopilotAuth();
  }
`);
const roleStub = dataModule(`
  export function resolveTrustedSurfaceRole(user) {
    return globalThis.__ccoCopilotRole(user);
  }
`);
const accessStub = dataModule(`
  export async function getProjectAccess(...args) {
    globalThis.__ccoCopilotAccessCalls.push(args);
    return globalThis.__ccoCopilotAccess(...args);
  }
`);
const supabaseStub = dataModule(`
  export function getSupabase() {
    return globalThis.__ccoCopilotSupabase;
  }
`);
const responsesStub = dataModule(`
  export function apiJson(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(body), { ...init, headers });
  }
  export function apiError(error, code, status, headers) {
    return apiJson({ error, code }, { status, headers });
  }
  export function backendUnavailable() {
    return apiError("Backend service is unavailable", "BACKEND_UNAVAILABLE", 503);
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/auth") return nextResolve(authStub, context);
    if (specifier === "@/lib/auth/host-surface") return nextResolve(roleStub, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStub, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStub, context);
    if (specifier === "@/lib/api/responses") return nextResolve(responsesStub, context);
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

type Row = Record<string, unknown>;

class FakeQuery {
  private readonly equality = new Map<string, unknown>();
  private readonly inclusion = new Map<string, unknown[]>();
  private readonly nullity = new Map<string, unknown>();
  private readonly database: FakeSupabase;
  private readonly table: string;
  private rowLimit: number | null = null;

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select(columns: string) {
    this.database.reads.push({ table: this.table, columns });
    return this;
  }

  eq(column: string, value: unknown) {
    this.equality.set(column, value);
    return this;
  }

  in(column: string, value: unknown[]) {
    this.inclusion.set(column, value);
    return this;
  }

  is(column: string, value: unknown) {
    this.nullity.set(column, value);
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  async maybeSingle() {
    const rows = this.rows();
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }

  private rows() {
    const source = this.database.tables[this.table] ?? [];
    const filtered = source.filter((row) => {
      for (const [column, value] of this.equality) {
        if (row[column] !== value) return false;
      }
      for (const [column, values] of this.inclusion) {
        if (!values.includes(row[column])) return false;
      }
      for (const [column, value] of this.nullity) {
        if (row[column] !== value) return false;
      }
      return true;
    });
    return this.rowLimit === null ? filtered : filtered.slice(0, this.rowLimit);
  }
}

class FakeSupabase {
  readonly reads: Array<{ table: string; columns: string }> = [];
  readonly writes: string[] = [];
  readonly tables: Record<string, Row[]>;

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  insert() {
    this.writes.push("insert");
    throw new Error("Copilot must not write");
  }

  update() {
    this.writes.push("update");
    throw new Error("Copilot must not write");
  }

  delete() {
    this.writes.push("delete");
    throw new Error("Copilot must not write");
  }

  rpc() {
    this.writes.push("rpc");
    throw new Error("Copilot must not reserve or mutate");
  }
}

function fixtureSupabase() {
  return new FakeSupabase({
    projects: [
      {
        id: projectId,
        name: "Schneider water story",
        description: "A factual production edit.",
        status: "active",
        updated_at: "2026-09-21T12:00:00.000Z",
      },
    ],
    assets: [
      {
        id: assetId,
        project_id: projectId,
        title: "Interview assembly",
        file_type: "video",
        status: "in_review",
        duration_seconds: 93,
        deleted_at: null,
        updated_at: "2026-09-21T12:00:00.000Z",
      },
    ],
    comments: [
      {
        id: commentId,
        asset_id: assetId,
        body: "Please tighten the opening.",
        status: "open",
        timecode_seconds: 8.2,
        created_at: "2026-09-21T12:00:00.000Z",
      },
    ],
  });
}

function jsonRequest(body: unknown) {
  return new Request("http://test/api/ai/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setEnv(name: string, value: string | undefined) {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
}

function installState(
  t: { after(callback: () => void): void },
  overrides: Partial<{
    auth: () => Promise<Record<string, unknown> | null>;
    role: (user: Record<string, unknown>) => "staff" | "client" | null;
    access: (...args: unknown[]) => Promise<AccessResult>;
    provider: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    supabase: FakeSupabase;
    openAiKey: string | undefined;
    openAiModel: string | undefined;
  }> = {},
) {
  state.__ccoCopilotAuth = overrides.auth ?? (async () => ({
    id: userId,
    app_metadata: { content_coop_role: "staff" },
  }));
  state.__ccoCopilotRole = overrides.role ?? (() => "staff");
  state.__ccoCopilotAccess = overrides.access ?? (async () => ({
    ok: true,
    data: { id: projectId, name: "Schneider water story" },
  }));
  state.__ccoCopilotAccessCalls = [];
  state.__ccoCopilotSupabase = overrides.supabase ?? fixtureSupabase();
  state.__ccoCopilotProviderCalls = [];
  state.__ccoCopilotProvider = overrides.provider ?? (async () => new Response(JSON.stringify({
    model: "gpt-test-actual",
    output: [{
      type: "message",
      role: "assistant",
      content: [{
        type: "output_text",
        text: `The opening is the current concern. [[source:${assetId}]]`,
      }],
    }],
  }), { status: 200, headers: { "Content-Type": "application/json" } }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    state.__ccoCopilotProviderCalls.push({ input, init });
    return state.__ccoCopilotProvider(input, init);
  };

  const restoreKey = setEnv(
    "OPENAI_API_KEY",
    Object.hasOwn(overrides, "openAiKey") ? overrides.openAiKey : "test-openai-key",
  );
  const restoreModel = setEnv(
    "OPENAI_MODEL",
    Object.hasOwn(overrides, "openAiModel") ? overrides.openAiModel : "gpt-test-configured",
  );
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreKey();
    restoreModel();
    delete (state as Partial<CopilotState>).__ccoCopilotAuth;
    delete (state as Partial<CopilotState>).__ccoCopilotRole;
    delete (state as Partial<CopilotState>).__ccoCopilotAccess;
    delete (state as Partial<CopilotState>).__ccoCopilotAccessCalls;
    delete (state as Partial<CopilotState>).__ccoCopilotSupabase;
    delete (state as Partial<CopilotState>).__ccoCopilotProviderCalls;
    delete (state as Partial<CopilotState>).__ccoCopilotProvider;
  });
}

let routePromise: Promise<{ POST: (request: Request) => Promise<Response> } | null> | undefined;

function copilotRoute() {
  routePromise ??= existsSync(routePath)
    ? import(pathToFileURL(routePath).href)
    : Promise.resolve(null);
  return routePromise;
}

async function requireRoute() {
  const route = await copilotRoute();
  assert.ok(route, "Copilot route is not implemented");
  return route;
}

test("Copilot rejects unauthenticated requests before access, context, or provider work", async (t) => {
  installState(t, { auth: async () => null });
  const route = await requireRoute();
  const response = await route.POST(jsonRequest({ project_id: projectId, prompt: "What needs attention?" }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication is required", code: "UNAUTHENTICATED" });
  assert.equal(state.__ccoCopilotAccessCalls.length, 0);
  assert.equal(state.__ccoCopilotSupabase.reads.length, 0);
  assert.equal(state.__ccoCopilotProviderCalls.length, 0);
});

test("Copilot denies non-staff accounts before project or provider work", async (t) => {
  installState(t, { role: () => "client" });
  const route = await requireRoute();
  const response = await route.POST(jsonRequest({ project_id: projectId, prompt: "What needs attention?" }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Staff access is required", code: "FORBIDDEN" });
  assert.equal(state.__ccoCopilotAccessCalls.length, 0);
  assert.equal(state.__ccoCopilotSupabase.reads.length, 0);
  assert.equal(state.__ccoCopilotProviderCalls.length, 0);
});

test("Copilot hides an inaccessible project before context or provider work", async (t) => {
  installState(t, {
    access: async () => ({ ok: false, status: 404, error: "Project not found" }),
  });
  const route = await requireRoute();
  const response = await route.POST(jsonRequest({ project_id: projectId, prompt: "What needs attention?" }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Project access is denied", code: "FORBIDDEN" });
  assert.equal(state.__ccoCopilotAccessCalls.length, 1);
  assert.equal(state.__ccoCopilotSupabase.reads.length, 0);
  assert.equal(state.__ccoCopilotProviderCalls.length, 0);
});

test("Copilot returns a configuration error without reading context or calling the provider", async (t) => {
  installState(t, { openAiKey: undefined });
  const route = await requireRoute();
  const response = await route.POST(jsonRequest({ project_id: projectId, prompt: "What needs attention?" }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "OpenAI is not configured", code: "NOT_CONFIGURED" });
  assert.equal(state.__ccoCopilotAccessCalls.length, 1);
  assert.equal(state.__ccoCopilotSupabase.reads.length, 0);
  assert.equal(state.__ccoCopilotProviderCalls.length, 0);
});

test("Copilot rejects invalid client input without reading context or calling the provider", async (t) => {
  installState(t);
  const route = await requireRoute();
  const response = await route.POST(jsonRequest({
    project_id: projectId,
    prompt: "",
    workspace_context: { ignore: "this must never reach the model" },
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "prompt is required", code: "INVALID_REQUEST" });
  assert.equal(state.__ccoCopilotAccessCalls.length, 0);
  assert.equal(state.__ccoCopilotSupabase.reads.length, 0);
  assert.equal(state.__ccoCopilotProviderCalls.length, 0);
});

test("Copilot sends bounded server-derived context to Responses and returns only cited server source IDs", async (t) => {
  installState(t);
  const route = await requireRoute();
  const response = await route.POST(jsonRequest({
    project_id: projectId,
    prompt: "What is the next editing priority?",
    history: [{ role: "assistant", content: "Keep it concise." }],
    workspace_context: { forged: "do not include this" },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: `The opening is the current concern. [[source:${assetId}]]`,
    model: "gpt-test-actual",
    sources: [{ id: assetId, type: "asset", label: "Interview assembly" }],
    read_only: true,
  });
  assert.deepEqual(state.__ccoCopilotSupabase.reads.map((read) => read.table), ["projects", "assets", "comments"]);
  assert.deepEqual(state.__ccoCopilotSupabase.writes, []);
  assert.equal(state.__ccoCopilotProviderCalls.length, 1);

  const providerCall = state.__ccoCopilotProviderCalls[0];
  assert.equal(String(providerCall.input), "https://api.openai.com/v1/responses");
  assert.equal(new Headers(providerCall.init?.headers).get("authorization"), "Bearer test-openai-key");
  const providerBody = JSON.parse(String(providerCall.init?.body));
  assert.equal(providerBody.model, "gpt-test-configured");
  assert.equal(providerBody.store, false);
  assert.deepEqual(providerBody.tools, []);
  assert.equal(providerBody.parallel_tool_calls, false);
  assert.ok(providerBody.max_output_tokens > 0 && providerBody.max_output_tokens <= 800);
  assert.equal(providerBody.input.length, 2);
  assert.equal(providerBody.input[0].role, "user");
  assert.match(providerBody.input[0].content, /UNTRUSTED CONVERSATION HISTORY/);
  assert.match(providerBody.input[0].content, /"role":"assistant"/);
  assert.match(providerBody.input[0].content, /Keep it concise\./);
  assert.match(providerBody.instructions, /untrusted data/i);
  assert.doesNotMatch(JSON.stringify(providerBody), /forged|workspace_context/);
});

test("Copilot rejects provider output that claims an unprovided source", async (t) => {
  installState(t, {
    provider: async () => new Response(JSON.stringify({
      model: "gpt-test-actual",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Trust me. [[source:unprovided]]" }],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }),
  });
  const route = await requireRoute();
  const response = await route.POST(jsonRequest({ project_id: projectId, prompt: "What needs attention?" }));

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "OpenAI returned an invalid response", code: "PROVIDER_UNAVAILABLE" });
  assert.equal(state.__ccoCopilotProviderCalls.length, 1);
});

test("Copilot helper requires both explicit OpenAI configuration values", async () => {
  if (!existsSync(helperPath)) {
    assert.fail("Copilot helper is not implemented");
  }
  const helper = await import(pathToFileURL(helperPath).href);
  assert.equal(helper.resolveCopilotConfig({ OPENAI_API_KEY: "key", OPENAI_MODEL: "model" }).ok, true);
  assert.equal(helper.resolveCopilotConfig({ OPENAI_API_KEY: "key" }).ok, false);
  assert.equal(helper.resolveCopilotConfig({ OPENAI_MODEL: "model" }).ok, false);
});

test("Copilot preserves the bounded eight-message, 2,000-character history contract", async () => {
  if (!existsSync(helperPath)) {
    assert.fail("Copilot helper is not implemented");
  }
  const helper = await import(pathToFileURL(helperPath).href);
  const request = {
    project_id: projectId,
    prompt: "p".repeat(4_000),
    history: Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: "h".repeat(2_000),
    })),
  };

  assert.ok(
    new TextEncoder().encode(JSON.stringify(request)).byteLength <= helper.COPILOT_MAX_REQUEST_BYTES,
  );
  assert.equal(helper.normalizeCopilotRequest(request).ok, true);
  assert.equal(helper.normalizeCopilotRequest({
    ...request,
    history: [{ role: "user", content: "h".repeat(2_001) }],
  }).ok, false);

  const normalizedProjectId = helper.normalizeCopilotRequest({
    project_id: projectId.toUpperCase(),
    prompt: "What is next?",
  });
  assert.equal(normalizedProjectId.ok, true);
  if (normalizedProjectId.ok) {
    assert.equal(normalizedProjectId.value.projectId, projectId);
  }
});

test("Copilot rate limiting is keyed to the authenticated user", async () => {
  if (!existsSync(helperPath)) {
    assert.fail("Copilot helper is not implemented");
  }
  const helper = await import(pathToFileURL(helperPath).href);
  const rateKey = `authenticated-user-${Date.now()}-${Math.random()}`;
  const now = Date.now();

  for (let attempt = 0; attempt < helper.COPILOT_RATE_LIMIT; attempt += 1) {
    assert.equal(helper.reserveCopilotRateLimit(rateKey, now).allowed, true);
  }
  const denied = helper.reserveCopilotRateLimit(rateKey, now);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds > 0);
});
