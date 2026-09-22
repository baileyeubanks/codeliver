import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function requireSource(path: string): string {
  assert.ok(existsSync(resolve(repositoryRoot, path)), `${path} must exist`);
  return source(path);
}

function constantArray(sourceText: string, name: string): string {
  const match = sourceText.match(
    new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`),
  );
  assert.ok(match, `${name} must remain an explicit array`);
  return match[1];
}

test("privacy and terms are exact anonymous routes", () => {
  const proxy = source("proxy.ts");
  const exactRoutes = constantArray(proxy, "PUBLIC_EXACT_ROUTES");
  const routePrefixes = constantArray(proxy, "PUBLIC_ROUTE_PREFIXES");

  assert.match(exactRoutes, /"\/privacy"/);
  assert.match(exactRoutes, /"\/terms"/);
  assert.doesNotMatch(routePrefixes, /"\/(?:privacy|terms)"/);
  assert.ok(
    proxy.indexOf("if (isPublicRoute(pathname))") <
      proxy.indexOf("await supabase.auth.getUser()"),
    "legal pages must bypass the authenticated session lookup",
  );
});

test("privacy page is a grounded Content Co-op draft", () => {
  const privacy = requireSource("app/privacy/page.tsx");

  for (const phrase of [
    "Privacy Policy",
    "accounts",
    "uploads",
    "media storage",
    "review links",
    "comments",
    "approvals",
    "email notifications",
  ]) {
    assert.match(
      privacy,
      new RegExp(phrase, "i"),
      `privacy copy must mention ${phrase}`,
    );
  }
  assert.match(privacy, /do not sell|does not sell/i);
  assert.equal(
    privacy.match(/sell(?:ing)? personal information/gi)?.length,
    1,
    "the qualified no-sale section must be the draft's only no-sale claim",
  );
  assert.match(
    privacy,
    /intended policy[\s\S]*subject to owner review/i,
    "the draft must qualify the no-sale posture until owner review",
  );
  for (const processor of ["Supabase", "Cloudflare", "Vercel", "Resend"]) {
    assert.match(
      privacy,
      new RegExp(processor),
      `privacy draft must name ${processor}`,
    );
  }
  assert.match(privacy, /placeholder|pending owner review/i);
  assert.doesNotMatch(privacy, /jitsi/i);
});

test("terms page covers the real review and delivery workflow", () => {
  const terms = requireSource("app/terms/page.tsx");

  for (const phrase of [
    "Terms of Service",
    "Content Co-op",
    "accounts",
    "uploads",
    "review links",
    "comments",
    "approvals",
    "email notifications",
  ]) {
    assert.match(
      terms,
      new RegExp(phrase, "i"),
      `terms copy must mention ${phrase}`,
    );
  }
  assert.match(terms, /Draft/i);
  assert.match(terms, /pending owner review/i);
  assert.doesNotMatch(terms, /jitsi/i);
});

test("legal shell carries CVP branding and a visible draft footer marker", () => {
  const shell = requireSource("components/legal/LegalPage.tsx");
  const styles = requireSource("components/legal/LegalPage.module.css");
  const footer = shell.slice(shell.indexOf("<footer"));

  assert.match(shell, /CoProductionBrand/);
  assert.match(shell, /href="\/login"/);
  assert.match(shell, /href="\/privacy"/);
  assert.match(shell, /href="\/terms"/);
  assert.match(footer, /Draft — pending owner review/);
  assert.match(styles, /#0057ff/i);
  assert.match(styles, /@media/);
  assert.match(styles, /focus-visible/);
  assert.match(
    styles,
    /\.main:focus-visible\s*\{[^}]*outline:/s,
    "the skip-link destination must retain a visible focus cue",
  );
  assert.match(
    styles,
    /\.headerNav a\[aria-current="page"\]\s*\{[^}]*text-decoration:/s,
    "the active legal page needs a non-color cue",
  );
});

test("login footer links to both legal drafts", () => {
  const login = source("app/login/page.tsx");
  const footer = login.slice(
    login.indexOf(`<footer className={styles.footer}>`),
  );

  assert.match(footer, /<Link href="\/privacy">Privacy<\/Link>/);
  assert.match(footer, /<Link href="\/terms">Terms<\/Link>/);
});

test("forgot alias is an exact anonymous route", () => {
  const proxy = source("proxy.ts");
  const exactRoutes = constantArray(proxy, "PUBLIC_EXACT_ROUTES");
  assert.match(exactRoutes, /"\/forgot"/);
  assert.match(exactRoutes, /"\/forgot-password"/);
  assert.ok(existsSync(resolve(repositoryRoot, "app/forgot/page.tsx")));
  const alias = source("app/forgot/page.tsx");
  assert.match(alias, /redirect\(\s*["']\/forgot-password["']\s*\)/);
});
