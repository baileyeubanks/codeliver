import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    if (!globalThis.__ccoApprovalSupabase) {
      throw new Error("Approval test Supabase client was not installed");
    }
    return globalThis.__ccoApprovalSupabase;
  }
`)}`;

const versionsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function resolveAssetVersion({ assetId, versionId }) {
    if (!versionId) {
      return { ok: false, status: 400, error: "A media version is required" };
    }
    return {
      ok: true,
      version: { id: versionId, asset_id: assetId, is_current: true },
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier === "@/lib/versions") {
      return nextResolve(versionsStubUrl, context);
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

interface TeamRow {
  id: string;
  owner_id: string;
}

interface WebhookRow {
  id: string;
  team_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

interface AuthorityAsset {
  project_id: string;
  projects: { team_id: string | null; owner_id: string | null } | null;
}

interface QueryLog {
  table: string;
  operation: string;
  selection: string;
  filters: Array<{ column: string; value: unknown }>;
}

interface Scenario {
  authorityAsset: AuthorityAsset | null;
  teams: TeamRow[];
  webhooks: WebhookRow[];
  queries: QueryLog[];
  deliveries: Array<Record<string, unknown>>;
  rpcCalls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }>;
  failedWebhookIds: string[];
}

class FakeQuery {
  private operation = "select";
  private selection = "*";
  private filters: Array<{ column: string; value: unknown }> = [];
  private values: Record<string, unknown> | null = null;
  private rowLimit: number | null = null;
  private readonly scenario: Scenario;
  private readonly table: string;

  constructor(scenario: Scenario, table: string) {
    this.scenario = scenario;
    this.table = table;
  }

  select(selection = "*") {
    this.selection = selection;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order() {
    return this;
  }

  limit(limit: number) {
    this.rowLimit = limit;
    return this;
  }

  single() {
    return Promise.resolve(this.resolveResult());
  }

  maybeSingle() {
    return Promise.resolve(this.resolveResult());
  }

  then(onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
    return Promise.resolve(this.resolveResult()).then(onFulfilled, onRejected);
  }

  private filtered<T extends object>(rows: T[]): T[] {
    const filtered = rows.filter((row) =>
      this.filters.every(
        ({ column, value }) =>
          (row as Record<string, unknown>)[column] === value,
      ),
    );
    return this.rowLimit === null ? filtered : filtered.slice(0, this.rowLimit);
  }

  private resolveResult(): { data: unknown; error: null } {
    this.scenario.queries.push({
      table: this.table,
      operation: this.operation,
      selection: this.selection,
      filters: [...this.filters],
    });

    if (this.operation === "insert") {
      if (this.table === "webhook_deliveries" && this.values) {
        this.scenario.deliveries.push(this.values);
      }
      return { data: null, error: null };
    }

    if (this.table === "approvals") {
      if (this.operation === "update") {
        return {
          data: {
            id: "approval-a",
            asset_id: "asset-a",
            version_id: "version-current",
            workflow_id: "workflow-a",
            role_label: "Client approver",
            status: "approved",
            ...this.values,
          },
          error: null,
        };
      }

      if (this.selection === "status") {
        return {
          data: [{ status: "approved" }, { status: "pending" }],
          error: null,
        };
      }

      return {
        data: {
          id: "approval-a",
          asset_id: "asset-a",
          version_id: "version-current",
          workflow_id: "workflow-a",
          role_label: "Client approver",
          status: "pending",
        },
        error: null,
      };
    }

    if (this.table === "approval_workflows") {
      return {
        data: {
          id: "workflow-a",
          asset_id: "asset-a",
          version_id: "version-current",
          mode: "parallel",
          status: "active",
        },
        error: null,
      };
    }

    if (this.table === "assets") {
      if (this.selection.includes("projects(")) {
        return { data: this.scenario.authorityAsset, error: null };
      }
      return {
        data: {
          project_id: "project-a",
          title: "Tenant A campaign",
          status: "in_review",
        },
        error: null,
      };
    }

    if (this.table === "teams") {
      return { data: this.filtered(this.scenario.teams), error: null };
    }

    if (this.table === "webhooks") {
      return { data: this.filtered(this.scenario.webhooks), error: null };
    }

    return { data: null, error: null };
  }
}

class FakeSupabase {
  private readonly scenario: Scenario;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
  }

  from(table: string) {
    return new FakeQuery(this.scenario, table);
  }

  async rpc(functionName: string, parameters: Record<string, unknown>) {
    this.scenario.rpcCalls.push({ functionName, parameters });
    if (functionName !== "enqueue_webhook_delivery") {
      return { data: null, error: { code: "42883", message: "unknown rpc" } };
    }
    if (this.scenario.failedWebhookIds.includes(String(parameters.p_webhook_id))) {
      return {
        data: null,
        error: { code: "P0001", message: "synthetic endpoint queue failure" },
      };
    }
    return {
      data: {
        delivery_id: "44444444-4444-4444-8444-444444444444",
        webhook_id: parameters.p_webhook_id,
        expected_team_id: parameters.p_expected_team_id,
        event: parameters.p_event,
        idempotency_key: parameters.p_idempotency_key,
        payload: parameters.p_payload,
        payload_fingerprint: `sha256:${"4".repeat(64)}`,
        status: "queued",
        attempt_count: 0,
        max_attempts: parameters.p_max_attempts,
        available_at: parameters.p_available_at,
        lease_owner: null,
        lease_expires_at: null,
        lease_fence: 0,
        response_code: null,
        duration_ms: null,
        error_code: null,
        delivered_at: null,
        completed_at: null,
        replayed: false,
      },
      error: null,
    };
  }
}

type ApprovalTestGlobal = typeof globalThis & {
  __ccoApprovalSupabase?: FakeSupabase;
};

const state = globalThis as ApprovalTestGlobal;

function createScenario(
  overrides: Partial<
    Pick<Scenario, "authorityAsset" | "teams" | "webhooks" | "failedWebhookIds">
  > = {},
): Scenario {
  return {
    authorityAsset: {
      project_id: "project-a",
      projects: { team_id: "team-a", owner_id: "owner-a" },
    },
    teams: [{ id: "team-a", owner_id: "owner-a" }],
    webhooks: [],
    queries: [],
    deliveries: [],
    rpcCalls: [],
    failedWebhookIds: [],
    ...overrides,
  };
}

async function recordDecision(scenario: Scenario) {
  state.__ccoApprovalSupabase = new FakeSupabase(scenario);
  const { recordApprovalDecision } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/approval-decisions.ts")).href
  );
  const result = await recordApprovalDecision({
    assetId: "asset-a",
    versionId: "version-current",
    approvalId: "approval-a",
    status: "approved",
    actor: {
      id: "owner-b",
      name: "Tenant B reviewer",
    },
  });
  assert.equal(result.ok, true);
}

async function settleWebhookEmission() {
  await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
  await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
}

function installFetchRecorder(t: { after(callback: () => void): void }) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    state.__ccoApprovalSupabase = undefined;
  });

  return calls;
}

