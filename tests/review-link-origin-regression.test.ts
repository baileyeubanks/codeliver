import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the dead-share-link defect (2026-09-09).
 *
 * `https://client.contentco-op.com` has no DNS record. The `/review/[token]`
 * route is served from `https://co-videopro.com`. Any code that MINTS a
 * review/share URL must therefore go through `getReviewSiteUrl()` /
 * `toReviewSiteUrl()` in `lib/surface-origins.ts` — never through the
 * client-origin helpers (`getBrowserClientSiteUrl`, `toClientSiteUrl`,
 * `getBaseUrl`) and never through a hard-coded client host.
 *
 * Legitimate remaining uses of the client origin — the auth/login portal,
 * Host-header derivation, the env-var registry, and the single canonical
 * constant — are allow-listed by exact file path below.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_ROOTS = ["app", "components", "lib", "hooks", "middleware.ts"];
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);

/** Files permitted to reference the client origin at all. Each needs a reason. */
const CLIENT_ORIGIN_ALLOWLIST = new Map<string, string>([
  ["lib/surface-origins.ts", "defines the canonical constant and the client/admin/review helpers"],
  ["lib/server-env.ts", "env-var registry; names the vars, does not mint links"],
  ["lib/auth/host-surface.ts", "Host-header surface derivation (reviewed and correct)"],
  ["lib/auth/flow.ts", "auth redirect flow (reviewed and correct)"],
  ["lib/review/request-boundary.ts", "same-origin request boundary (reviewed and correct)"],
  ["components/auth/auth-context.ts", "client-portal host detection for the login surface"],
  ["components/auth/auth-policy.ts", "auth portal origin policy"],
  ["lib/email.ts", "getBaseUrl() is the account-portal base; review links use publicReviewUrl()"],
]);

/**
 * A line that actually builds a PUBLIC review/share destination.
 *
 * Deliberately matches the URL PATH, not a variable name: `app/api/assets/[id]/comments/route.ts`
 * and `app/api/review/[token]/comments/route.ts` both assign a variable called `reviewUrl` that
 * points at `/projects/<id>/assets/<id>` — an authenticated in-app deep link for a logged-in
 * teammate, which legitimately belongs on the account portal, not on the public review surface.
 */
const REVIEW_LINK_HINT = /\/review\/|public_url|publicReviewUrl|shareUrl|share_url/;

const CLIENT_ORIGIN_TOKENS = [
  "client.contentco-op.com",
  "CLIENT_SITE_URL",
  "NEXT_PUBLIC_CLIENT_SITE_URL",
  "getBrowserClientSiteUrl",
  "toClientSiteUrl",
  "getClientSiteUrl",
];

function collectSourceFiles(): string[] {
  const found: string[] = [];
  const walk = (absolute: string) => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isFile()) {
      if (/\.tsx?$/.test(absolute)) found.push(absolute);
      return;
    }
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(absolute)) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      walk(join(absolute, entry));
    }
  };
  for (const root of SCAN_ROOTS) walk(resolve(repositoryRoot, root));
  return found.sort();
}

test("no source file outside the allow-list references a client-origin link helper", () => {
  const offenders: string[] = [];

  for (const absolute of collectSourceFiles()) {
    const relativePath = relative(repositoryRoot, absolute).split("\\").join("/");
    if (CLIENT_ORIGIN_ALLOWLIST.has(relativePath)) continue;

    const lines = readFileSync(absolute, "utf8").split("\n");
    lines.forEach((line, index) => {
      const token = CLIENT_ORIGIN_TOKENS.find((candidate) => line.includes(candidate));
      if (!token) return;
      offenders.push(`${relativePath}:${index + 1} uses ${token} — ${line.trim()}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `Client-origin link helpers escaped the allow-list. https://client.contentco-op.com has no DNS; ` +
      `mint review/share URLs with getReviewSiteUrl()/toReviewSiteUrl() instead.\n${offenders.join("\n")}`,
  );
});

test("no review or share URL is built from a client-origin value, even inside allow-listed files", () => {
  const offenders: string[] = [];

  for (const absolute of collectSourceFiles()) {
    const relativePath = relative(repositoryRoot, absolute).split("\\").join("/");
    if (relativePath === "lib/surface-origins.ts") continue; // the helpers themselves

    const lines = readFileSync(absolute, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!REVIEW_LINK_HINT.test(line)) return;
      const token = [...CLIENT_ORIGIN_TOKENS, "getBaseUrl("].find((candidate) =>
        line.includes(candidate),
      );
      if (!token) return;
      offenders.push(`${relativePath}:${index + 1} mints a review link from ${token} — ${line.trim()}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `A review/share link is being minted against the dead client origin.\n${offenders.join("\n")}`,
  );
});

test("the three previously-broken call sites use the review-site helper", () => {
  const expectations: Array<[string, RegExp]> = [
    ["components/projects/ProjectCockpit.tsx", /getReviewSiteUrl\(window\.location\.origin\)/],
    ["app/(dashboard)/reviews/page.tsx", /toReviewSiteUrl\(value, runtimeOrigin\)/],
    ["app/api/assets/[id]/approvals/route.ts", /\$\{getReviewSiteUrl\(\)\}\/review\//],
    ["app/api/approvals/notify/route.ts", /\$\{getReviewSiteUrl\(\)\}\/review\//],
  ];

  for (const [file, pattern] of expectations) {
    const contents = readFileSync(resolve(repositoryRoot, file), "utf8");
    assert.match(contents, pattern, `${file} no longer mints its review link via getReviewSiteUrl()`);
  }
});
