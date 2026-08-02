import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { after, beforeEach } from "node:test";

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

interface RouteHarnessState {
  schema: "public" | "co_production";
  user: { id: string } | null;
  access:
    | {
        ok: true;
        data: {
          access_role:
            | "owner"
            | "admin"
            | "producer"
            | "editor"
            | "member"
            | "reviewer"
            | "viewer";
        };
      }
    | { ok: false; status: number; error: string };
  tables: Record<string, QueryResult>;
  fromCalls: string[];
  selectCalls: { table: string; columns: string }[];
  rpcs: Record<string, QueryResult>;
  rpcCalls: string[];
}

type HarnessGlobal = typeof globalThis & {
  __ccoProjectOperatingRouteHarness?: RouteHarnessState;
};

const harnessGlobal = globalThis as HarnessGlobal;
const originalHarness = harnessGlobal.__ccoProjectOperatingRouteHarness;

function defaultState(): RouteHarnessState {
  return {
    schema: "co_production",
    user: { id: "user-owner" },
    access: { ok: true, data: { access_role: "owner" } },
    tables: {
      projects: {
        data: {
          id: "project-first-layer",
          name: "The First Layer",
          status: "active",
          created_at: "2026-07-15T16:03:00.000Z",
          updated_at: "2026-07-15T16:05:00.000Z",
        },
        error: null,
      },
      assets: {
        data: [
          {
            id: "asset-first-layer",
            status: "in_review",
            updated_at: "2026-07-15T17:00:00.000Z",
            comments: [{ count: 3 }],
            versions: [{ count: 2 }],
            approvals: [{ status: "pending" }],
          },
        ],
        error: null,
      },
      comments: {
        data: [{ updated_at: "2026-07-15T17:30:00.000Z" }],
        error: null,
        count: 1,
      },
      versions: {
        data: null,
        error: null,
        count: 1,
      },
      project_operating_sources: {
        data: {
          receipt_id: "receipt-first-layer",
          display_number: "0000189-B",
          package_id: "package-first-layer",
          package_version: 1,
          proposal_version_id: "proposal-first-layer-r1",
          quote_version_id: "quote-first-layer-r1",
          activated_at: "2026-07-15T16:03:00.000Z",
          production_start_date: "2026-08-03",
          production_due_date: "2026-09-18",
          production_constraints: ["Client site access requires advance approval"],
          client_id: "client-schneider-electric",
          opportunity_id: "opportunity-first-layer",
          brief_id: "brief-first-layer",
          scope_item_ids: ["development", "production", "editorial"],
          deliverables: [
            {
              id: "deliverable-hero-film",
              title: "The First Layer hero film",
              acceptanceCriteria: ["2.5 to 3.5 minute master"],
            },
          ],
          production_modules: ["Co-Script", "Co-Edit", "Co-Deliver"],
          preproject_origin_linked: true,
          source_inquiry_id: "inquiry-first-layer",
          primary_contact_id: "contact-first-layer",
          canonical_brief_content_hash: `sha256:${"4".repeat(64)}`,
          opportunity_authority_version: 8,
          preproject_origin_link_hash: `sha256:${"7".repeat(64)}`,
          project_brief_revision_id: "project-brief-first-layer-r1",
          source_creative_brief_revision_id: "brief-first-layer",
          project_brief_revision_number: 3,
          project_brief_title: "The First Layer production brief",
          project_brief_objectives: ["Explain the first-layer strategy"],
          project_brief_audiences: ["Industrial operations leaders"],
          project_brief_key_messages: ["Visibility begins at the first layer"],
          project_brief_requested_deliverables: ["Hero film", "Social cutdowns"],
          project_brief_constraints: ["Film only at approved facilities"],
          project_brief_references: ["https://example.com/reference"],
          project_brief_success_criteria: ["Approved by the campaign owner"],
          project_brief_content: {
            title: "The First Layer production brief",
            objectives: ["Explain the first-layer strategy"],
          },
          project_brief_content_hash: `sha256:${"4".repeat(64)}`,
          project_brief_created_at: "2026-07-15T18:00:00.000Z",
          source_proposal_request_receipt_id: "proposal-request-first-layer",
          source_activation_authorization_receipt_id:
            "activation-authorization-first-layer",
        },
        error: null,
      },
      project_manual_origins: {
        data: null,
        error: null,
      },
    },
    fromCalls: [],
    selectCalls: [],
    rpcs: {
      get_project_production_plan: {
        data: {
          projectId: "project-first-layer",
          authorityVersion: 1,
          eventHeadHash: `sha256:${"0".repeat(64)}`,
          plan: null,
          tasks: [],
          dependencies: [],
          permissions: {
            canInitialize: true,
            canManage: true,
            canUpdateStatus: true,
          },
        },
        error: null,
      },
      get_project_script: {
        data: {
          projectId: "project-first-layer",
          authorityVersion: 3,
          eventHeadHash: `sha256:${"9".repeat(64)}`,
          head: {
            revisionId: "script-secret-r2",
            revisionNumber: 2,
            baseRevisionId: "script-secret-r1",
            state: "approved",
            changeSummary: "Approved producer revision",
            contentHash: `sha256:${"8".repeat(64)}`,
            createdBy: "user-producer-secret",
            createdAt: "2026-07-15T19:00:00.000Z",
            submittedBy: null,
            submittedAt: null,
            decidedBy: null,
            decidedAt: null,
            decisionNote: null,
            content: {
              schemaVersion: "cco.script-content.v1",
              title: "The First Layer hero script",
              logline: "A clear route from operating brief to finished film.",
              format: "documentary",
              estimatedRuntimeSeconds: 180,
              sections: [{ id: "opening" }, { id: "proof" }, { id: "close" }],
            },
          },
          revisions: [],
          permissions: {
            canRevise: true,
            canSubmit: true,
            canDecide: true,
          },
        },
        error: null,
      },
    },
    rpcCalls: [],
  };
}

