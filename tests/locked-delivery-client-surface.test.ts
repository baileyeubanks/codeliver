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
    return {
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
        reviewer_name: "External reviewer",
        reviewer_email: "reviewer@example.test",
        permissions: "view",
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
`);

const reviewInvitesStub = dataModule(`
  export function getExternalApprovalState() {
    return { approvals: [], activeApprovalIds: [], approvalAccessMessage: null };
  }
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
    async maybeSingle() { return { data: null, error: null }; }
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
    if (specifier === "@/lib/review-invites") return nextResolve(reviewInvitesStub, context);
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
    if (specifier === "@/lib/review/external-comment") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/review/external-comment.ts")).href,
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
  __ccoClientSurfaceErrors: Record<string, string>;
  __ccoClientSurfaceTables: Record<string, Array<Record<string, unknown>>>;
};

const state = globalThis as ClientSurfaceGlobal;

async function reviewRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/route.ts")).href
  );
}

function getReviewPayload() {
  return reviewRoute().then(({ GET }) =>
    GET(new Request("https://client.contentco-op.com/api/review/opaque-token"), {
      params: Promise.resolve({ token: "opaque-token" }),
    }),
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
});

/* ── portal projections ────────────────────────────────────────────────── */

test("recentDeliveries marks locked delivery records and leaves others unlocked", async () => {
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

  assert.equal(deliveries.find((delivery) => delivery.id === "del-locked")?.locked, true);
  assert.equal(deliveries.find((delivery) => delivery.id === "del-legacy")?.locked, false);
});

test("the portal delivery list renders a lock indicator for locked deliveries", () => {
  const list = source("components/portal/DeliveryList.tsx");
  assert.match(list, /delivery\.locked/);
  assert.match(list, /Locked/);
});
