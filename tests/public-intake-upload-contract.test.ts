import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const relative = specifier.startsWith("./") || specifier.startsWith("../");
      if (
        relative &&
        !extname(specifier) &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_MODULE_NOT_FOUND"
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const baseRoute = read("app/api/intake/uploads/tus/route.ts");
const uploadRoute = read("app/api/intake/uploads/tus/[uploadId]/route.ts");
const sharedRoute = read("app/api/intake/uploads/_shared.ts");
const orchestrator = read("lib/tus/orchestrator.ts");
const migration = read(
  "supabase/migrations/20260716034500_public_inquiry_upload_authority.sql",
);

const {
  hashPublicInquiryUploadCapability,
  parsePublicInquiryUploadIntent,
  publicInquiryUploadCapabilityMatches,
} = await import(pathToFileURL(resolve(repositoryRoot, "lib/crm/intake-upload.ts")).href);
const { intakeUploadSignatureMatches } = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/crm/intake-upload-signature.ts")).href
);
const { buildPublicIntakeQuarantineObjectKey } = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/storage/object-key.ts")).href
);

test("public upload capabilities are exact, hashed, and bound to validated intent", () => {
  const capabilityToken = `iatb_${"a".repeat(64)}`;
  const intent = parsePublicInquiryUploadIntent({
    formKey: `ifm_${"b".repeat(64)}`,
    idempotencyKey: "upload.web.20260716.0001",
    capabilityToken,
    filename: "Reference Film.MP4",
    mimeType: "video/mp4",
    size: 42_000_000,
    expectedSha256: "c".repeat(64),
  });
  assert.equal(intent.capabilityToken, capabilityToken);
  assert.equal(intent.mimeType, "video/mp4");
  const capabilityHash = hashPublicInquiryUploadCapability(capabilityToken);
  assert.match(capabilityHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    publicInquiryUploadCapabilityMatches(capabilityToken, capabilityHash),
    true,
  );
  assert.equal(
    publicInquiryUploadCapabilityMatches(`iatb_${"d".repeat(64)}`, capabilityHash),
    false,
  );
  assert.throws(
    () => parsePublicInquiryUploadIntent({ ...intent, capabilityToken: "unsafe" }),
    /capability/i,
  );
});

test("declared MIME signatures are checked before intake bytes are accepted", () => {
  assert.equal(
    intakeUploadSignatureMatches(
      "image/png",
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    true,
  );
  assert.equal(
    intakeUploadSignatureMatches(
      "application/pdf",
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
    ),
    false,
  );
  assert.equal(
    intakeUploadSignatureMatches(
      "video/mp4",
      Uint8Array.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]),
    ),
    true,
  );
});

test("public intake objects use a dedicated opaque quarantine namespace", () => {
  const objectKey = buildPublicIntakeQuarantineObjectKey({
    formKeyHash: "e".repeat(64),
    objectId: "12000000-0000-4000-8000-000000000001",
    version: 1,
    filename: "../Client Reference.MP4",
  });
  assert.match(
    objectKey,
    /^intake-quarantine\/forms\/f-[0-9a-f]{32}\/uploads\/u-[0-9a-f]{20}\/v00000001\//,
  );
  assert.equal(objectKey.includes("12000000-0000-4000-8000-000000000001"), false);
  assert.equal(objectKey.includes(".."), false);
});

test("public TUS routes require same-origin capability authority and never release originals", () => {
  assert.match(sharedRoute, /isSameOriginPublicIntake\(request\)/);
  assert.match(sharedRoute, /getSupabaseDataSchema\(\) !== "co_production"/);
  assert.match(sharedRoute, /x-intake-upload-capability/i);
  assert.match(baseRoute, /begin_public_inquiry_upload/);
  assert.match(baseRoute, /bind_public_inquiry_upload_session/);
  assert.match(baseRoute, /publicIntakeRequestFingerprint\(request\)/);
  assert.match(uploadRoute, /validateIntakeUploadSignature/);
  assert.match(uploadRoute, /PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES/);
  assert.match(uploadRoute, /"Upload-Original-Ready": "false"/);
  assert.match(uploadRoute, /"Upload-Derivative-State": "blocked"/);
  assert.match(uploadRoute, /cancel_public_inquiry_upload/);
  assert.doesNotMatch(baseRoute + uploadRoute, /requireStaff|catalogAsset|createAsset/i);
});

test("orchestrator places public uploads without catalog or derivative authority", () => {
  assert.match(orchestrator, /scopeKind: "public-intake"/);
  assert.match(orchestrator, /buildPublicIntakeQuarantineObjectKey/);
  assert.match(orchestrator, /originalReady: false/);
  assert.match(orchestrator, /derivativeState: "blocked"/);
  assert.match(orchestrator, /if \(session\.scopeKind === "public-intake"\) return;/);
});

test("database authority is immutable, tenant-scoped, replay-safe, and atomically bound", () => {
  assert.match(migration, /CREATE TABLE co_production\.public_inquiry_attachment_batches/);
  assert.match(migration, /CREATE TABLE co_production\.public_inquiry_uploads/);
  assert.match(migration, /UNIQUE \(intake_form_id, idempotency_key\)/);
  assert.match(migration, /capability_hash text NOT NULL CHECK \(capability_hash ~ '\^sha256:/);
  assert.doesNotMatch(migration, /capability_token|batch_token text/i);
  assert.match(migration, /request_fingerprint IS DISTINCT FROM p_request_fingerprint/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /has_team_role\(team_id, 70\)/);
  assert.match(migration, /public_inquiry_uploads_no_delete/);
  assert.match(migration, /public_inquiry_uploads_no_truncate/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.submit_public_inquiry\([\s\S]*p_attachment_claim jsonb[\s\S]*SECURITY DEFINER/,
  );
  assert.match(migration, /FOR UPDATE;[\s\S]*upload_state NOT IN \('quarantined', 'committed', 'bound'\)/);
  assert.match(migration, /upload_state = 'bound', bound_inquiry_id = v_inquiry\.id/);
  assert.match(migration, /status = 'consumed', consumed_inquiry_id = v_inquiry\.id/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION co_production\.submit_public_inquiry\(/);
});
