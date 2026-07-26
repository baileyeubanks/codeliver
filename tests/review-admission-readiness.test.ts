import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectDependencySnapshot } from "../app/api/health/_lib/checks.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const baseProductionEnv = {
  NODE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_KEY: "server-secret",
  SUPABASE_DATA_SCHEMA: "co_production",
  NEXT_PUBLIC_SUPABASE_DATA_SCHEMA: "co_production",
  CODELIVER_STORAGE_PROVIDER: "local",
  CODELIVER_LOCAL_STORAGE_ROOT: "/tmp/codeliver-media",
  CODELIVER_STORAGE_WRITE_ENABLED: "true",
  CODELIVER_HEALTH_REMOTE_PROBES: "true",
  RESEND_API_KEY: "email-secret",
  CO_PRODUCTION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString(
    "base64url",
  ),
  CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(
    32,
    2,
  ).toString("base64url"),
  CO_PRODUCTION_ANALYTICS_HASH_KEY: Buffer.alloc(32, 3).toString(
    "base64url",
  ),
};

const probes = {
  fetchProbe: async () => ({ ok: true, status: 200 }),
  accessProbe: async () => undefined,
};

test("production readiness requires valid review signing and trusted-ingress configuration without exposing it", async () => {
  const signingKey = Buffer.alloc(32, 4).toString("base64url");
  const ready = await collectDependencySnapshot({
    env: {
      ...baseProductionEnv,
      CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY: signingKey,
      CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS: "",
      CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER:
        "cf-connecting-ip",
    },
    ...probes,
  });
  assert.equal(
    ready.checks.find(
      (check) => check.id === "review-admission-authority",
    )?.status,
    "pass",
  );
  assert.equal(JSON.stringify(ready).includes(signingKey), false);

  const unsupportedIngress = await collectDependencySnapshot({
    env: {
      ...baseProductionEnv,
      CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY: signingKey,
      CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER:
        "x-forwarded-for",
    },
    ...probes,
  });
  assert.equal(unsupportedIngress.ready, false);
  assert.equal(
    unsupportedIngress.checks.find(
      (check) => check.id === "review-admission-authority",
    )?.status,
    "fail",
  );
});

test("the example environment documents names and shapes, never review admission key material", () => {
  const example = readFileSync(resolve(repositoryRoot, ".env.example"), "utf8");
  assert.match(
    example,
    /^CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY=$/m,
  );
  assert.match(
    example,
    /^CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS=$/m,
  );
  assert.match(
    example,
    /^CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER=$/m,
  );
});
