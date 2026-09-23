import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

/* Review-route stubs: the invite pins version-a; the supabase fake answers
 * from globalThis.__ccoClientSurfaceTables so each test controls the lock
 * state. */
const admissionAuthorityStub = dataModule(`
  export async function authorizeAdmittedReviewInvite() {
    return globalThis.__ccoClientSurfaceAdmission ?? {
      ok: true,
      claims: {
        admissionId: "11111111-1111-4111-8111-111111111111",
        inviteId: "22222222-2222-4222-8222-222222222222",
        assetId: "asset-a",
        versionId: "version-a",
        issuedAt: 1,
        expiresAt: 2,
        admissionExpiresAt: 3
      },
      setCookie: "__Host-ccorp_review_admission_x=renewed; Path=/; Secure; HttpOnly; SameSite=Strict",
      invite: {
        id: "invite-a",
        asset_id: "asset-a",
        version_id: "version-a",
        approval_workflow_id: "workflow-a",
        approval_id: "approval-a",
        reviewer_name: "External reviewer",
        reviewer_email: "reviewer@example.test",
        permissions: "approve",
        expires_at: null,
        watermark_enabled: false,
        watermark_text: null,
        download_enabled: true,
        view_count: 1,
        max_views: null,
        assets: {
          id: "asset-a",
          title: "Launch film",
          file_type: "video",
          file_url: "/internal/reference",
          status: "approved",
          projects: { id: "project-a", name: "Launch" }
        }
      }
    };
  }

  export async function reserveReviewActionRate() {
    return { ok: true };
  }
`);

const reviewInvitesStub = dataModule(`
  export function getExternalApprovalState() {
    return { approvals: [], activeApprovalIds: [], approvalAccessMessage: null };
  }

  export function inviteCanApprove() {
    return true;
  }

  export function canInviteDecideApproval({ approvalId }) {
    return {
      ok: true,
      approval: {
        id: approvalId,
        asset_id: "asset-a",
        workflow_id: "workflow-a",
        role_label: "Client approver",
        status: "pending"
      }
    };
  }
`);

const approvalDecisionsStub = dataModule(`
  export async function recordApprovalDecision({ approvalId }) {
    globalThis.__ccoClientSurfaceApprovalWrites =
      (globalThis.__ccoClientSurfaceApprovalWrites ?? 0) + 1;
    return {
      ok: true,
      data: { id: approvalId, status: "approved" },
      assetStatus: "approved"
    };
  }
`);

const demoReviewStub = dataModule(`
  export const demoReviewPayload = {
    asset: { id: "demo-asset", status: "in_review" },
    invite: { id: "demo-invite", view_count: 0, max_views: null },
    approvals: [],
    reviewer_name: "Demo reviewer",
    reviewer_email: "demo@example.test",
    permissions: "approve",
    expires_at: null,
    watermark_enabled: false,
    watermark_text: null,
    download_enabled: false,
    workflow_mode: null
  };
`);

const versionsStub = dataModule(`
  export async function resolveAssetVersion() {
    return {
      ok: true,
      version: {
        id: "version-a",
        asset_id: "asset-a",
        version_number: 3,
        file_url: "/api/media/versions/version-a",
        file_size: 12,
        duration_seconds: 2,
        resolution: "1920x1080",
        is_current: true,
        created_at: "2026-07-26T00:00:00.000Z"
      }
    };
  }
`);

const sharingStub = dataModule(`
  export function deriveShareIntent() {
    return "final_delivery";
  }
`);

