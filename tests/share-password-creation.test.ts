import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stub(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const accessStubUrl = stub(`
  export async function getAssetAccess() {
    throw new Error("not used by share creation tests");
  }
`);

const tokenStubUrl = stub(`
  export function persistedOpaqueTokenFields(token) {
    return { token_hash: "token-hash:" + token.length, token_ciphertext: "token-ciphertext" };
  }

  export function recoverOpaqueToken() {
    return "recovered-token";
  }

  export function withoutPersistedTokenSecrets(row) {
    const safe = { ...row };
    delete safe.token_hash;
    delete safe.token_ciphertext;
    return safe;
  }
`);

const passwordStubUrl = stub(`
  export async function hashReviewPassword(password) {
    globalThis.__ccoPasswordHashCalls.push(password);
    if (globalThis.__ccoPasswordHashFailure) throw new Error("hash unavailable");
    return "scrypt-test$" + password.length;
  }
`);

const versionStubUrl = stub(`
  export async function resolveAssetVersion({ versionId }) {
    return {
      ok: true,
      version: { id: versionId, version_number: 4, is_current: true },
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/security/opaque-token") return nextResolve(tokenStubUrl, context);
    if (specifier === "@/lib/security/review-password") return nextResolve(passwordStubUrl, context);
    if (specifier === "@/lib/versions") return nextResolve(versionStubUrl, context);
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type PasswordTestState = typeof globalThis & {
  __ccoPasswordHashCalls: string[];
  __ccoPasswordHashFailure: boolean;
};

const state = globalThis as PasswordTestState;
const shareModal = readFileSync(
  resolve(repositoryRoot, "components/sharing/ShareModal.tsx"),
  "utf8",
);

function preparedItem({
  assetId,
  versionId,
  password,
}: {
  assetId: string;
  versionId: string;
  password: string | null;
}) {
  return {
    assetId,
    versionId,
    shareIntent: "client_review",
    policy: {
      id: "standard-review",
      label: "Standard review",
      intents: ["client_review"],
      allowedPermissions: ["comment"],
      maxExpiryDays: 30,
      maxItems: 20,
      requireRecipientEmail: false,
      watermarkRule: "optional",
      downloadRule: "optional",
      auditRetentionDays: 365,
      tenantId: "tenant-a",
    },
    recipient: {
      name: "Reviewer",
      email: "reviewer@example.test",
      phone: null,
      imessageHandle: null,
    },
    permissions: "comment",
    expiresAt: "2026-07-20T18:00:00.000Z",
    watermarkEnabled: false,
    watermarkText: null,
    downloadEnabled: false,
    maxViews: null,
    password,
    asset: { id: assetId, title: `Asset ${assetId}`, project_id: "project-a" },
    version: {
      id: versionId,
      asset_id: assetId,
      version_number: 4,
      file_url: "https://media.example.test/video.mp4",
      file_size: null,
      duration_seconds: null,
      resolution: null,
      frame_rate: null,
      uploaded_by: null,
      created_at: "2026-07-15T00:00:00.000Z",
      is_current: true,
    },
    approvalRoute: null,
  };
}

function preparedManifest(passwords: Array<string | null>) {
  return {
    operation: "create",
    manifestId: "share-request-0001",
    tenantId: "tenant-a",
    notification: null,
    items: passwords.map((password, index) =>
      preparedItem({
        assetId: `asset-${index + 1}`,
        versionId: `version-${index + 1}`,
        password,
      }),
    ),
  };
}

function creationClient() {
  const capture = { inviteRows: [] as Row[], auditRows: [] as Row[] };
  const client = {
    from(table: string) {
      if (table === "review_invites") {
        return {
          insert(rows: Row[]) {
            capture.inviteRows = rows;
            return {
              async select() {
                return {
                  data: rows.map((row, index) => ({
                    ...row,
                    id: `invite-${index + 1}`,
                    view_count: 0,
                    last_viewed_at: null,
                    created_at: "2026-07-15T00:00:00.000Z",
                  })),
                  error: null,
                };
              },
            };
          },
        };
      }
      if (table === "activity_log") {
        return {
          insert(rows: Row[]) {
            capture.auditRows = rows;
            return {
              async select() {
                return {
                  data: [{ id: "receipt-a", action: "share_manifest_created" }],
                  error: null,
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return { client, capture };
}

test.beforeEach(() => {
  state.__ccoPasswordHashCalls = [];
  state.__ccoPasswordHashFailure = false;
});

test("share previews disclose only whether a password is required", async () => {
  const { previewPreparedShareManifest } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/sharing/share-service.ts")).href
  );
  const preview = previewPreparedShareManifest(
    preparedManifest(["correct horse battery staple", null]) as never,
  );
  const serialized = JSON.stringify(preview);

  assert.deepEqual(
    preview.items.map((item: Row) => item.password_protected),
    [true, false],
  );
  assert.doesNotMatch(serialized, /correct horse battery staple|password_hash|scrypt-test/);
});

test("share creation hashes plaintext before insertion and keeps audits boolean-only", async () => {
  const { createPreparedShareManifest } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/sharing/share-service.ts")).href
  );
  const { client, capture } = creationClient();
  const result = await createPreparedShareManifest({
    manifest: preparedManifest(["correct horse battery staple", null]) as never,
    manifestFingerprint: "fingerprint-a",
    client: client as never,
    actor: { id: "user-a", name: "Operator" },
    now: new Date("2026-07-15T00:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(state.__ccoPasswordHashCalls, ["correct horse battery staple"]);
  assert.deepEqual(
    capture.inviteRows.map((row) => row.password_hash),
    ["scrypt-test$28", null],
  );
  assert.doesNotMatch(JSON.stringify(capture.inviteRows), /correct horse battery staple/);
  assert.doesNotMatch(JSON.stringify(capture.auditRows), /correct horse battery staple|scrypt-test|password_hash/);
  assert.deepEqual(
    capture.auditRows.slice(0, 2).map((row) => (row.details as Row).password_protected),
    [true, false],
  );
  if (result.ok) {
    assert.deepEqual(
      result.items.map((item: Row) => item.password_protected),
      [true, false],
    );
    assert.doesNotMatch(JSON.stringify(result), /password_hash|scrypt-test/);
  }
});

test("password hashing failure is fail-closed before invite insertion", async () => {
  const { createPreparedShareManifest } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/sharing/share-service.ts")).href
  );
  const { client, capture } = creationClient();
  state.__ccoPasswordHashFailure = true;

  const result = await createPreparedShareManifest({
    manifest: preparedManifest(["correct horse battery staple"]) as never,
    manifestFingerprint: "fingerprint-a",
    client: client as never,
    actor: { id: "user-a", name: "Operator" },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(capture.inviteRows, []);
  assert.deepEqual(capture.auditRows, []);
  if (!result.ok) assert.match(result.error, /no links were created/);
});

test("recovery and rotation preserve only the stored password hash", () => {
  const service = readFileSync(
    resolve(repositoryRoot, "lib/sharing/share-service.ts"),
    "utf8",
  );

  assert.match(service, /password_hash: existing\.data\.password_hash \?\? null/);
  assert.match(service, /password_protected: Boolean\(row\.password_hash\)/);
  assert.match(service, /password_protected: Boolean\(existing\.data\.password_hash\)/);
  assert.match(service, /delete safe\.password_hash/);
});

test("the existing share modal adds a restrained optional password control", () => {
  assert.match(shareModal, /Require password/);
  assert.match(shareModal, /type="password"/);
  assert.match(shareModal, /minLength=\{SHARE_PASSWORD_MIN_LENGTH\}/);
  assert.match(shareModal, /maxLength=\{SHARE_PASSWORD_MAX_LENGTH\}/);
  assert.match(shareModal, /password: requirePassword \? password : null/);
  assert.match(shareModal, /password_protected: requirePassword/);
  assert.doesNotMatch(shareModal, /password_hash/);
});
