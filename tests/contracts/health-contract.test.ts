import assert from "node:assert/strict";
import test from "node:test";

import { collectDependencySnapshot } from "../../app/api/health/_lib/checks.ts";

const configuredEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_KEY: "server-secret",
  CODELIVER_STORAGE_PROVIDER: "local",
  CODELIVER_LOCAL_STORAGE_ROOT: "/tmp/codeliver-media",
  CODELIVER_STORAGE_WRITE_ENABLED: "true",
  CODELIVER_HEALTH_REMOTE_PROBES: "true",
  RESEND_API_KEY: "email-secret",
};

test("readiness passes only when required database and storage probes pass", async () => {
  const snapshot = await collectDependencySnapshot({
    env: configuredEnv,
    fetchProbe: async () => ({ ok: true, status: 200 }),
    accessProbe: async () => undefined,
  });
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.status, "healthy");
  assert.deepEqual(snapshot.checks.map((check) => check.status), [
    "pass",
    "pass",
    "pass",
    "pass",
  ]);
});

test("missing required configuration fails readiness without leaking secret values", async () => {
  const snapshot = await collectDependencySnapshot({ env: {} });
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.status, "unhealthy");
  assert.equal(JSON.stringify(snapshot).includes("server-secret"), false);
});

test("storage access failure is a required dependency failure", async () => {
  const snapshot = await collectDependencySnapshot({
    env: configuredEnv,
    fetchProbe: async () => ({ ok: true, status: 200 }),
    accessProbe: async () => {
      throw new Error("permission denied");
    },
  });
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.checks.find((check) => check.id === "storage")?.status, "fail");
  assert.equal(JSON.stringify(snapshot).includes("permission denied"), false);
});

test("optional notification configuration degrades but does not fail readiness", async () => {
  const snapshot = await collectDependencySnapshot({
    env: { ...configuredEnv, RESEND_API_KEY: undefined },
    fetchProbe: async () => ({ ok: true, status: 200 }),
    accessProbe: async () => undefined,
  });
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.checks.find((check) => check.id === "notifications")?.status, "warn");
});

test("disabling a required remote probe fails closed", async () => {
  const snapshot = await collectDependencySnapshot({
    env: { ...configuredEnv, CODELIVER_HEALTH_REMOTE_PROBES: "false" },
    accessProbe: async () => undefined,
  });
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.checks.find((check) => check.id === "database")?.status, "fail");
  assert.match(snapshot.checks.find((check) => check.id === "database")?.message ?? "", /not proven/);
});

test("a database probe that ignores abort signals is still bounded and redacted", async () => {
  const started = Date.now();
  const snapshot = await collectDependencySnapshot({
    env: configuredEnv,
    remoteProbeTimeoutMs: 25,
    fetchProbe: async () => new Promise<never>(() => undefined),
    accessProbe: async () => undefined,
  });
  assert.ok(Date.now() - started < 1_000);
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.checks.find((check) => check.id === "database")?.message, "Data plane probe timed out");
  assert.equal(JSON.stringify(snapshot).includes(configuredEnv.SUPABASE_SERVICE_KEY), false);
});

test("a stalled storage mount is bounded and fails readiness", async () => {
  const started = Date.now();
  const snapshot = await collectDependencySnapshot({
    env: configuredEnv,
    remoteProbeTimeoutMs: 25,
    fetchProbe: async () => ({ ok: true, status: 200 }),
    accessProbe: async () => new Promise<never>(() => undefined),
  });
  assert.ok(Date.now() - started < 1_000);
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.checks.find((check) => check.id === "storage")?.message, "Storage access probe timed out");
});

test("production readiness requires isolated credential and analytics privacy keys", async () => {
  const productionEnv = {
    ...configuredEnv,
    NODE_ENV: "production",
    SUPABASE_DATA_SCHEMA: "co_production",
    NEXT_PUBLIC_SUPABASE_DATA_SCHEMA: "co_production",
  };
  const missingKeys = await collectDependencySnapshot({
    env: productionEnv,
    fetchProbe: async () => ({ ok: true, status: 200 }),
    accessProbe: async () => undefined,
  });
  assert.equal(missingKeys.ready, false);
  assert.equal(
    missingKeys.checks.find((check) => check.id === "credential-encryption")?.status,
    "fail",
  );

  const ready = await collectDependencySnapshot({
    env: {
      ...productionEnv,
      CO_PRODUCTION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64url"),
      CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString(
        "base64url",
      ),
      CO_PRODUCTION_ANALYTICS_HASH_KEY: Buffer.alloc(32, 5).toString(
        "base64url",
      ),
    },
    fetchProbe: async () => ({ ok: true, status: 200 }),
    accessProbe: async () => undefined,
  });
  assert.equal(ready.ready, true);
  assert.equal(
    ready.checks.find((check) => check.id === "credential-encryption")?.status,
    "pass",
  );
});
