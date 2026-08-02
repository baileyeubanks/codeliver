import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    const state = globalThis.__approvalPermissionTestState;
    return { user: state.user, supabase: state.supabase };
  }
`)}`;
const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const PROJECT_ROLE_RANK = {
    viewer: 10,
    reviewer: 30,
    member: 50,
    editor: 60,
    producer: 70,
    admin: 80,
    owner: 100,
  };
  export async function getAssetAccess(assetId, userId, minimumRole, client) {
    const state = globalThis.__approvalPermissionTestState;
    state.accessCalls.push({ assetId, userId, minimumRole, client });
    return state.accessResult;
  }
  export function projectTenantAuthority(project) {
    const kind = project.team_id ? "team" : "personal";
    const id = project.team_id ?? project.owner_id;
    return { kind, id, key: kind + ":" + id };
  }
`)}`;
const decisionStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function recordApprovalDecision(input) {
    const state = globalThis.__approvalPermissionTestState;
    state.decisionCalls.push(input);
    return state.decisionResult;
  }
`)}`;
const inviteStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function normalizeReviewerEmail(value) {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }
  export async function createApprovalInvite() {
    throw new Error("Unexpected invite creation in decision permission test");
  }
  export async function createPrivilegedApprovalInviteAfterAuthorization() {
    throw new Error("Unexpected privileged invite creation in decision permission test");
  }
  export async function resolvePrivilegedApprovalAssigneeEmailAfterAuthorization() {
    throw new Error("Unexpected assignee lookup in decision permission test");
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__approvalPermissionTestState.supabase;
  }
`)}`;
const emailStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function sendEmail() {
    throw new Error("Unexpected email send in decision permission test");
  }
  export const emailTemplates = {};
  export function getBaseUrl() { return "https://client.contentco-op.com"; }
`)}`;
const notificationStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function dispatchTransactionalNotification() {
    throw new Error("Unexpected notification in decision permission test");
  }
  export function notificationChannelStatus() {
    return null;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/approval-decisions") {
      return nextResolve(decisionStubUrl, context);
    }
    if (specifier === "@/lib/review-invites") return nextResolve(inviteStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier === "@/lib/email") return nextResolve(emailStubUrl, context);
    if (specifier === "@/lib/notifications/transactional") {
      return nextResolve(notificationStubUrl, context);
    }
    if (specifier.startsWith("@/")) {
      const candidate = resolve(repositoryRoot, specifier.slice(2));
      for (const path of [`${candidate}.ts`, `${candidate}.tsx`]) {
        if (existsSync(path)) return nextResolve(pathToFileURL(path).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

interface ApprovalPermissionTestState {
  user: { id: string; email: string | null };
  accessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
    client: unknown;
  }>;
  accessResult:
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; status: number; error: string };
  decisionCalls: Array<Record<string, unknown>>;
  decisionResult: {
    ok: true;
    data: Record<string, unknown>;
    assetStatus: string;
  };
  approval: {
    id: string;
    assignee_id: string | null;
    assignee_email: string | null;
  } | null;
  supabase: {
    from(table: string): ApprovalQuery;
  };
}

class ApprovalQuery {
  private readonly filters = new Map<string, unknown>();
  private readonly state: ApprovalPermissionTestState;
  private readonly table: string;

  constructor(state: ApprovalPermissionTestState, table: string) {
    this.state = state;
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  async maybeSingle() {
    assert.equal(this.table, "approvals");
    assert.equal(this.filters.get("id"), "approval-a");
    assert.equal(this.filters.get("asset_id"), "asset-a");
    return { data: this.state.approval, error: null };
  }
}

const state: ApprovalPermissionTestState = {
  user: { id: "reviewer-a", email: "reviewer@example.com" },
  accessCalls: [],
  accessResult: { ok: true, data: {} },
  decisionCalls: [],
  decisionResult: {
    ok: true,
    data: { id: "approval-a", status: "approved" },
    assetStatus: "approved",
  },
  approval: null,
  supabase: undefined as never,
};
state.supabase = {
  from(table: string) {
    return new ApprovalQuery(state, table);
  },
};
(globalThis as typeof globalThis & {
  __approvalPermissionTestState: ApprovalPermissionTestState;
}).__approvalPermissionTestState = state;

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

const assetApprovals = source("app/api/assets/[id]/approvals/route.ts");
const workflow = source("app/api/approvals/workflow/route.ts");
const notify = source("app/api/approvals/notify/route.ts");

async function patchAssetApproval() {
  const route = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/assets/[id]/approvals/route.ts"),
    ).href
  );
  return route.PATCH(
    new Request("https://admin.contentco-op.com/api/assets/asset-a/approvals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "approval-a",
        status: "approved",
        version_id: "version-current",
      }),
    }),
    { params: Promise.resolve({ id: "asset-a" }) },
  ) as Promise<Response>;
}

