import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ADMIN_PRODUCTION_ORIGIN,
  buildSurfaceUrl,
  CLIENT_PRODUCTION_ORIGIN,
  DEFAULT_LOCAL_ORIGIN,
  getBrowserClientSiteUrl,
  normalizeSurfaceOrigin,
  resolveSurfaceOrigin,
  toDemoSiteUrl,
} from "../lib/surface-origins.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
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

const MANAGED_ENV_KEYS = [
  "NODE_ENV",
  "PORT",
  "ADMIN_SITE_URL",
  "NEXT_PUBLIC_ADMIN_SITE_URL",
  "CLIENT_SITE_URL",
  "NEXT_PUBLIC_CLIENT_SITE_URL",
] as const;

async function withSurfaceEnvironment(
  values: Partial<Record<(typeof MANAGED_ENV_KEYS)[number], string>>,
  run: () => void | Promise<void>,
) {
  const previous = new Map(
    MANAGED_ENV_KEYS.map((key) => [key, process.env[key]] as const),
  );

  for (const key of MANAGED_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const key of MANAGED_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("origin normalization accepts only origin-only HTTP(S) values", () => {
  assert.equal(
    normalizeSurfaceOrigin("  https://CLIENT.contentco-op.com:443/  ", "CLIENT_SITE_URL"),
    CLIENT_PRODUCTION_ORIGIN,
  );
  assert.equal(
    normalizeSurfaceOrigin("http://127.0.0.1:4103/", "CLIENT_SITE_URL"),
    "http://127.0.0.1:4103",
  );

  for (const value of [
    "client.contentco-op.com",
    "//client.contentco-op.com",
    "ftp://client.contentco-op.com",
    "http://client.contentco-op.com",
    "https://user:password@client.contentco-op.com",
    "https://client.contentco-op.com/review/token",
    "https://client.contentco-op.com?next=https://attacker.test",
    "https://client.contentco-op.com#review",
    "https://client.contentco-op.com.",
    "https://client.contentco-op.com\\@attacker.test",
  ]) {
    assert.throws(
      () => normalizeSurfaceOrigin(value, "CLIENT_SITE_URL"),
      undefined,
      value,
    );
  }
});

test("production origins are canonical and unsafe configuration fails closed", () => {
  assert.equal(
    resolveSurfaceOrigin({ surface: "admin", environment: "production" }),
    ADMIN_PRODUCTION_ORIGIN,
  );
  assert.equal(
    resolveSurfaceOrigin({ surface: "client", environment: "production" }),
    CLIENT_PRODUCTION_ORIGIN,
  );

  for (const value of [
    ADMIN_PRODUCTION_ORIGIN,
    "https://deliver.contentco-op.com",
    "https://attacker.test",
    "http://localhost:4103",
  ]) {
    assert.throws(
      () =>
        resolveSurfaceOrigin({
          surface: "client",
          environment: "production",
          candidates: [{ name: "CLIENT_SITE_URL", value }],
        }),
      undefined,
      value,
    );
  }

  assert.throws(() =>
    resolveSurfaceOrigin({
      surface: "client",
      environment: "test",
      candidates: [
        { name: "CLIENT_SITE_URL", value: "http://localhost:4103" },
        { name: "NEXT_PUBLIC_CLIENT_SITE_URL", value: "http://localhost:4104" },
      ],
    }),
  );
});

test("development defaults stay local and local demo links never adopt a remote origin", async () => {
  assert.equal(
    resolveSurfaceOrigin({ surface: "client", environment: "development" }),
    DEFAULT_LOCAL_ORIGIN,
  );
  assert.equal(
    resolveSurfaceOrigin({
      surface: "admin",
      environment: "development",
      runtimeOrigin: "http://admin.localhost:4300/",
    }),
    "http://admin.localhost:4300",
  );
  assert.equal(
    resolveSurfaceOrigin({
      surface: "client",
      environment: "test",
      localPort: "4500",
    }),
    "http://localhost:4500",
  );

  await withSurfaceEnvironment(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_CLIENT_SITE_URL: CLIENT_PRODUCTION_ORIGIN,
    },
    () => {
      assert.equal(
        toDemoSiteUrl("/review/demo?demo=1", "http://localhost:4555"),
        "http://localhost:4555/review/demo?demo=1",
      );
      assert.equal(
        getBrowserClientSiteUrl("http://localhost:4555"),
        CLIENT_PRODUCTION_ORIGIN,
      );
    },
  );
});

test("surface URL building rebases safe paths and rejects URL escape forms", () => {
  assert.equal(
    buildSurfaceUrl(
      CLIENT_PRODUCTION_ORIGIN,
      "https://deliver.contentco-op.com/review/token?download=1#media",
    ),
    "https://client.contentco-op.com/review/token?download=1#media",
  );
  assert.equal(
    buildSurfaceUrl(
      ADMIN_PRODUCTION_ORIGIN,
      "https://client.contentco-op.com/projects/project-1/assets/asset-1",
    ),
    "https://admin.contentco-op.com/projects/project-1/assets/asset-1",
  );

  for (const destination of [
    "//attacker.test/review/token",
    "javascript:alert(1)",
    "/%252f%252fattacker.test/review/token",
    "https://user@attacker.test/review/token",
    "/review/token\\@attacker.test",
  ]) {
    assert.throws(
      () => buildSurfaceUrl(CLIENT_PRODUCTION_ORIGIN, destination),
      undefined,
      destination,
    );
  }
});

test("server env and email links keep public and internal surfaces separate", async () => {
  await withSurfaceEnvironment(
    {
      NODE_ENV: "production",
      ADMIN_SITE_URL: ADMIN_PRODUCTION_ORIGIN,
      NEXT_PUBLIC_ADMIN_SITE_URL: ADMIN_PRODUCTION_ORIGIN,
      CLIENT_SITE_URL: CLIENT_PRODUCTION_ORIGIN,
      NEXT_PUBLIC_CLIENT_SITE_URL: CLIENT_PRODUCTION_ORIGIN,
    },
    async () => {
      const { getAdminSiteUrl, getClientSiteUrl, getSiteUrl } = await import(
        "../lib/server-env.ts"
      );
      const { emailTemplates, getAdminBaseUrl, getBaseUrl } = await import(
        "../lib/email.ts"
      );

      assert.equal(getAdminSiteUrl(), ADMIN_PRODUCTION_ORIGIN);
      assert.equal(getSiteUrl(), ADMIN_PRODUCTION_ORIGIN);
      assert.equal(getAdminBaseUrl(), ADMIN_PRODUCTION_ORIGIN);
      assert.equal(getClientSiteUrl(), CLIENT_PRODUCTION_ORIGIN);
      assert.equal(getBaseUrl(), CLIENT_PRODUCTION_ORIGIN);

      const approval = emailTemplates.approvalRequest(
        "reviewer@example.com",
        "Rough cut",
        "Launch",
        "https://admin.contentco-op.com/review/approval-token",
      );
      assert.match(
        approval.html,
        /href="https:\/\/client\.contentco-op\.com\/review\/approval-token"/,
      );

      const share = emailTemplates.shareInvite({
        inviteeEmail: "reviewer@example.com",
        assetTitle: "Final cut",
        shareLink: "https://deliver.contentco-op.com/review/share-token",
        shareIntent: "final_delivery",
      });
      assert.match(
        share.html,
        /href="https:\/\/client\.contentco-op\.com\/review\/share-token"/,
      );

      const comment = emailTemplates.commentNotification(
        "owner@example.com",
        "Reviewer",
        "Rough cut",
        "Please trim this section.",
        "https://client.contentco-op.com/projects/project-1/assets/asset-1",
      );
      assert.match(
        comment.html,
        /href="https:\/\/admin\.contentco-op\.com\/projects\/project-1\/assets\/asset-1"/,
      );
    },
  );

  await withSurfaceEnvironment(
    {
      NODE_ENV: "production",
      CLIENT_SITE_URL: "https://attacker.test",
      NEXT_PUBLIC_CLIENT_SITE_URL: CLIENT_PRODUCTION_ORIGIN,
    },
    async () => {
      const { getClientSiteUrl } = await import("../lib/server-env.ts");
      assert.throws(() => getClientSiteUrl());
    },
  );
});
