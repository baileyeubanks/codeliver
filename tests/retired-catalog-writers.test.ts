import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function poisonModule(exports: string): string {
  return `data:text/javascript,${encodeURIComponent(exports)}`;
}

const authClientStub = poisonModule(`
  export async function requireAuthWithClient() {
    throw new Error("retired writer touched authenticated client");
  }
`);
const authStub = poisonModule(`
  export async function requireAuth() {
    throw new Error("retired writer touched authentication");
  }
`);
const accessStub = poisonModule(`
  export async function getProjectAccess() {
    throw new Error("retired writer touched project authority");
  }
  export async function getAssetAccess() {
    throw new Error("retired writer touched asset authority");
  }
`);
const supabaseStub = poisonModule(`
  export function getSupabase() {
    throw new Error("retired writer touched the database");
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") {
      return nextResolve(authClientStub, context);
    }
    if (specifier === "@/lib/auth") return nextResolve(authStub, context);
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessStub, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStub, context);
    }
    if (specifier === "../../asset-route-boundary") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "app/api/assets/asset-route-boundary.ts"),
        ).href,
        context,
      );
    }
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

function poison(): never {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("retired writer touched request or route parameters");
      },
    },
  ) as never;
}

test("asset-only project POST is a bodyless 410 with the canonical V1 successor", async () => {
  const route = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/projects/[id]/assets/route.ts"),
    ).href
  );
  const response = await route.POST(poison(), poison());

  assert.equal(response.status, 410);
  assert.equal(
    response.headers.get("link"),
    '</api/upload/tus>; rel="successor-version"',
  );
  assert.deepEqual(await response.json(), {
    error:
      "This legacy upload endpoint is retired. Use the canonical resumable upload endpoint.",
    code: "LEGACY_UPLOAD_RETIRED",
    canonicalUploadUrl: "/api/upload/tus",
  });
});

test("arbitrary-reference V2 POST is a bodyless 410 with no false successor", async () => {
  const route = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/assets/[id]/versions/route.ts"),
    ).href
  );
  const response = await route.POST(poison(), poison());

  assert.equal(response.status, 410);
  assert.equal(response.headers.get("link"), null);
  assert.deepEqual(await response.json(), {
    error:
      "New version uploads are unavailable until receipt-bound version ingest is implemented.",
    code: "VERSION_UPLOAD_RETIRED",
  });
});
