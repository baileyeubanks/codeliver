import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createServerClient() {
    return { auth: { async getUser() { return { data: { user: null } }; } } };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@supabase/ssr") return nextResolve(supabaseStubUrl, context);
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

test("proxy matcher bypasses crawler metadata and icon assets", async () => {
  const { config } = await import(pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href);

  for (const pathname of [
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/icon.svg",
  ]) {
    assert.equal(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://admin.contentco-op.com${pathname}`,
      }),
      false,
      `proxy matcher included ${pathname}`,
    );
  }
});

test("App Router crawler metadata is static, valid, and exposes no application routes", async () => {
  const [robotsModule, sitemapModule, manifestModule] = await Promise.all([
    import(pathToFileURL(resolve(repositoryRoot, "app/robots.ts")).href),
    import(pathToFileURL(resolve(repositoryRoot, "app/sitemap.ts")).href),
    import(pathToFileURL(resolve(repositoryRoot, "app/manifest.ts")).href),
  ]);

  const robots = robotsModule.default();
  const sitemap = sitemapModule.default();
  const manifest = manifestModule.default();

  assert.deepEqual(robots.rules, { userAgent: "*", disallow: "/" });
  assert.equal(robots.sitemap, "https://deliver.contentco-op.com/sitemap.xml");
  assert.deepEqual(sitemap, []);
  assert.equal(manifest.start_url, "/login");
  assert.deepEqual(manifest.icons, [
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
  ]);

  const icon = readFileSync(resolve(repositoryRoot, "app/icon.svg"), "utf8");
  assert.match(icon, /^<svg\b/);
  assert.match(icon, /viewBox="0 0 64 64"/);
});
