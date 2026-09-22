import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type AuthorityState = typeof globalThis & {
  __ccoRevisionAuthorityAccess: Record<string, unknown>;
  __ccoRevisionAuthorityAccessCalls: Array<Record<string, unknown>>;
  __ccoRevisionAuthorityLocked: boolean;
  __ccoRevisionAuthorityVersions: Array<Record<string, unknown>>;
  __ccoRevisionAuthorityVersionError: { message: string } | null;
  __ccoRevisionAuthorityVersionReads: number;
};

const state = globalThis as AuthorityState;
const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAssetAccess(assetId, userId, minimumRole) {
    globalThis.__ccoRevisionAuthorityAccessCalls.push({ assetId, userId, minimumRole });
    return globalThis.__ccoRevisionAuthorityAccess;
  }
  export async function getProjectAccess() {
    throw new Error("revision authority must resolve through the asset");
  }
`)}`;
const deliveryStubUrl = `data:text/javascript,${encodeURIComponent(`
  export class AssetDeliveryLockedError extends Error {}
  export function isAssetDeliveryLockedError(error) {
    return error instanceof AssetDeliveryLockedError;
  }
  export async function assertAssetNotLocked() {
    if (globalThis.__ccoRevisionAuthorityLocked) throw new AssetDeliveryLockedError("locked");
  }
`)}`;
const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() { return "co_production"; }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return {
      from(table) {
        if (table !== "versions") throw new Error("unexpected table " + table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          limit: async () => {
            globalThis.__ccoRevisionAuthorityVersionReads += 1;
            return {
              data: globalThis.__ccoRevisionAuthorityVersions,
              error: globalThis.__ccoRevisionAuthorityVersionError
            };
          }
        };
        return chain;
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/delivery/lock") return nextResolve(deliveryStubUrl, context);
    if (specifier === "@/lib/data-authority") return nextResolve(dataAuthorityStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base) ? base : existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const userId = "33333333-3333-4333-8333-333333333333";
const projectId = "22222222-2222-4222-8222-222222222222";
const assetId = "44444444-4444-4444-8444-444444444444";
const currentVersionId = "55555555-5555-4555-8555-555555555555";

function reset() {
  state.__ccoRevisionAuthorityAccess = {
    ok: true,
    data: {
      id: assetId,
      project_id: projectId,
      file_type: "video",
      access_role: "editor",
      access_rank: 60,
    },
  };
  state.__ccoRevisionAuthorityAccessCalls = [];
  state.__ccoRevisionAuthorityLocked = false;
  state.__ccoRevisionAuthorityVersions = [{ id: currentVersionId, version_number: 4 }];
  state.__ccoRevisionAuthorityVersionError = null;
  state.__ccoRevisionAuthorityVersionReads = 0;
}

test("revision preflight requires editor access and derives next version from one exact current row", async () => {
  reset();
  const { requireOwnedRevisionUploadTarget } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  assert.deepEqual(
    await requireOwnedRevisionUploadTarget(
      userId,
      projectId,
      assetId,
      currentVersionId,
      "revision.mp4",
    ),
    { version: 5 },
  );
  assert.deepEqual(state.__ccoRevisionAuthorityAccessCalls, [{
    assetId,
    userId,
    minimumRole: "editor",
  }]);
  assert.equal(state.__ccoRevisionAuthorityVersionReads, 1);
});

test("revision preflight rejects a stale current version without allocating storage", async () => {
  reset();
  const { requireOwnedRevisionUploadTarget, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );
  await assert.rejects(
    () => requireOwnedRevisionUploadTarget(
      userId,
      projectId,
      assetId,
      "66666666-6666-4666-8666-666666666666",
      "revision.mp4",
    ),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 409,
        code: "UPLOAD_CONFLICT",
        message: "Asset current version changed before revision upload",
      });
      return true;
    },
  );
});

test("revision preflight hides cross-project targets and locked deliveries", async () => {
  reset();
  const { requireOwnedRevisionUploadTarget, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  state.__ccoRevisionAuthorityAccess = {
    ok: true,
    data: { id: assetId, project_id: "77777777-7777-4777-8777-777777777777" },
  };
  await assert.rejects(
    () => requireOwnedRevisionUploadTarget(
      userId,
      projectId,
      assetId,
      currentVersionId,
      "revision.mp4",
    ),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 403,
        code: "UPLOAD_FORBIDDEN",
        message: "Asset is unavailable for revision upload",
      });
      return true;
    },
  );
  assert.equal(state.__ccoRevisionAuthorityVersionReads, 0);

  reset();
  state.__ccoRevisionAuthorityLocked = true;
  await assert.rejects(
    () => requireOwnedRevisionUploadTarget(
      userId,
      projectId,
      assetId,
      currentVersionId,
      "revision.mp4",
    ),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 409,
        code: "UPLOAD_CONFLICT",
        message: "Asset is part of a locked delivery",
      });
      return true;
    },
  );
  assert.equal(state.__ccoRevisionAuthorityVersionReads, 0);
});

test("revision preflight refuses a different media type before allocating storage", async () => {
  reset();
  const { requireOwnedRevisionUploadTarget, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );
  await assert.rejects(
    () => requireOwnedRevisionUploadTarget(
      userId,
      projectId,
      assetId,
      currentVersionId,
      "replacement.pdf",
    ),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 400,
        code: "UPLOAD_INVALID",
        message: "Revision file type does not match the asset",
      });
      return true;
    },
  );
  assert.equal(state.__ccoRevisionAuthorityVersionReads, 0);
});