const supabaseStub = dataModule(`
  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
    }
    select() { return this; }
    eq(column, value) { this.filters.push({ column, value }); return this; }
    in(column, values) { this.filters.push({ column, values }); return this; }
    or() { return this; }
    order() { return this; }
    async maybeSingle() {
      if (this.table === "projects") {
        return { data: { id: "project-a", owner_id: "owner-a" }, error: null };
      }
      const tables = globalThis.__ccoClientSurfaceTables ?? {};
      const rows = this.matching(tables[this.table] ?? []);
      return {
        data: rows.length === 1 ? rows[0] : null,
        error: (globalThis.__ccoClientSurfaceErrors ?? {})[this.table]
          ? { message: "private failure" }
          : null,
      };
    }
    matching(rows) {
      return rows.filter((row) =>
        this.filters.every((filter) =>
          filter.values
            ? filter.values.includes(row[filter.column])
            : row[filter.column] === filter.value,
        ),
      );
    }
    then(resolve, reject) {
      const tables = globalThis.__ccoClientSurfaceTables ?? {};
      globalThis.__ccoClientSurfaceQueries = [
        ...(globalThis.__ccoClientSurfaceQueries ?? []),
        { table: this.table, filters: this.filters }
      ];
      return Promise.resolve({
        data: this.matching(tables[this.table] ?? []),
        error: (globalThis.__ccoClientSurfaceErrors ?? {})[this.table]
          ? { message: "private failure" }
          : null
      }).then(resolve, reject);
    }
  }

  export function getSupabase() {
    return { from(table) { return new Query(table); } };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/approval-decisions") {
      return nextResolve(approvalDecisionsStub, context);
    }
    if (specifier === "@/lib/review/demoReview") {
      return nextResolve(demoReviewStub, context);
    }
    if (specifier === "@/lib/delivery/lock") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/delivery/lock.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/api/backend") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/api/backend.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/review-invites") return nextResolve(reviewInvitesStub, context);
    if (specifier === "@/lib/media-pipeline/hls-delivery") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "lib/media-pipeline/hls-delivery.ts"),
        ).href,
        context,
      );
    }
    if (specifier === "@/lib/media-pipeline/hls-playback-url") {
      return nextResolve(
        pathToFileURL(
          resolve(repositoryRoot, "lib/media-pipeline/hls-playback-url.ts"),
        ).href,
        context,
      );
    }
    if (specifier === "@/lib/review/admission-authority") {
      return nextResolve(admissionAuthorityStub, context);
    }
    if (specifier === "@/lib/review/request-boundary") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/review/request-boundary.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/review/responses") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/review/responses.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/versions") return nextResolve(versionsStub, context);
    if (specifier === "@/lib/sharing/share-intent") return nextResolve(sharingStub, context);
    if (specifier === "@/lib/review/annotation-persistence") {
      return nextResolve(pathToFileURL(resolve(repositoryRoot, "lib/review/annotation-persistence.ts")).href, context);
    }
    if (specifier === "@/lib/review/external-comment") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/review/external-comment.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/comments/image-attachments") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/comments/image-attachments.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStub, context);
    if (specifier === "@/lib/api/responses") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/api/responses.ts")).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

type ClientSurfaceGlobal = typeof globalThis & {
  __ccoClientSurfaceAdmission?: Record<string, unknown>;
  __ccoClientSurfaceApprovalWrites: number;
  __ccoClientSurfaceErrors: Record<string, string>;
  __ccoClientSurfaceQueries: Array<Record<string, unknown>>;
  __ccoClientSurfaceTables: Record<string, Array<Record<string, unknown>>>;
};

const state = globalThis as ClientSurfaceGlobal;

async function reviewRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/route.ts")).href
  );
}

async function approvalRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/approvals/route.ts")).href
  );
}

function getReviewPayload() {
  return reviewRoute().then(({ GET }) =>
    GET(new Request("https://client.contentco-op.com/api/review/opaque-token"), {
      params: Promise.resolve({ token: "opaque-token" }),
    }),
  );
}

async function patchReviewApproval() {
  const { PATCH } = await approvalRoute();
  return PATCH(
    new Request("https://client.contentco-op.com/api/review/opaque-token/approvals", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://client.contentco-op.com",
      },
      body: JSON.stringify({
        id: "approval-a",
        version_id: "version-a",
        status: "approved",
        reviewer_name: "External reviewer",
      }),
    }),
    { params: Promise.resolve({ token: "opaque-token" }) },
  );
}

const lockedAt = "2026-08-11T12:00:00.000Z";
const checksum = "f".repeat(64);

/* ── review token JSON ─────────────────────────────────────────────────── */

test("a review pinned to a locked delivery exposes the lock and checksum", async () => {
  state.__ccoClientSurfaceErrors = {};
  state.__ccoClientSurfaceTables = {
    deliverable_items: [
      { deliverable_id: "deliverable-a", asset_id: "asset-a", version_id: "version-a", sha256: checksum },
    ],
    deliverables: [
      { id: "deliverable-a", status: "delivered", locked_at: lockedAt },
    ],
  };

  const response = await getReviewPayload();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.delivery, {
    locked: true,
    locked_at: lockedAt,
    sha256: checksum,
  });
});

test("a review outside any locked delivery exposes delivery null", async () => {
  state.__ccoClientSurfaceErrors = {};
  state.__ccoClientSurfaceTables = {
    deliverable_items: [
      { deliverable_id: "deliverable-a", asset_id: "asset-a", version_id: "version-a", sha256: checksum },
    ],
    deliverables: [{ id: "deliverable-a", status: "ready", locked_at: null }],
  };

  const response = await getReviewPayload();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.delivery, null);
});

test("a failed delivery lookup fails the review read closed", async () => {
  state.__ccoClientSurfaceErrors = { deliverable_items: "private failure" };
  state.__ccoClientSurfaceTables = {};

  const response = await getReviewPayload();
  assert.equal(response.status, 503);
});

/* ── review page badge (render contract) ───────────────────────────────── */

test("the public review page renders the locked badge and checksum for locked deliveries", () => {
  const page = source("components/review/PublicReviewPage.tsx");
  assert.match(page, /delivery\?:\s*\{/);
  assert.match(page, /delivery\?\.locked/);
  assert.match(page, /Locked final delivery/);
  assert.match(page, /sha256/);

  const approvalLockDerivation =
    page.match(/const approvalLocked = Boolean\([\s\S]*?\n  \);/)?.[0] ?? "";
  assert.match(
    approvalLockDerivation,
    /delivery\?\.locked/,
    "a real locked delivery must make the approval panel terminal",
  );
});

test("public approval writes reject a locked admitted asset before the decision write", async () => {
  state.__ccoClientSurfaceAdmission = undefined;
  state.__ccoClientSurfaceApprovalWrites = 0;
  state.__ccoClientSurfaceErrors = {};
  state.__ccoClientSurfaceQueries = [];
  state.__ccoClientSurfaceTables = {
    deliverable_items: [
      {
        deliverable_id: "deliverable-a",
        asset_id: "asset-a",
        version_id: "version-locked",
      },
    ],
    deliverables: [{ id: "deliverable-a", locked_at: lockedAt }],
  };

  const response = await patchReviewApproval();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "ASSET_LOCKED");
  assert.equal(state.__ccoClientSurfaceApprovalWrites, 0);
  const assetLockLookup = state.__ccoClientSurfaceQueries.find(
    (query) => query.table === "deliverable_items",
  );
  assert.equal(
    JSON.stringify(assetLockLookup?.filters),
    JSON.stringify([{ column: "asset_id", values: ["asset-a"] }]),
    "the admitted invite asset, not a caller-supplied asset or version, owns the terminal lock",
  );
});

test("public approval writes remain available when the admitted asset is unlocked", async () => {
  state.__ccoClientSurfaceAdmission = undefined;
  state.__ccoClientSurfaceApprovalWrites = 0;
  state.__ccoClientSurfaceErrors = {};
  state.__ccoClientSurfaceQueries = [];
  state.__ccoClientSurfaceTables = {
    deliverable_items: [
      { deliverable_id: "deliverable-a", asset_id: "asset-a", version_id: "version-a" },
    ],
    deliverables: [{ id: "deliverable-a", locked_at: null }],
    approval_workflows: [{
      id: "workflow-a",
      asset_id: "asset-a",
      version_id: "version-a",
      mode: "sequential",
      status: "active",
    }],
    approvals: [{
      id: "approval-a",
      asset_id: "asset-a",
      version_id: "version-a",
      workflow_id: "workflow-a",
      status: "pending",
    }],
  };

  const response = await patchReviewApproval();
  assert.equal(response.status, 200);
  assert.equal(state.__ccoClientSurfaceApprovalWrites, 1);
});

test("public approval writes fail closed when delivery lock state is unavailable", async () => {
  state.__ccoClientSurfaceAdmission = undefined;
  state.__ccoClientSurfaceApprovalWrites = 0;
  state.__ccoClientSurfaceErrors = { deliverable_items: "private failure" };
  state.__ccoClientSurfaceQueries = [];
  state.__ccoClientSurfaceTables = {};

  const response = await patchReviewApproval();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "REVIEW_SERVICE_UNAVAILABLE");
  assert.equal(state.__ccoClientSurfaceApprovalWrites, 0);
});

test("public approval authorization rejects before delivery lock lookup", async () => {
  state.__ccoClientSurfaceAdmission = {
    ok: false,
    status: 403,
    code: "REVIEW_ADMISSION_REQUIRED",
  };
  state.__ccoClientSurfaceApprovalWrites = 0;
  state.__ccoClientSurfaceErrors = {};
  state.__ccoClientSurfaceQueries = [];
  state.__ccoClientSurfaceTables = {};

  const response = await patchReviewApproval();
  assert.equal(response.status, 403);
  assert.equal(state.__ccoClientSurfaceQueries.length, 0);
  assert.equal(state.__ccoClientSurfaceApprovalWrites, 0);
  state.__ccoClientSurfaceAdmission = undefined;
});

/* ── portal projections ────────────────────────────────────────────────── */

test("recentDeliveries marks locked delivery records and carries their checksum", async () => {
  const { recentDeliveries } = await import("../lib/portal/views.ts");
  const deliveries = recentDeliveries({
    deliverables: [
      {
        id: "del-locked",
        project_id: "ica",
        name: "MASTER_16x9.mov",
        spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9" },
        status: "delivered",
        delivered_at: "2026-08-11T12:00:00.000Z",
        locked_at: lockedAt,
        items: [{ asset_id: "a1", version_id: "v1", sha256: checksum }],
      },
      {
        id: "del-legacy",
        project_id: "ica",
        name: "LEGACY_16x9.mov",
        spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9" },
        status: "delivered",
        delivered_at: "2026-08-10T12:00:00.000Z",
      },
    ],
    assets: [],
  });

  const locked = deliveries.find((delivery) => delivery.id === "del-locked");
  assert.equal(locked?.locked, true);
  assert.equal(locked?.checksum, checksum);
  const legacy = deliveries.find((delivery) => delivery.id === "del-legacy");
  assert.equal(legacy?.locked, false);
  assert.equal(legacy?.checksum, null);
});

test("the portal delivery list renders a lock indicator and checksum for locked deliveries", () => {
  const list = source("components/portal/DeliveryList.tsx");
  assert.match(list, /delivery\.locked/);
  assert.match(list, /Locked/);
  assert.match(list, /delivery\.checksum/);
  assert.match(list, /sha256/);
});

test("the portal home feeds deliveries from the canonical deliverables API", () => {
  const home = source("components/portal/PortalHome.tsx");
  assert.match(home, /fetch\(`\/api\/projects\/\$\{[^}]+\}\/deliverables`/);
  const deliveriesBlock = home.match(/recentDeliveries\(\{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.doesNotMatch(deliveriesBlock, /workspace\.deliverables/);
});