test("tenant A approval events never target tenant B webhooks or caller authority", async (t) => {
  const scenario = createScenario({
    teams: [
      { id: "team-a", owner_id: "owner-a" },
      { id: "team-b", owner_id: "owner-b" },
    ],
    webhooks: [
      {
        id: "hook-a",
        team_id: "team-a",
        url: "https://1.1.1.1/webhook",
        events: ["asset.approved"],
        secret: "secret-a",
        active: true,
      },
      {
        id: "hook-b",
        team_id: "team-b",
        url: "https://8.8.8.8/webhook",
        events: ["asset.approved"],
        secret: "secret-b",
        active: true,
      },
    ],
  });
  const fetchCalls = installFetchRecorder(t);

  await recordDecision(scenario);
  await settleWebhookEmission();

  assert.deepEqual(fetchCalls.map((call) => call.url), [
    "https://1.1.1.1/webhook",
  ]);
  assert.equal(scenario.deliveries.length, 1);
  assert.equal(scenario.deliveries[0].webhook_id, "hook-a");

  const webhookQuery = scenario.queries.find((query) => query.table === "webhooks");
  assert.ok(webhookQuery);
  assert.deepEqual(webhookQuery.filters, [
    { column: "team_id", value: "team-a" },
    { column: "active", value: true },
  ]);

  const headers = new Headers(fetchCalls[0].init?.headers);
  const timestamp = headers.get("X-Co-Production-Timestamp");
  const deliveryId = headers.get("X-Co-Production-Delivery-Id");
  const deliveryAttempt = headers.get("X-Co-Production-Delivery-Attempt");
  const body = String(fetchCalls[0].init?.body ?? "");
  assert.ok(timestamp);
  assert.ok(deliveryId);
  assert.equal(deliveryAttempt, "1");
  assert.equal(
    headers.get("X-Co-Production-Signature"),
    `v2=${createHmac("sha256", "secret-a")
      .update(`${timestamp}.${deliveryId}.${deliveryAttempt}.${body}`, "utf8")
      .digest("hex")}`,
  );
  assert.notEqual(headers.get("X-CoDeliver-Signature"), "secret-a");
  assert.equal(headers.get("X-CoDeliver-Event"), "asset.approved");
});