function resetRouteState() {
  state.user = { id: "reviewer-a", email: "reviewer@example.com" };
  state.accessCalls = [];
  state.accessResult = { ok: true, data: {} };
  state.decisionCalls = [];
  state.approval = null;
}

test("approval reads and mutations use the intended collaborator role floors", () => {
  assert.doesNotMatch(assetApprovals, /getOwnedAsset/);
  assert.match(
    assetApprovals,
    /getAssetAccess\(id, user\.id, "viewer", supabase\)/,
  );
  assert.match(
    assetApprovals,
    /getAssetAccess\(id, user\.id, "producer", supabase\)/,
  );
  assert.match(
    assetApprovals,
    /getAssetAccess\(assetId, user\.id, "reviewer", supabase\)/,
  );

  assert.doesNotMatch(workflow, /getOwnedAsset|getOwnedWorkflow/);
  assert.match(
    workflow,
    /getAssetAccess\(assetId, user\.id, "viewer", supabase\)/,
  );
  assert.match(
    workflow,
    /getAssetAccess\(asset_id, user\.id, "producer", supabase\)/,
  );
  assert.match(
    workflow,
    /getAssetAccess\([\s\S]*workflow\.asset_id,[\s\S]*userId,[\s\S]*"producer",[\s\S]*supabase,[\s\S]*\)/,
  );

  assert.doesNotMatch(notify, /getOwnedAsset/);
  assert.match(
    notify,
    /getAssetAccess\([\s\S]*asset_id,[\s\S]*user\.id,[\s\S]*"producer",[\s\S]*supabase,[\s\S]*\)/,
  );
});

test("internal approval decisions require the authenticated assignee", () => {
  const assignmentLookup = assetApprovals.indexOf(
    '.select("id, version_id, assignee_id, assignee_email")',
  );
  const assignmentGuard = assetApprovals.indexOf("if (!isAssignedReviewer)");
  const decisionCall = assetApprovals.indexOf("recordApprovalDecision({");

  assert.ok(assignmentLookup >= 0);
  assert.ok(assignmentGuard > assignmentLookup);
  assert.ok(decisionCall > assignmentGuard);
  assert.match(assetApprovals, /approval\.assignee_id === user\.id/);
  assert.match(assetApprovals, /assigneeEmail === actorEmail/);
  assert.match(assetApprovals, /\.eq\("asset_id", assetId\)/);
  assert.match(assetApprovals, /\.eq\("version_id", versionId\)/);
});

test("workflow and notification lookups remain tenant-scoped", () => {
  assert.match(
    workflow,
    /\.eq\("id", workflowId\)[\s\S]*getAssetAccess\([\s\S]*workflow\.asset_id/,
  );
  assert.match(
    workflow,
    /\.delete\(\)[\s\S]*\.eq\("id", workflow_id\)[\s\S]*\.eq\("asset_id", workflowAccess\.data\.asset_id\)/,
  );
  assert.match(
    notify,
    /\.eq\("id", approval_id\)[\s\S]*\.eq\("asset_id", asset_id\)/,
  );
  assert.match(notify, /createApprovalInvite\(\{[\s\S]*assetId: asset_id/);
});

test("an unassigned internal reviewer cannot reach approval decision logic", async () => {
  resetRouteState();
  state.approval = {
    id: "approval-a",
    assignee_id: "reviewer-b",
    assignee_email: "other@example.com",
  };

  const response = await patchAssetApproval();

  assert.equal(response.status, 403);
  assert.deepEqual(state.decisionCalls, []);
  assert.equal(state.accessCalls.length, 1);
  assert.equal(state.accessCalls[0]?.minimumRole, "reviewer");
});

test("the assigned reviewer can use existing approval decision logic", async () => {
  for (const approval of [
    {
      id: "approval-a",
      assignee_id: "reviewer-a",
      assignee_email: "other@example.com",
    },
    {
      id: "approval-a",
      assignee_id: null,
      assignee_email: " REVIEWER@EXAMPLE.COM ",
    },
  ]) {
    resetRouteState();
    state.approval = approval;

    const response = await patchAssetApproval();

    assert.equal(response.status, 200);
    assert.equal(state.decisionCalls.length, 1);
    assert.deepEqual(state.decisionCalls[0], {
      assetId: "asset-a",
      versionId: "version-current",
      approvalId: "approval-a",
      status: "approved",
      decisionNote: undefined,
      actor: { id: "reviewer-a", name: "reviewer@example.com" },
    });
  }
});
