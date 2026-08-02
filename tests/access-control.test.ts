import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    if (!globalThis.__ccoAccessSupabase) {
      throw new Error("Access-control test client was not installed");
    }
    return globalThis.__ccoAccessSupabase;
  }
`)}`;
const authorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    return globalThis.__ccoAccessSchema || "public";
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier === "@/lib/data-authority") {
      return nextResolve(authorityStubUrl, context);
    }
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;

interface Scenario {
  tables: Record<string, Row[]>;
  errors?: Record<string, string>;
}

class FakeQuery {
  private readonly filters: Array<{ column: string; value: unknown }> = [];
  private readonly scenario: Scenario;
  private readonly table: string;

  constructor(scenario: Scenario, table: string) {
    this.scenario = scenario;
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  async maybeSingle() {
    const message = this.scenario.errors?.[this.table];
    if (message) return { data: null, error: { message } };
    const rows = this.scenario.tables[this.table] ?? [];
    const data = rows.find((row) =>
      this.filters.every(({ column, value }) => row[column] === value),
    );
    return { data: data ? { ...data } : null, error: null };
  }
}

class FakeSupabase {
  private readonly scenario: Scenario;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
  }

  from(table: string) {
    return new FakeQuery(this.scenario, table);
  }
}

type AccessTestGlobal = typeof globalThis & {
  __ccoAccessSchema?: "public" | "co_production";
  __ccoAccessSupabase?: FakeSupabase;
};

const state = globalThis as AccessTestGlobal;

function scenario(overrides: Partial<Scenario["tables"]> = {}): Scenario {
  return {
    tables: {
      projects: [
        {
          id: "project-a",
          name: "Campaign A",
          owner_id: "owner-a",
          team_id: "team-a",
        },
      ],
      project_members: [],
      teams: [{ id: "team-a", owner_id: "team-owner" }],
      team_members: [],
      assets: [
        {
          id: "asset-a",
          project_id: "project-a",
          title: "Campaign cut",
          file_type: "video",
          file_url: "https://media.example.test/a.mp4",
          status: "in_review",
          duration_seconds: 60,
        },
      ],
      review_invites: [
        {
          id: "invite-a",
          asset_id: "asset-a",
          version_id: "version-a",
          permissions: "comment",
          reviewer_email: "reviewer@example.test",
          reviewer_name: "Reviewer",
        },
      ],
      ...overrides,
    },
  };
}

async function accessModule() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "lib/access-control.ts")).href
  );
}

async function rbacModule() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "lib/middleware/rbac.ts")).href
  );
}

test.afterEach(() => {
  state.__ccoAccessSchema = undefined;
  state.__ccoAccessSupabase = undefined;
});

test("legacy public authority remains owner-only", async () => {
  state.__ccoAccessSchema = "public";
  const client = new FakeSupabase(
    scenario({
      project_members: [
        {
          project_id: "project-a",
          user_id: "member-a",
          role: "editor",
          expires_at: null,
        },
      ],
    }),
  );
  const { getProjectAccess } = await accessModule();

  const owner = await getProjectAccess("project-a", "owner-a", "viewer", client as never);
  const member = await getProjectAccess("project-a", "member-a", "viewer", client as never);

  assert.equal(owner.ok, true);
  assert.equal(owner.ok && owner.data.access_role, "owner");
  assert.deepEqual(owner.ok && owner.data.tenant_authority, {
    kind: "personal",
    id: "owner-a",
    key: "personal:owner-a",
  });
  assert.deepEqual(member, {
    ok: false,
    status: 404,
    error: "Project not found",
  });
});

test("isolated authority selects the highest direct and team role", async () => {
  state.__ccoAccessSchema = "co_production";
  const client = new FakeSupabase(
    scenario({
      project_members: [
        {
          project_id: "project-a",
          user_id: "producer-a",
          role: "viewer",
          expires_at: null,
        },
      ],
      team_members: [
        { team_id: "team-a", user_id: "producer-a", role: "producer" },
      ],
    }),
  );
  const { getProjectAccess } = await accessModule();

  const access = await getProjectAccess(
    "project-a",
    "producer-a",
    "editor",
    client as never,
  );

  assert.equal(access.ok, true);
  assert.equal(access.ok && access.data.access_role, "producer");
  assert.equal(access.ok && access.data.access_rank, 70);
  assert.deepEqual(access.ok && access.data.tenant_authority, {
    kind: "team",
    id: "team-a",
    key: "team:team-a",
  });
});

