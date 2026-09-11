import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createServerClient(_url, _key, options) {
    return {
      auth: {
        async getUser() {
          return { data: { user: null }, error: null };
        }
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server")
      return nextResolve("next/server.js", context);
    if (specifier === "@supabase/ssr")
      return nextResolve(supabaseStubUrl, context);
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

// Next's image optimizer performs its upstream fetch for LOCAL images through
// an internal mocked request (next/dist/server/lib/mock-request.js) that
// carries NO headers — including no Host. The host-surface gate denied that
// headerless subrequest with 403, so every local `/_next/image` optimization
// failed (the HTML denial body is not an image → optimizer 400). The gate must
// admit hostless subrequests to the public static prefixes it already serves
// to every approved host, while still denying hostless/unknown-host access to
// application routes.

test("hostless internal subrequests reach public static assets (image optimizer path)", async () => {
  const { proxy } = await import(
    pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href
  );

  for (const pathname of [
    "/brand/cvp-mark.png",
    "/demo/cco-spiral.png",
    "/_next/static/chunks/app/review/page.js",
    "/favicon.ico",
  ]) {
    // NextRequest requires a Host to parse, so strip it back off to model the
    // optimizer's headerless internal subrequest.
    const req = new NextRequest(`http://internal${pathname}`);
    req.headers.delete("host");
    const res = await proxy(req);
    assert.notEqual(
      res.status,
      403,
      `${pathname}: hostless internal static-asset subrequest must not be host-denied`,
    );
    assert.equal(
      res.headers.get("x-middleware-next"),
      "1",
      `${pathname}: expected pass-through to the static asset`,
    );
  }
});

test("hostless subrequest to the image optimizer endpoint itself is admitted", async () => {
  const { proxy } = await import(
    pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href
  );
  const req = new NextRequest(
    "http://internal/_next/image?url=%2Fbrand%2Fcvp-mark.png&w=256&q=75",
  );
  req.headers.delete("host");
  const res = await proxy(req);
  assert.equal(res.headers.get("x-middleware-next"), "1");
});

test("host gate still bites: hostless or unknown-host app and API routes stay denied", async () => {
  const { proxy } = await import(
    pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href
  );

  const hostlessPage = new NextRequest("http://internal/projects");
  hostlessPage.headers.delete("host");
  assert.equal((await proxy(hostlessPage)).status, 403, "hostless /projects");

  const hostlessApi = new NextRequest("http://internal/api/projects");
  hostlessApi.headers.delete("host");
  const hostlessApiRes = await proxy(hostlessApi);
  assert.equal(hostlessApiRes.status, 403, "hostless /api/projects");
  assert.deepEqual(await hostlessApiRes.json(), {
    error: "This hostname is not an approved Content Co-op surface",
    code: "HOST_FORBIDDEN",
  });

  const unknownHostStatic = await proxy(
    new NextRequest("http://attacker.example/brand/cvp-mark.png", {
      headers: { host: "attacker.example" },
    }),
  );
  assert.equal(
    unknownHostStatic.status,
    403,
    "a PRESENT but unapproved host must stay denied even for static assets",
  );
});

test("the image optimizer is enabled (the 16.2.10 workaround is retired)", async () => {
  const { default: nextConfig } = await import(
    pathToFileURL(resolve(repositoryRoot, "next.config.ts")).href
  );
  assert.notEqual(
    nextConfig.images?.unoptimized,
    true,
    "local images must flow through /_next/image again; unoptimized:true hid the host-gate defect",
  );
});
