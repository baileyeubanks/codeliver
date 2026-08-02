import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !extname(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

function moduleUrl(path: string) {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("upload failures preserve actionable HTTP status and retry guidance", async () => {
  const [{ mapUploadError }, { UploadOrchestrationError }, { StorageError }] = await Promise.all([
    import(moduleUrl("app/api/upload/_shared.ts")),
    import(moduleUrl("lib/tus/errors.ts")),
    import(moduleUrl("lib/storage/errors.ts")),
  ]);

  assert.deepEqual(
    mapUploadError(new UploadOrchestrationError("UPLOAD_CHECKSUM", "Checksum mismatch")),
    { status: 422, code: "UPLOAD_CHECKSUM", message: "Checksum mismatch" },
  );
  assert.deepEqual(
    mapUploadError(new UploadOrchestrationError("UPLOAD_BUSY", "Upload is locked", true)),
    { status: 423, code: "UPLOAD_BUSY", message: "Upload is locked", retryAfter: "2" },
  );
  assert.deepEqual(
    mapUploadError(new UploadOrchestrationError("UPLOAD_QUOTA", "Quota exceeded")),
    { status: 429, code: "UPLOAD_QUOTA", message: "Quota exceeded", retryAfter: "60" },
  );
  assert.deepEqual(
    mapUploadError(new StorageError("STORAGE_CAPACITY", "Storage full", true)),
    { status: 507, code: "STORAGE_CAPACITY", message: "Storage full", retryAfter: "60" },
  );
  assert.deepEqual(mapUploadError(new Error("provider secret")), {
    status: 500,
    code: "UPLOAD_FAILED",
    message: "Upload orchestration failed",
  });
});

test("missing canonical NAS authority is an honest retryable 503", async () => {
  const [
    { assertUploadStorageConfigured, mapUploadError },
    { readStorageConfig },
  ] = await Promise.all([
    import(moduleUrl("app/api/upload/_shared.ts")),
    import(moduleUrl("lib/storage/config.ts")),
  ]);
  const config = readStorageConfig({
    CODELIVER_STORAGE_PROVIDER: "ccnas",
    CODELIVER_STORAGE_WRITE_ENABLED: "1",
  } as NodeJS.ProcessEnv);

  let failure: unknown;
  try {
    assertUploadStorageConfigured(config);
  } catch (error) {
    failure = error;
  }

  assert.deepEqual(mapUploadError(failure), {
    status: 503,
    code: "STORAGE_UNAVAILABLE",
    message: "Upload storage is unavailable",
    retryAfter: "15",
  });
  assert.doesNotMatch(JSON.stringify(mapUploadError(failure)), /NAS_MEDIA_ROOT|\/Users\//);
});

test("the active production project upload is readiness-gated and uses authoritative resumable ingest", () => {
  const projectWorkspaceClient = source("components/projects/ProjectWorkspaceClient.tsx");
  const uploader = source("components/assets/AssetUpload.tsx");

  assert.match(projectWorkspaceClient, /import AssetUpload/);
  assert.match(projectWorkspaceClient, /<AssetUpload\b/);
  assert.match(uploader, /fetch\("\/api\/storage\/readiness"/);
  assert.match(uploader, /endpoint: "\/api\/upload\/tus"/);
  assert.doesNotMatch(projectWorkspaceClient, /createSupabaseBrowser/);
  assert.doesNotMatch(projectWorkspaceClient, /\.from\("deliverables"\)\s*\.upload/);
});

test("the active production upload never publishes a raw storage URL before release readiness", () => {
  const projectWorkspaceClient = source("components/projects/ProjectWorkspaceClient.tsx");
  const uploader = source("components/assets/AssetUpload.tsx");

  assert.doesNotMatch(projectWorkspaceClient, /\.getPublicUrl\(/);
  assert.doesNotMatch(projectWorkspaceClient, /file_url:\s*urlData\.publicUrl/);
  assert.match(
    uploader,
    /response\.getHeader\("Upload-Original-Ready"\) === "true"/,
  );
  assert.match(uploader, /serverState !== "committed" \|\| !originalReleaseReady/);
  assert.doesNotMatch(uploader, /if \(!quarantined\) onUploadComplete\(\[\]\)/);
  assert.match(uploader, /onUploadComplete\(\[\]\)/);
});

test("the resumable upload surface exposes readiness, progress, pause, retry, quarantine, and error states", () => {
  const uploader = source("components/assets/AssetUpload.tsx");

  assert.match(uploader, /fetch\("\/api\/storage\/readiness"/);
  assert.match(uploader, /endpoint: "\/api\/upload\/tus"/);
  assert.match(uploader, /onProgress\(bytesUploaded, bytesTotal\)/);
  assert.match(uploader, /status: quarantined \? "quarantined" : "done"/);
  assert.match(uploader, /pauseUpload/);
  assert.match(uploader, /resumeUpload/);
  assert.match(uploader, /retryUpload/);
  assert.match(uploader, /Uploads unavailable/);
  assert.match(uploader, /uploads remain quarantined until scanned/);
});

test("share create, batch, rotate, and revoke routes preserve tenant and idempotency authority", () => {
  const singleRoute = source("app/api/assets/[id]/share/route.ts");
  const batchRoute = source("app/api/assets/batch-share/route.ts");
  const shareApi = source("lib/sharing/share-api.ts");
  const patchStart = singleRoute.indexOf("async function PATCHHandler");
  const deleteStart = singleRoute.indexOf("async function DELETEHandler");
  const patchBlock = singleRoute.slice(patchStart, deleteStart);
  const deleteBlock = singleRoute.slice(deleteStart);

  assert.ok(patchBlock.indexOf("getAssetAccess") < patchBlock.indexOf("rotateShareLink"));
  assert.ok(deleteBlock.indexOf("getAssetAccess") < deleteBlock.indexOf("revokeShareLink"));
  assert.match(patchBlock, /ROTATION_REQUEST_PATTERN\.test\(requestId\)/);
  assert.match(batchRoute, /authenticatedTenantId: user\.id/);
  assert.match(shareApi, /mutation_performed: false/);
  assert.match(batchRoute, /executeShareManifest/);
});

test("notification live-send authority is invalidated whenever recipient, version, or controls change", () => {
  const shareModal = source("components/sharing/ShareModal.tsx");

  assert.match(shareModal, /previewFingerprint !== previewSubjectFingerprint/);
  assert.match(shareModal, /Confirm live-send authority before creating and sending/);
  assert.match(shareModal, /setNotificationPreview\(null\)/);
  assert.match(shareModal, /setSharePreview\(null\)/);
  assert.match(shareModal, /confirm_live_send: notificationAuthority\.confirmLiveSend/);
  assert.match(shareModal, /operation,\s*manifest_id: requestId,\s*version_id: versionId/);
});

test("share modal keeps compact cockpit controls while preserving the share contract", () => {
  const shareModal = source("components/sharing/ShareModal.tsx");

  assert.match(shareModal, /role="dialog"/);
  assert.match(shareModal, /aria-modal="true"/);
  assert.match(shareModal, /Co‑VideoPro sharing controls/);
  assert.match(shareModal, /aria-pressed=\{selected\}/);
  assert.match(shareModal, /Create \$\{intentDefinition\.label\.toLowerCase\(\)\} link/);
  assert.doesNotMatch(shareModal, /rounded-full/);
  assert.doesNotMatch(shareModal, /bg-black\/70/);
});

test("share-link loading failures remain distinct from the legitimate empty state", () => {
  const shareList = source("components/sharing/ShareLinkList.tsx");
  const catchBlock = shareList.match(/\.catch\(\(\) => \{([\s\S]*?)\}\)\s*\.finally/);

  assert.ok(catchBlock, "could not locate the share-link loading failure branch");
  assert.match(
    catchBlock[1],
    /set[A-Za-z]*Error\s*\(/,
    "share API failures are swallowed and rendered as 'No active handoffs yet'",
  );
});