test("expired project membership is denied", async () => {
  state.__ccoAccessSchema = "co_production";
  const client = new FakeSupabase(
    scenario({
      project_members: [
        {
          project_id: "project-a",
          user_id: "expired-a",
          role: "editor",
          expires_at: "2000-01-01T00:00:00.000Z",
        },
      ],
    }),
  );
  const { getProjectAccess } = await accessModule();

  const access = await getProjectAccess(
    "project-a",
    "expired-a",
    "viewer",
    client as never,
  );

  assert.deepEqual(access, {
    ok: false,
    status: 404,
    error: "Project not found",
  });
});

test("minimum role checks fail closed without revealing the project", async () => {
  state.__ccoAccessSchema = "co_production";
  const client = new FakeSupabase(
    scenario({
      project_members: [
        {
          project_id: "project-a",
          user_id: "reviewer-a",
          role: "reviewer",
          expires_at: "2100-01-01T00:00:00.000Z",
        },
      ],
    }),
  );
  const { getProjectAccess } = await accessModule();

  const read = await getProjectAccess(
    "project-a",
    "reviewer-a",
    "viewer",
    client as never,
  );
  const write = await getProjectAccess(
    "project-a",
    "reviewer-a",
    "editor",
    client as never,
  );

  assert.equal(read.ok, true);
  assert.equal(read.ok && read.data.access_role, "reviewer");
  assert.deepEqual(write, {
    ok: false,
    status: 404,
    error: "Project not found",
  });
});

test("asset and review-invite access inherit project authority", async () => {
  state.__ccoAccessSchema = "co_production";
  const client = new FakeSupabase(
    scenario({
      project_members: [
        {
          project_id: "project-a",
          user_id: "member-a",
          role: "editor",
          expires_at: null,
        },
      ],
    }),
  );
  const {
    getAssetAccess,
    getOwnedReviewInvite,
    getReviewInviteAccess,
  } = await accessModule();

  const asset = await getAssetAccess("asset-a", "member-a", "editor", client as never);
  const invite = await getReviewInviteAccess(
    "invite-a",
    "member-a",
    "member",
    client as never,
  );
  const ownerOnly = await getOwnedReviewInvite(
    "invite-a",
    "member-a",
    client as never,
  );

  assert.equal(asset.ok, true);
  assert.equal(invite.ok, true);
  assert.equal(invite.ok && invite.data.access_role, "editor");
  assert.equal(ownerOnly.ok, false);
});

test("team owners and expanded enterprise roles use the canonical rank order", async () => {
  const database = new FakeSupabase(
    scenario({
      team_members: [
        { team_id: "team-a", user_id: "team-owner", role: "owner" },
        { team_id: "team-a", user_id: "producer-a", role: "producer" },
        { team_id: "team-a", user_id: "reviewer-a", role: "reviewer" },
      ],
    }),
  );
  state.__ccoAccessSupabase = database;
  const { checkTeamPermission, requireTeamRole } = await rbacModule();

  const owner = await requireTeamRole("team-a", "team-owner", "owner");
  const producer = await requireTeamRole("team-a", "producer-a", "member");
  const producerAdmin = await requireTeamRole("team-a", "producer-a", "admin");
  const reviewerMember = await requireTeamRole("team-a", "reviewer-a", "member");
  const producerCanUpload = await checkTeamPermission(
    "team-a",
    "producer-a",
    "asset.upload",
  );

  assert.deepEqual(owner, { allowed: true, role: "owner" });
  assert.deepEqual(producer, { allowed: true, role: "producer" });
  assert.deepEqual(producerAdmin, { allowed: false, role: "producer" });
  assert.deepEqual(reviewerMember, { allowed: false, role: "reviewer" });
  assert.equal(producerCanUpload, true);
});

test("membership lookup errors fail closed", async () => {
  const failingScenario = scenario();
  failingScenario.errors = { team_members: "membership unavailable" };
  state.__ccoAccessSupabase = new FakeSupabase(failingScenario);
  const { requireTeamRole } = await rbacModule();

  const result = await requireTeamRole("team-a", "team-owner", "viewer");
  assert.deepEqual(result, { allowed: false, role: null });
});

test("data-authority failures stay generic at the route boundary", async () => {
  state.__ccoAccessSchema = "co_production";
  const failingScenario = scenario();
  failingScenario.errors = { projects: "relation co_production.projects does not exist" };
  const client = new FakeSupabase(failingScenario);
  const { getProjectAccess } = await accessModule();

  const result = await getProjectAccess(
    "project-a",
    "owner-a",
    "viewer",
    client as never,
  );

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    error: "Access lookup failed",
  });
});