harnessGlobal.__ccoProjectOperatingRouteHarness = defaultState();

const authMock = `data:text/javascript,${encodeURIComponent(`
  function queryFor(table) {
    const query = {
      select(columns) {
        globalThis.__ccoProjectOperatingRouteHarness.selectCalls.push({ table, columns });
        return query;
      },
      eq() { return query; },
      in() { return query; },
      is() { return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle() {
        return Promise.resolve(globalThis.__ccoProjectOperatingRouteHarness.tables[table]);
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(globalThis.__ccoProjectOperatingRouteHarness.tables[table]).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  export async function requireAuthWithClient() {
    const harness = globalThis.__ccoProjectOperatingRouteHarness;
    return {
      user: harness.user,
      supabase: {
        from(table) {
          harness.fromCalls.push(table);
          return queryFor(table);
        },
        rpc(name) {
          harness.rpcCalls.push(name);
          return Promise.resolve(harness.rpcs[name]);
        },
      },
    };
  }
`)}`;
const accessMock = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess() {
    return globalThis.__ccoProjectOperatingRouteHarness.access;
  }
`)}`;
const authorityMock = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    return globalThis.__ccoProjectOperatingRouteHarness.schema;
  }
`)}`;
const projectScriptMock = `data:text/javascript,${encodeURIComponent(`
  export function parseProjectScriptSnapshot(value) {
    return value && typeof value === "object" ? value : null;
  }
`)}`;
const operatingRecordUrl = new URL(
  "../lib/co-produce/project-operating-record.ts",
  import.meta.url,
).href;
const productionPlanUrl = new URL(
  "../lib/preproduction/production-plan.ts",
  import.meta.url,
).href;
const nextServerUrl = import.meta.resolve("next/server.js");

const EXPECTED_OPERATING_SOURCE_COLUMNS = [
  "receipt_id",
  "display_number",
  "package_id",
  "package_version",
  "proposal_version_id",
  "quote_version_id",
  "activated_at",
  "production_start_date",
  "production_due_date",
  "production_constraints",
  "client_id",
  "opportunity_id",
  "brief_id",
  "scope_item_ids",
  "deliverables",
  "production_modules",
  "preproject_origin_linked",
  "source_inquiry_id",
  "primary_contact_id",
  "canonical_brief_content_hash",
  "opportunity_authority_version",
  "preproject_origin_link_hash",
  "project_brief_revision_id",
  "source_creative_brief_revision_id",
  "project_brief_revision_number",
  "project_brief_title",
  "project_brief_objectives",
  "project_brief_audiences",
  "project_brief_key_messages",
  "project_brief_requested_deliverables",
  "project_brief_constraints",
  "project_brief_references",
  "project_brief_success_criteria",
  "project_brief_content",
  "project_brief_content_hash",
  "project_brief_created_at",
  "source_proposal_request_receipt_id",
  "source_activation_authorization_receipt_id",
].join(", ");

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: nextServerUrl, shortCircuit: true };
    }
    if (specifier === "@/lib/auth-client") {
      return { url: authMock, shortCircuit: true };
    }
    if (specifier === "@/lib/access-control") {
      return { url: accessMock, shortCircuit: true };
    }
    if (specifier === "@/lib/data-authority") {
      return { url: authorityMock, shortCircuit: true };
    }
    if (specifier === "@/lib/co-produce/project-operating-record") {
      return { url: operatingRecordUrl, shortCircuit: true };
    }
    if (specifier === "@/lib/preproduction/production-plan") {
      return { url: productionPlanUrl, shortCircuit: true };
    }
    if (specifier === "@/lib/preproduction/project-script") {
      return { url: projectScriptMock, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { GET } = await import(
  "../app/api/projects/[id]/operating-record/route.ts"
);

beforeEach(() => {
  harnessGlobal.__ccoProjectOperatingRouteHarness = defaultState();
});

after(() => {
  hooks.deregister();
  if (originalHarness === undefined) {
    delete harnessGlobal.__ccoProjectOperatingRouteHarness;
  } else {
    harnessGlobal.__ccoProjectOperatingRouteHarness = originalHarness;
  }
});

function request() {
  return GET(new Request("http://localhost/api/projects/project-first-layer/operating-record"), {
    params: Promise.resolve({ id: "project-first-layer" }),
  });
}

test("operating record requires an authenticated project principal", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.user = null;
  const response = await request();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(harnessGlobal.__ccoProjectOperatingRouteHarness!.fromCalls, []);
});

test("operating record preserves fail-closed project access", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.access = {
    ok: false,
    status: 404,
    error: "Project not found",
  };
  const response = await request();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Project not found" });
  assert.deepEqual(harnessGlobal.__ccoProjectOperatingRouteHarness!.fromCalls, []);
});

test("isolated authority joins accepted proposal context to project evidence", async () => {
  const response = await request();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(payload.authority.commercial, "CCO_OS");
  assert.equal(payload.lineage.displayNumber, "0000189-B");
  assert.equal(payload.context.briefId, "brief-first-layer");
  assert.deepEqual(payload.context.script, {
    revisionNumber: 2,
    title: "The First Layer hero script",
    state: "approved",
    format: "documentary",
    estimatedRuntimeSeconds: 180,
    sectionCount: 3,
    createdAt: "2026-07-15T19:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(payload.context.script), /secret|sha256/i);
  assert.deepEqual(payload.context.brief, {
    revisionId: "project-brief-first-layer-r1",
    sourceCreativeBriefRevisionId: "brief-first-layer",
    revisionNumber: 3,
    title: "The First Layer production brief",
    objectives: ["Explain the first-layer strategy"],
    audiences: ["Industrial operations leaders"],
    keyMessages: ["Visibility begins at the first layer"],
    requestedDeliverables: ["Hero film", "Social cutdowns"],
    constraints: ["Film only at approved facilities"],
    references: ["https://example.com/reference"],
    successCriteria: ["Approved by the campaign owner"],
    content: {
      title: "The First Layer production brief",
      objectives: ["Explain the first-layer strategy"],
    },
    contentHash: `sha256:${"4".repeat(64)}`,
    createdAt: "2026-07-15T18:00:00.000Z",
    sourceProposalRequestReceiptId: "proposal-request-first-layer",
    sourceActivationAuthorizationReceiptId:
      "activation-authorization-first-layer",
  });
  assert.equal(payload.revisionAt, "2026-07-15T19:00:00.000Z");
  assert.equal(payload.metrics.assets, 1);
  assert.equal(payload.metrics.versions, 2);
  assert.equal(payload.metrics.comments, 3);
  assert.equal(payload.metrics.approvalsPending, 1);
  assert.deepEqual(payload.media, {
    registeredAssets: 1,
    readyAssets: 1,
    processingAssets: 0,
    failedAssets: 0,
    currentVersions: 1,
  });
  assert.deepEqual(payload.review, {
    reviewableAssets: 1,
    activeAssets: 1,
    changesRequestedAssets: 0,
    approvedAssets: 0,
    openThreads: 1,
    resolvedThreads: 1,
    latestCommentActivityAt: "2026-07-15T17:30:00.000Z",
  });
  assert.equal("totalCents" in payload, false);
  assert.deepEqual(
    harnessGlobal.__ccoProjectOperatingRouteHarness!.fromCalls,
    [
      "assets",
      "projects",
      "comments",
      "comments",
      "comments",
      "versions",
      "project_operating_sources",
      "project_manual_origins",
    ],
  );
  assert.deepEqual(
    harnessGlobal.__ccoProjectOperatingRouteHarness!.rpcCalls,
    ["get_project_script", "get_project_production_plan"],
  );
  assert.equal(
    harnessGlobal.__ccoProjectOperatingRouteHarness!.selectCalls.find(
      (call) => call.table === "project_operating_sources",
    )?.columns,
    EXPECTED_OPERATING_SOURCE_COLUMNS,
  );
});

test("reviewers receive safe operating context without project brief semantics", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.access = {
    ok: true,
    data: { access_role: "reviewer" },
  };

  const response = await request();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.context.brief, null);
  assert.equal(payload.context.script, null);
  assert.deepEqual(payload.context.productionWindow, {
    startDate: "2026-08-03",
    dueDate: "2026-09-18",
    constraints: ["Client site access requires advance approval"],
  });
  assert.equal(payload.context.deliverables[0]?.id, "deliverable-hero-film");
  assert.equal(payload.lineage.receiptId, undefined);
  assert.equal(payload.revisionAt, "2026-07-15T18:00:00.000Z");
  assert.deepEqual(
    harnessGlobal.__ccoProjectOperatingRouteHarness!.rpcCalls,
    ["get_project_production_plan"],
  );
});

test("missing durable brief data stays null without inventing pre-production evidence", async () => {
  const harness = harnessGlobal.__ccoProjectOperatingRouteHarness!;
  const source = harness.tables.project_operating_sources.data as Record<
    string,
    unknown
  >;
  source.project_brief_revision_id = null;

  const response = await request();
  const payload = await response.json();
  const preProduction = payload.workspaces.find(
    (workspace: { id: string }) => workspace.id === "pre_production",
  );

  assert.equal(response.status, 200);
  assert.equal(payload.context.brief, null);
  assert.equal(payload.context.deliverables.length, 1);
  assert.equal(payload.revisionAt, "2026-07-15T19:00:00.000Z");
  assert.equal(preProduction?.status, "blocked");
  assert.match(preProduction?.blockers[0] ?? "", /durable project brief/i);
  assert.equal(
    preProduction?.evidence.some((item: string) => /brief revision/i.test(item)),
    false,
  );
});

test("invalid durable brief values fail closed in the operating record builder", async () => {
  const harness = harnessGlobal.__ccoProjectOperatingRouteHarness!;
  const source = harness.tables.project_operating_sources.data as Record<
    string,
    unknown
  >;
  source.project_brief_title = "x".repeat(241);

  const response = await request();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.context.brief, null);
  assert.equal(payload.context.productionWindow?.startDate, "2026-08-03");
  assert.equal(payload.context.deliverables.length, 1);
});

