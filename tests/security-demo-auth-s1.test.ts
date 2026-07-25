import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils.js";
import { NextRequest } from "next/server.js";

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
        : `${base}${[".ts", ".tsx"].find((extension) => {
            try {
              readFileSync(`${base}${extension}`);
              return true;
            } catch {
              return false;
            }
          }) ?? ".ts"}`;
      return nextResolve(pathToFileURL(path).href, context);
    }

    return nextResolve(specifier, context);
  },
});

async function loadProxy() {
  return import(pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href);
}

test("demo policy requires an explicit non-production environment opt-in", async () => {
  const mode = await import(pathToFileURL(resolve(repositoryRoot, "lib/demo/mode.ts")).href);
  assert.equal(typeof mode.isLocalDemoPreviewEnabled, "function");

  const isLocalDemoPreviewEnabled = mode.isLocalDemoPreviewEnabled as (
    environment: NodeJS.ProcessEnv,
  ) => boolean;
  assert.equal(isLocalDemoPreviewEnabled({ NODE_ENV: "development" }), false);
  assert.equal(
    isLocalDemoPreviewEnabled({
      NODE_ENV: "development",
      CODELIVER_DEMO_MODE: "1",
    }),
    true,
  );
  assert.equal(
    isLocalDemoPreviewEnabled({
      NODE_ENV: "production",
      CODELIVER_DEMO_MODE: "1",
    }),
    false,
  );
  assert.equal(mode.demoModeFromCapability(false), false);
  assert.equal(mode.demoModeFromCapability(true), true);
  assert.equal(mode.isDemoSessionAllowed(false), false);
  assert.equal(mode.isDemoSessionAllowed(true), true);

  const proxySource = readFileSync(resolve(repositoryRoot, "proxy.ts"), "utf8");
  assert.match(proxySource, /process\.env\.CODELIVER_DEMO_MODE === "1"/);
  assert.doesNotMatch(proxySource, /NEXT_PUBLIC_ENABLE_LOCAL_DEMO/);
});

test("proxy confines demo access to opted-in localhost preview", async () => {
  const previousEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    demo: process.env.CODELIVER_DEMO_MODE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  try {
    const { proxy } = await loadProxy();

    process.env.NODE_ENV = "development";
    delete process.env.CODELIVER_DEMO_MODE;
    const localWithoutOptIn = await proxy(
      new NextRequest("http://localhost:4103/projects/ica?demo=1", {
        headers: { host: "localhost:4103" },
      }),
    );
    assert.equal(localWithoutOptIn.status, 307);

    process.env.CODELIVER_DEMO_MODE = "1";
    const implicitLocalPreview = await proxy(
      new NextRequest("http://localhost:4103/projects/ica", {
        headers: { host: "localhost:4103" },
      }),
    );
    assert.equal(implicitLocalPreview.status, 307);

    const localPreview = await proxy(
      new NextRequest("http://localhost:4103/projects/ica?demo=1", {
        headers: { host: "localhost:4103" },
      }),
    );
    assert.equal(localPreview.headers.get("x-middleware-next"), "1");
    assert.match(
      localPreview.headers.get("x-middleware-override-headers") ?? "",
      /x-codeliver-demo-preview/,
    );
    assert.equal(
      localPreview.headers.get("x-middleware-request-x-codeliver-demo-preview"),
      "1",
    );

    const forgedCapabilityWithoutDemo = await proxy(
      new NextRequest("http://localhost:4103/login", {
        headers: {
          host: "localhost:4103",
          "x-codeliver-demo-preview": "1",
        },
      }),
    );
    assert.doesNotMatch(
      forgedCapabilityWithoutDemo.headers.get("x-middleware-override-headers") ?? "",
      /x-codeliver-demo-preview/,
    );

    const managedSurface = await proxy(
      new NextRequest("https://admin.contentco-op.com/projects/ica?demo=1", {
        headers: { host: "admin.contentco-op.com" },
      }),
    );
    assert.equal(managedSurface.status, 307);
    assert.equal(new URL(managedSurface.headers.get("location") ?? "").pathname, "/login");

    process.env.NODE_ENV = "production";
    const productionLocalHost = await proxy(
      new NextRequest("http://localhost:4103/projects/ica?demo=1", {
        headers: { host: "localhost:4103" },
      }),
    );
    assert.equal(productionLocalHost.status, 307);
  } finally {
    if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment.nodeEnv;
    if (previousEnvironment.demo === undefined) delete process.env.CODELIVER_DEMO_MODE;
    else process.env.CODELIVER_DEMO_MODE = previousEnvironment.demo;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousEnvironment.supabaseKey;
  }
});

test("proxy matcher skips crawler manifests", async () => {
  const { config } = await loadProxy();

  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    assert.equal(
      unstable_doesMiddlewareMatch({ config, url: `https://admin.contentco-op.com${path}` }),
      false,
      `proxy matcher included ${path}`,
    );
  }
});

test("login form does not ship prefilled credentials", () => {
  const loginPage = readFileSync(resolve(repositoryRoot, "app/login/page.tsx"), "utf8");

  assert.doesNotMatch(loginPage, /defaultValue=\{demoMode \? demoWorkspace\.session\.email/);
  assert.doesNotMatch(loginPage, /defaultValue=\{demoMode \? "demo"/);
});
