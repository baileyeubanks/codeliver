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

/**
 * ALLOW-WHAT-IS-KNOWN scan (inverted, per review #2 FINDING 5).
 *
 * The deny-list scan above can only fire on names it already knows, so a NEW helper
 * (`getShareOrigin()` returning CLIENT_PRODUCTION_ORIGIN) or a two-line variable binding
 * defeats it. This scan works the other way round: it finds every place that prefixes a
 * PUBLIC review/share destination with an ORIGIN EXPRESSION, resolves that expression back
 * through its bindings in the same file, and requires it to come from a KNOWN-GOOD producer.
 * Anything else — any name, however new — fails.
 *
 * Matching is on the URL PATH, not on variable names: `app/api/assets/[id]/comments/route.ts`
 * and `app/api/review/[token]/comments/route.ts` assign a variable called `reviewUrl` that
 * points at `/projects/<id>/assets/<id>`, an authenticated in-app deep link.
 */
const APPROVED_ORIGIN_PRODUCER =
  /\b(getReviewSiteUrl|toReviewSiteUrl|publicReviewUrl|LEGACY_UNIFIED_PRODUCTION_ORIGIN|getDemoSiteUrl|toDemoSiteUrl)\b/;

/** The only origin literal a public review/share link may carry. */
const APPROVED_ORIGIN_LITERAL = "https://co-videopro.com";

/**
 * Origins that arrive as a function parameter and therefore cannot be resolved inside the
 * file. Each is safe only because this same test checks the value at every call site (the
 * `baseUrl:` capture below), so widening this map without that guarantee reopens the hole.
 */
const PARAMETER_ORIGIN_ALLOWLIST = new Map<string, string>([
  [
    "lib/sharing/share-notifications.ts:baseUrl",
    "required parameter; both callers pass getReviewSiteUrl() and are checked by the baseUrl: rule",
  ],
  [
    "lib/sharing/share-api.ts:baseUrl",
    "required parameter; both share routes pass getReviewSiteUrl() and are checked by the baseUrl: rule",
  ],
]);

/** Each capture pulls the ORIGIN half out of a line that builds a public review destination. */
const ORIGIN_CAPTURES: Array<{ pattern: RegExp; requiresReviewHint: boolean }> = [
  // `${origin}/review/<token>`
  { pattern: /\$\{([^}]+)\}\/review\//g, requiresReviewHint: false },
  // origin + "/review/..."
  { pattern: /([A-Za-z_$][\w$.]*(?:\([^()]*\))?)\s*\+\s*["'`]\/review\//g, requiresReviewHint: false },
  // buildSurfaceUrl(origin, "/review/...")
  { pattern: /buildSurfaceUrl\(\s*([^,\n]+?)\s*,/g, requiresReviewHint: true },
  // { baseUrl: origin } handed to the share-notification builder
  { pattern: /\bbaseUrl:\s*([^,;\n]+?)\s*,?\s*$/g, requiresReviewHint: false },
];

const TYPE_ANNOTATION = /^(string|number|boolean|null|undefined|unknown|any)$/;

function bindingsFor(identifier: string, source: string): string[] {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found: string[] = [];
  const declaration = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b[^=;]*=([\\s\\S]*?);`, "g");
  const assignment = new RegExp(`^[ \\t]*${escaped}\\s*=([\\s\\S]*?);`, "gm");
  for (const pattern of [declaration, assignment]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) found.push(match[1]);
  }
  return found;
}

type Verdict = { ok: true } | { ok: false; reason: string };

function judgeOriginExpression(
  expression: string,
  source: string,
  relativePath: string,
  depth = 0,
): Verdict {
  const expr = expression.trim().replace(/^\(|\)$/g, "").trim();
  if (!expr || TYPE_ANNOTATION.test(expr)) return { ok: true };
  // A relative destination carries no origin at all — always safe.
  if (/^["'`]\//.test(expr)) return { ok: true };

  if (/https?:\/\//.test(expr)) {
    return expr.includes(APPROVED_ORIGIN_LITERAL)
      ? { ok: true }
      : { ok: false, reason: `hard-coded non-review origin in ${expr}` };
  }
  if (APPROVED_ORIGIN_PRODUCER.test(expr)) return { ok: true };

  // A string-normalizing chain (`baseUrl.replace(/\/$/, "")`) does not change the origin;
  // judge the receiver instead.
  const chained = expr.match(/^([A-Za-z_$][\w$]*)\.(?:replace|replaceAll|trim|slice|toString)\(/);
  if (chained && depth < 3) {
    return judgeOriginExpression(chained[1], source, relativePath, depth + 1);
  }

  const identifier = /^[A-Za-z_$][\w$]*$/.test(expr) ? expr : null;
  if (identifier) {
    if (PARAMETER_ORIGIN_ALLOWLIST.has(`${relativePath}:${identifier}`)) return { ok: true };
    if (depth < 3) {
      const bindings = bindingsFor(identifier, source);
      if (bindings.length) {
        for (const binding of bindings) {
          const verdict = judgeOriginExpression(binding, source, relativePath, depth + 1);
          if (!verdict.ok) {
            return { ok: false, reason: `${identifier} is bound to ${binding.trim()} — ${verdict.reason}` };
          }
        }
        return { ok: true };
      }
    }
    return { ok: false, reason: `${identifier} has no resolvable origin binding in this file` };
  }

  return { ok: false, reason: `origin expression ${expr} is not a known review-origin producer` };
}

test("every public review/share URL is minted from a KNOWN review-origin producer", () => {
  const offenders: string[] = [];

  for (const absolute of collectSourceFiles()) {
    const relativePath = relative(repositoryRoot, absolute).split("\\").join("/");
    if (relativePath === "lib/surface-origins.ts") continue; // the helpers themselves

    const source = readFileSync(absolute, "utf8");
    const lines = source.split("\n");

    lines.forEach((line, index) => {
      const hasReviewHint = REVIEW_LINK_HINT.test(line);

      for (const { pattern, requiresReviewHint } of ORIGIN_CAPTURES) {
        if (requiresReviewHint && !hasReviewHint) continue;
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line))) {
          const verdict = judgeOriginExpression(match[1], source, relativePath);
          if (verdict.ok) continue;
          offenders.push(`${relativePath}:${index + 1} — ${verdict.reason} — ${line.trim()}`);
        }
      }

      // A review-hint line that hard-codes any other absolute origin is a defect on its face.
      if (hasReviewHint) {
        const literal = line.match(/https?:\/\/[^"'`\s)]+/);
        if (literal && !literal[0].startsWith(APPROVED_ORIGIN_LITERAL)) {
          offenders.push(`${relativePath}:${index + 1} — hard-coded origin ${literal[0]} on a review link`);
        }
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `A public review/share link is minted from an origin this test cannot prove is the review site. ` +
      `Mint it with getReviewSiteUrl()/toReviewSiteUrl().\n${offenders.join("\n")}`,
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