test("inactive hooks in the owning tenant are skipped", async (t) => {
  const scenario = createScenario({
    webhooks: [
      {
        id: "hook-a-inactive",
        team_id: "team-a",
        url: "https://1.0.0.1/inactive",
        events: [],
        secret: "inactive-secret",
        active: false,
      },
    ],
  });
  const fetchCalls = installFetchRecorder(t);

  await recordDecision(scenario);
  await settleWebhookEmission();

  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(scenario.deliveries, []);
});

test("managed approval emissions enqueue durably before any network delivery", async (t) => {
  const originalServerSchema = process.env.SUPABASE_DATA_SCHEMA;
  const originalBrowserSchema = process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA;
  process.env.SUPABASE_DATA_SCHEMA = "co_production";
  process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA = "co_production";
  t.after(() => {
    if (originalServerSchema === undefined) delete process.env.SUPABASE_DATA_SCHEMA;
    else process.env.SUPABASE_DATA_SCHEMA = originalServerSchema;
    if (originalBrowserSchema === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA = originalBrowserSchema;
    }
  });

  const webhookId = "33333333-3333-4333-8333-333333333333";
  const teamId = "22222222-2222-4222-8222-222222222222";
  const scenario = createScenario({
    authorityAsset: {
      project_id: "project-a",
      projects: { team_id: teamId, owner_id: "owner-a" },
    },
    webhooks: [
      {
        id: webhookId,
        team_id: teamId,
        url: "https://1.1.1.1/webhook",
        events: ["asset.approved"],
        secret: "secret-a",
        active: true,
      },
    ],
  });
  const fetchCalls = installFetchRecorder(t);

  await recordDecision(scenario);
  await settleWebhookEmission();

  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(scenario.deliveries, []);
  assert.equal(scenario.rpcCalls.length, 1);
  assert.equal(
    scenario.rpcCalls[0].functionName,
    "enqueue_webhook_delivery",
  );
  assert.equal(scenario.rpcCalls[0].parameters.p_webhook_id, webhookId);
  assert.equal(scenario.rpcCalls[0].parameters.p_expected_team_id, teamId);
  assert.match(
    String(scenario.rpcCalls[0].parameters.p_idempotency_key),
    /^approval:approval-a:approved:asset\.approved:/,
  );
  assert.equal(
    scenario.queries.some((query) => query.table === "teams"),
    false,
  );
  const authorityQuery = scenario.queries.find(
    (query) => query.table === "assets" && query.selection.includes("projects("),
  );
  assert.match(authorityQuery?.selection ?? "", /projects\(team_id, owner_id\)/);
});

