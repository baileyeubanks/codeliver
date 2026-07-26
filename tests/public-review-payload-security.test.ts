import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const reviewInvitesStub = dataModule(`
  export async function getReviewInviteByToken() {
    return {
      ok: true,
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
        download_enabled: false,
        view_count: 0,
        max_views: null,
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
        thumbnail_url: null,
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
    or() { return this; }
    order() { return this; }
    update() { return this; }
    async maybeSingle() {
      return {
        data: this.table === "approval_workflows"
          ? { id: "workflow-a", mode: "parallel", status: "active" }
          : null,
        error: null
      };
    }
    then(resolve, reject) {
      return Promise.resolve({
        data: this.table === "comments"
          ? [privateComment]
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
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStub, context);
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
  const payload = await response.json();
  assert.deepEqual(payload.asset, {
    id: "asset-a",
    title: "Launch film",
    file_type: "video",
    file_url: "/api/media/versions/version-a",
    status: "in_review",
    projects: { id: "project-a", name: "Launch" },
  });
  assert.deepEqual(payload.version, {
    id: "version-a",
    asset_id: "asset-a",
    version_number: 1,
    file_url: "/api/media/versions/version-a",
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
    /nas_path|metadata|storage_provider|private-user-id|private-resolver-id|private-request-id|review-private|invite-private|reviewer-private@example\.test|INTERNAL EDITORIAL NOTE|uploaded_by|author_email|author_id|resolved_by|resolved_at|review_invite_id|client_request_id|rich_body|mentions|storedReviewXss|onerror/,
  );
});
