import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const admissionAuthorityStub = dataModule(`
  export async function authorizeAdmittedReviewInvite() {
    return {
      ok: true,
      claims: {
        admissionId: "11111111-1111-4111-8111-111111111111",
        inviteId: "22222222-2222-4222-8222-222222222222",
        assetId: "33333333-3333-4333-8333-333333333333",
        versionId: "44444444-4444-4444-8444-444444444444",
        issuedAt: 1,
        expiresAt: 2,
        admissionExpiresAt: 3
      },
      setCookie: "__Host-ccorp_review_admission_11111111111141118111111111111111=renewed; Path=/; Secure; HttpOnly; SameSite=Strict",
      invite: {
        id: "invite-a",
        asset_id: "asset-a",
        version_id: "version-a",
        reviewer_name: "External reviewer",
        reviewer_email: "reviewer@example.test",
        permissions: "comment",
        expires_at: null,
        watermark_enabled: false,
        watermark_text: null,
        download_enabled: true,
        view_count: 1,
        max_views: 1,
        assets: {
          id: "asset-a",
          title: "Launch film",
          file_type: "video",
          file_url: "/internal/stale-reference",
          status: "in_review",
          projects: { id: "project-a", name: "Launch" },
          nas_path: "tenants/private/provider/object.mov",
          metadata: { upload: { storage_provider: "ccnas" } },
          uploaded_by: "private-user-id",
          deleted_at: null
        }
      }
    };
  }
`);

const reviewInvitesStub = dataModule(`
  export function getExternalApprovalState() {
    return {
      approvals: [],
      activeApprovalIds: [],
      approvalAccessMessage: null
    };
  }
`);

const versionsStub = dataModule(`
  export async function resolveAssetVersion() {
    return {
      ok: true,
      version: {
        id: "version-a",
        asset_id: "asset-a",
        version_number: 1,
        file_url: "/api/media/versions/version-a",
        file_size: 12,
        thumbnail_url: "https://private-provider.example/thumb.jpg",
        duration_seconds: 2,
        resolution: "1920x1080",
        is_current: true,
        notes: "INTERNAL EDITORIAL NOTE",
        uploaded_by: "private-user-id",
        created_at: "2026-07-26T00:00:00.000Z"
      }
    };
  }
`);

const sharingStub = dataModule(`
  export function deriveShareIntent() {
    return "client_review";
  }
`);