test("one managed endpoint queue failure does not suppress sibling endpoints", async (t) => {
  const originalServerSchema = process.env.SUPABASE_DATA_SCHEMA;
  const originalBrowserSchema = process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA;
  process.env.SUPABASE_DATA_SCHEMA = "co_production";
  process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA = "co_production";
  t.after(() => {
    if (originalServerSchema === undefined) delete process.env.SUPABASE_DATA_SCHEMA;
    else process.env.SUPABASE_DATA_SCHEMA = originalServerSchema;
    if (originalBrowserSchema === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA = originalBrowserSchema;
    }
  });

  const teamId = "22222222-2222-4222-8222-222222222222";
  const failedWebhookId = "33333333-3333-4333-8333-333333333333";
  const healthyWebhookId = "55555555-5555-4555-8555-555555555555";
  const scenario = createScenario({
    authorityAsset: {
      project_id: "project-a",
      projects: { team_id: teamId, owner_id: "owner-a" },
    },
    webhooks: [
      {
        id: failedWebhookId,
        team_id: teamId,
        url: "https://1.1.1.1/failed",
        events: ["asset.approved"],
        secret: "secret-a",
        active: true,
      },
      {
        id: healthyWebhookId,
        team_id: teamId,
        url: "https://1.0.0.1/healthy",
        events: ["asset.approved"],
        secret: "secret-b",
        active: true,
      },
    ],
    failedWebhookIds: [failedWebhookId],
  });
  const fetchCalls = installFetchRecorder(t);
  const originalConsoleError = console.error;
  const queueErrors: unknown[][] = [];
  console.error = (...arguments_) => queueErrors.push(arguments_);
  t.after(() => {
    console.error = originalConsoleError;
  });

  await recordDecision(scenario);

  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(
    scenario.rpcCalls.map((call) => call.parameters.p_webhook_id),
    [failedWebhookId, healthyWebhookId],
  );
  assert.equal(queueErrors.length, 1);
  assert.equal(queueErrors[0][1], failedWebhookId);
});

test("missing project ownership yields zero webhook deliveries", async (t) => {
  const scenario = createScenario({
    authorityAsset: {
      project_id: "project-a",
      projects: null,
    },
    webhooks: [
      {
        id: "hook-a",
        team_id: "team-a",
        url: "https://1.1.1.1/webhook",
        events: [],
        secret: "secret-a",
        active: true,
      },
    ],
  });
  const fetchCalls = installFetchRecorder(t);

  await recordDecision(scenario);
  await settleWebhookEmission();

  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(scenario.deliveries, []);
  assert.equal(
    scenario.queries.some((query) => query.table === "webhooks"),
    false,
  );
});

test("ambiguous owner-to-team authority fails closed", async (t) => {
  const scenario = createScenario({
    teams: [
      { id: "team-a-1", owner_id: "owner-a" },
      { id: "team-a-2", owner_id: "owner-a" },
    ],
    webhooks: [
      {
        id: "hook-a-1",
        team_id: "team-a-1",
        url: "https://1.1.1.1/one",
        events: [],
        secret: "secret-a-1",
        active: true,
      },
      {
        id: "hook-a-2",
        team_id: "team-a-2",
        url: "https://1.0.0.1/two",
        events: [],
        secret: "secret-a-2",
        active: true,
      },
    ],
  });
  const fetchCalls = installFetchRecorder(t);

  await recordDecision(scenario);
  await settleWebhookEmission();

  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(scenario.deliveries, []);
  assert.equal(
    scenario.queries.some((query) => query.table === "webhooks"),
    false,
  );
});
