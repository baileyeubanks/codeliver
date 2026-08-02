import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    const state = globalThis.__notificationOutboxRouteState;
    return { user: state.user, supabase: state.client };
  }
`)}`;

const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const CO_PRODUCTION_DATA_SCHEMA = "co_production";
  export function getSupabaseDataSchema() { return "co_production"; }
`)}`;

const adapterStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createInAppNotificationAdapter() {
    globalThis.__notificationOutboxRouteState.adapterCalls += 1;
    throw new Error("Production notification routes must not create direct adapters");
  }
  export function getExternalNotificationAdapters() {
    globalThis.__notificationOutboxRouteState.externalAdapterCalls += 1;
    throw new Error("Production notification routes must not load external providers");
  }
`)}`;

const deliveryStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function dispatchAuditedNotification() {
    globalThis.__notificationOutboxRouteState.directDispatchCalls += 1;
    throw new Error("Production notification routes must use the outbox");
  }
`)}`;

const transactionalStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function dispatchDurableNotification(input) {
    const state = globalThis.__notificationOutboxRouteState;
    state.durableCalls.push(input);
    return state.result;
  }
  export function isNotificationQueueFailure(result) {
    return result?.ok === false && result.code === "notification_queue_unavailable";
  }
`)}`;

const tenantStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function tenantAuthorityKey(kind, id) { return kind + ":" + id; }
`)}`;

const emailStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getBaseUrl() { return "https://co-videopro.com"; }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/data-authority") {
      return nextResolve(dataAuthorityStubUrl, context);
    }
    if (specifier === "@/lib/notifications/adapters") {
      return nextResolve(adapterStubUrl, context);
    }
    if (specifier === "@/lib/notifications/server-delivery") {
      return nextResolve(deliveryStubUrl, context);
    }
    if (specifier === "@/lib/notifications/transactional") {
      return nextResolve(transactionalStubUrl, context);
    }
    if (specifier === "@/lib/tenant-authority") {
      return nextResolve(tenantStubUrl, context);
    }
    if (specifier === "@/lib/email") return nextResolve(emailStubUrl, context);
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

interface RouteState {
  user: { id: string; email: string };
  client: {
    from(table: string): {
      select(): unknown;
      eq(): unknown;
      limit(): unknown;
      maybeSingle(): Promise<{ data: Record<string, unknown>; error: null }>;
    };
  };
  result: Record<string, unknown>;
  durableCalls: Array<Record<string, unknown>>;
  adapterCalls: number;
  externalAdapterCalls: number;
  directDispatchCalls: number;
}

const state: RouteState = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "producer@example.test",
  },
  client: undefined as never,
  result: {},
  durableCalls: [],
  adapterCalls: 0,
  externalAdapterCalls: 0,
  directDispatchCalls: 0,
};

state.client = {
  from(table: string) {
    assert.equal(table, "notification_preferences");
    const query = {
      select() { return query; },
      eq() { return query; },
      limit() { return query; },
      async maybeSingle() {
        return {
          data: {
            email_enabled: true,
            email_frequency: "instant",
            in_app_enabled: true,
          },
          error: null,
        };
      },
    };
    return query;
  },
};

(globalThis as typeof globalThis & {
  __notificationOutboxRouteState: RouteState;
}).__notificationOutboxRouteState = state;

const route = await import(
  pathToFileURL(resolve(repositoryRoot, "app/api/notifications/send/route.ts")).href
);

function request() {
  return new Request("https://co-videopro.com/api/notifications/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "send",
      tenant_id: "caller-controlled",
      event_type: "comment_added",
      purpose: "transactional",
      channels: ["email"],
      recipient: {
        user_id: state.user.id,
        email: state.user.email,
      },
      message: {
        title: "New comment",
        body: "A comment is ready.",
        action_url: "/projects/project-a",
      },
      confirm_live_send: true,
      idempotency_key: "notification-event-0001",
    }),
  });
}

test.beforeEach(() => {
  state.durableCalls = [];
  state.adapterCalls = 0;
  state.externalAdapterCalls = 0;
  state.directDispatchCalls = 0;
});

test("co-production capabilities expose the queue without loading providers", async () => {
  const response = await route.GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.channels, [
    {
      channel: "in_app",
      provider: "supabase-notifications",
      configured: true,
    },
    { channel: "email", provider: "durable-outbox", configured: true },
    { channel: "sms", provider: "durable-outbox", configured: false },
    { channel: "imessage", provider: "durable-outbox", configured: false },
  ]);
  assert.equal(state.adapterCalls, 0);
  assert.equal(state.externalAdapterCalls, 0);
});

test("co-production send accepts durable queue authority without touching a provider", async () => {
  state.result = {
    ok: true,
    mode: "queued",
    deduplicated: false,
    receipts: [{ channel: "email", status: "queued" }],
    audit: { status: "outbox_recorded", outbox_ids: ["outbox-a"] },
  };

  const response = await route.POST(request());
  assert.equal(response.status, 202);
  assert.equal((await response.json()).mode, "queued");
  assert.equal(state.durableCalls.length, 1);
  const durable = state.durableCalls[0] as {
    request: { tenantId: string; idempotencyKey: string };
    client: unknown;
  };
  assert.equal(durable.client, state.client);
  assert.equal(durable.request.tenantId, `personal:${state.user.id}`);
  assert.equal(durable.request.idempotencyKey, "notification-event-0001");
  assert.equal(state.adapterCalls, 0);
  assert.equal(state.externalAdapterCalls, 0);
  assert.equal(state.directDispatchCalls, 0);
});

test("co-production send returns one redacted 503 when queue authority fails", async () => {
  state.result = {
    ok: false,
    status: 503,
    code: "notification_queue_unavailable",
    error:
      "Notification queue authority is unavailable; no external notification was sent",
  };

  const response = await route.POST(request());
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.match(body, /notification_queue_unavailable/);
  assert.doesNotMatch(body, /producer@example\.test|caller-controlled|database|policy/i);
  assert.equal(state.externalAdapterCalls, 0);
  assert.equal(state.directDispatchCalls, 0);
});