const supabaseStub = dataModule(`
  const publishedHlsMetadata = {
    media_pipeline: {
      schemaVersion: 1,
      currentVersionId: "44444444-4444-4444-8444-444444444444",
      versions: {
        "44444444-4444-4444-8444-444444444444": {
          schemaVersion: 1,
          pipelineVersion: "co-deliver-media-pipeline/v1",
          status: "published",
          versionId: "44444444-4444-4444-8444-444444444444",
          probe: { frameRate: 24000 / 1001 },
          artifacts: {
            hls: {
              playlist: {
                kind: "hls_playlist",
                objectKey: "private-hls/playlist/playlist.m3u8",
                filename: "playlist.m3u8",
                contentType: "application/vnd.apple.mpegurl",
                size: 100,
                sha256: "a".repeat(64),
                provider: "local",
                providerVersionId: "fs-v1:" + "a".repeat(64)
              },
              segments: [{
                kind: "hls_segment",
                objectKey: "private-hls/segment/segment000.ts",
                filename: "segment000.ts",
                contentType: "video/mp2t",
                size: 1000,
                sha256: "b".repeat(64),
                provider: "local",
                providerVersionId: "fs-v1:" + "b".repeat(64)
              }],
              manifest: {
                kind: "hls_manifest",
                objectKey: "private-hls/manifest/hls-manifest.json",
                filename: "hls-manifest.json",
                contentType: "application/json",
                size: 200,
                sha256: "c".repeat(64),
                provider: "local",
                providerVersionId: "fs-v1:" + "c".repeat(64)
              }
            }
          }
        }
      }
    }
  };
  const privateComment = {
    id: "comment-a",
    review_id: "review-private",
    review_invite_id: "invite-private",
    asset_id: "asset-a",
    version_id: "version-a",
    parent_id: null,
    author_name: "External reviewer",
    author_email: "reviewer-private@example.test",
    author_id: "private-user-id",
    body: "Please tighten this frame.",
    rich_body: "<img src=x onerror=globalThis.__storedReviewXss=true>",
    timecode_seconds: 1.25,
    frame_number: 30,
    pin_x: 0.4,
    pin_y: 0.6,
    mentions: ["private-user-id"],
    status: "open",
    visibility: "external",
    resolved_by: "private-resolver-id",
    resolved_at: "2026-07-26T00:02:00.000Z",
    created_at: "2026-07-26T00:01:00.000Z",
    updated_at: "2026-07-26T00:01:00.000Z"
  };

  const imageAttachment = {
    id: "attachment-a",
    comment_id: "comment-a",
    file_url: "storage://comment-attachments/owner-a/project-a/asset-a/comment-a/reference-a?sha256=private",
    file_name: "reference.png",
    file_type: "image/png",
    file_size: 12,
    created_at: "2026-07-26T00:01:30.000Z",
    storage_bucket: "comment-attachments",
    storage_path: "owner-a/project-a/asset-a/comment-a/reference-a"
  };

  const privateEditDecision = {
    id: "decision-a",
    asset_id: "asset-a",
    version_id: "version-a",
    review_invite_id: "invite-private",
    created_by_name: "External reviewer",
    decision_type: "cut",
    source: "manual",
    status: "proposed",
    start_seconds: 1.25,
    end_seconds: null,
    label: "Trim this frame",
    confidence: null,
    client_request_id: "private-request-id",
    created_at: "2026-07-26T00:01:00.000Z",
    updated_at: "2026-07-26T00:01:00.000Z"
  };

  class Query {
    constructor(table) {
      this.table = table;
    }
    select() { return this; }
    eq() { return this; }
    in() { return this; }
    or() { return this; }
    order() { return this; }
    update() { return this; }
    async maybeSingle() {
      return {
        data: this.table === "approval_workflows"
          ? { id: "workflow-a", mode: "parallel", status: "active" }
          : this.table === "assets"
            ? {
                id: "33333333-3333-4333-8333-333333333333",
                metadata: publishedHlsMetadata
              }
            : this.table === "projects"
              ? { id: "project-a", owner_id: "owner-a" }
            : null,
        error: null
      };
    }
    then(resolve, reject) {
      return Promise.resolve({
        data: this.table === "comments"
          ? [privateComment]
          : this.table === "comment_attachments"
            ? [imageAttachment]
          : this.table === "edit_decisions"
            ? [privateEditDecision]
            : [],
        error: null
      }).then(resolve, reject);
    }
  }

  export function getSupabase() {
    return {
      from(table) {
        return new Query(table);
      },
      storage: {
        from() {
          return {
            async createSignedUrl(path) {
              return { data: { signedUrl: "https://signed.example/" + path }, error: null };
            }
          };
        }
      }
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (specifier === "@/lib/review-invites") {
      return nextResolve(reviewInvitesStub, context);
    }
    if (specifier === "@/lib/media-pipeline/hls-delivery") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "lib/media-pipeline/hls-delivery.ts"),
        ).href,
        context,
      );
    }
    if (specifier === "@/lib/review/admission-authority") {
      return nextResolve(admissionAuthorityStub, context);
    }
    if (specifier === "@/lib/review/request-boundary") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "lib/review/request-boundary.ts"),
        ).href,
        context,
      );
    }
    if (specifier === "@/lib/review/responses") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/review/responses.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/versions") {
      return nextResolve(versionsStub, context);
    }
    if (specifier === "@/lib/sharing/share-intent") {
      return nextResolve(sharingStub, context);
    }
    if (specifier === "@/lib/review/external-comment") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "lib/review/external-comment.ts"),
        ).href,
        context,
      );
    }
    if (specifier === "@/lib/review/annotation-persistence") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "lib/review/annotation-persistence.ts"),
        ).href,
        context,
      );
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStub, context);
    }
    if (specifier === "@/lib/comments/image-attachments") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "lib/comments/image-attachments.ts"),
        ).href,
        context,
      );
    }
    if (specifier === "@/lib/api/responses") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/api/responses.ts")).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

test("anonymous review payload exposes only the external-safe asset projection", async () => {
  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/route.ts")).href
  );
  const response = await GET(
    new Request("https://client.contentco-op.com/api/review/opaque-token"),
    { params: Promise.resolve({ token: "opaque-token" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.match(response.headers.get("set-cookie") ?? "", /renewed/);
  const payload = await response.json();
  assert.deepEqual(payload.asset, {
    id: "asset-a",
    title: "Launch film",
    file_type: "video",
    file_url:
      "/api/review/media/11111111-1111-4111-8111-111111111111/hls/playlist.m3u8",
    status: "in_review",
    frame_rate: 24000 / 1001,
    projects: { id: "project-a", name: "Launch" },
  });
  assert.deepEqual(payload.version, {
    id: "version-a",
    asset_id: "asset-a",
    version_number: 1,
    file_url:
      "/api/review/media/11111111-1111-4111-8111-111111111111/hls/playlist.m3u8",
    file_size: 12,
    thumbnail_url: null,
    duration_seconds: 2,
    resolution: "1920x1080",
    is_current: true,
    created_at: "2026-07-26T00:00:00.000Z",
  });
  assert.deepEqual(payload.comments, [{
    id: "comment-a",
    asset_id: "asset-a",
    version_id: "version-a",
    parent_id: null,
    author_name: "External reviewer",
    body: "Please tighten this frame.",
    timecode_seconds: 1.25,
    frame_number: 30,
    pin_x: 0.4,
    pin_y: 0.6,
    status: "open",
    visibility: "external",
    created_at: "2026-07-26T00:01:00.000Z",
    updated_at: "2026-07-26T00:01:00.000Z",
    attachments: [{
      id: "attachment-a",
      comment_id: "comment-a",
      file_url: "https://signed.example/owner-a/project-a/asset-a/comment-a/reference-a",
      file_name: "reference.png",
      file_type: "image/png",
      file_size: 12,
      created_at: "2026-07-26T00:01:30.000Z",
      url_expires_at: payload.comments[0].attachments?.[0]?.url_expires_at,
    }],
  }]);
  assert.deepEqual(payload.edit_decisions, [{
    id: "decision-a",
    asset_id: "asset-a",
    version_id: "version-a",
    created_by_name: "External reviewer",
    decision_type: "cut",
    source: "manual",
    status: "proposed",
    start_seconds: 1.25,
    end_seconds: null,
    label: "Trim this frame",
    confidence: null,
    created_at: "2026-07-26T00:01:00.000Z",
    updated_at: "2026-07-26T00:01:00.000Z",
  }]);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /nas_path|metadata|storage_provider|private-hls|private-user-id|private-resolver-id|private-request-id|review-private|invite-private|reviewer-private@example\.test|INTERNAL EDITORIAL NOTE|uploaded_by|author_email|author_id|resolved_by|resolved_at|review_invite_id|client_request_id|rich_body|mentions|storedReviewXss|onerror|private-provider\.example|\/api\/media\/versions/,
  );
  assert.equal(
    payload.download_url,
    "/api/review/media/11111111-1111-4111-8111-111111111111?download=1",
  );
  assert.equal(payload.invite.view_count, 1);
  assert.equal(payload.invite.max_views, 1);
});