test("legacy projects remain readable without querying unavailable handoff tables", async () => {
  const harness = harnessGlobal.__ccoProjectOperatingRouteHarness!;
  harness.schema = "public";
  harness.access = { ok: true, data: { access_role: "viewer" } };

  const response = await request();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.authority.commercial, "unlinked");
  assert.equal(payload.lineage.source, "unlinked_project");
  assert.equal(harness.fromCalls.includes("project_operating_sources"), false);
  assert.equal(harness.fromCalls.includes("project_manual_origins"), false);
  assert.deepEqual(harness.rpcCalls, []);
  assert.deepEqual(
    payload.workspaces.map((workspace: { id: string }) => workspace.id),
    ["production", "post_production", "review", "delivery", "archive"],
  );
});

test("missing isolated projection fails closed instead of dropping source context", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.tables.project_operating_sources = {
    data: null,
    error: { message: "relation unavailable" },
  };
  const response = await request();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Project operating source is temporarily unavailable",
  });
});

test("unavailable review aggregates fail closed instead of presenting stale lifecycle evidence", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.tables.comments = {
    data: null,
    error: { message: "comments unavailable" },
    count: null,
  };

  const response = await request();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Project review evidence is temporarily unavailable",
  });
});

test("a durable manual origin is projected without pretending it is an accepted proposal", async () => {
  const harness = harnessGlobal.__ccoProjectOperatingRouteHarness!;
  harness.tables.project_operating_sources = { data: null, error: null };
  harness.tables.project_manual_origins = {
    data: { created_at: "2026-07-15T16:06:00.000Z" },
    error: null,
  };

  const response = await request();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.lineage.source, "manual_project");
  assert.equal(payload.authority.preproject, "Co-VideoPro");
  assert.equal(payload.lineage.originRecordedAt, "2026-07-15T16:06:00.000Z");
});

test("an unavailable plan authority fails closed instead of returning a partial lifecycle", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.rpcs.get_project_production_plan = {
    data: null,
    error: { message: "plan authority unavailable" },
  };

  const response = await request();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Project plan is temporarily unavailable",
  });
});

test("an unavailable contributor script authority fails closed without leaking provider details", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.rpcs.get_project_script = {
    data: null,
    error: { message: "private provider detail" },
  };

  const response = await request();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Project script is temporarily unavailable",
  });
});

test("a malformed contributor script projection fails closed", async () => {
  harnessGlobal.__ccoProjectOperatingRouteHarness!.rpcs.get_project_script = {
    data: { projectId: "another-project" },
    error: null,
  };

  const response = await request();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Project script returned an invalid snapshot",
  });
});
