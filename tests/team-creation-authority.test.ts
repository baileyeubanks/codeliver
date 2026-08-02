import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authClientStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    const state = globalThis.__teamCreationAuthorityState;
    state.authClientCalls += 1;
    return { user: state.user, supabase: state.supabase };
  }
`)}`;

const rbacStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireTeamRole(teamId, userId, minimumRole, client) {
    const state = globalThis.__teamCreationAuthorityState;
    state.roleChecks.push({ teamId, userId, minimumRole, client });
    return state.roleCheckResult;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") {
      return nextResolve(authClientStubUrl, context);
    }
    if (specifier === "@/lib/auth" || specifier === "@/lib/supabase") {
      throw new Error(`Authenticated team routes must not import ${specifier}`);
    }
    if (specifier === "@/lib/middleware/rbac") {
      return nextResolve(rbacStubUrl, context);
    }
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;

type Mutation = {
  table: string;
  payload: Row;
};

type RoleCheck = {
  teamId: string;
  userId: string;
  minimumRole: string;
  client: unknown;
};

type QueryResult = {
  data: Row | null;
  error: { message: string } | null;
};

interface TeamCreationAuthorityState {
  user: { id: string; email: string } | null;
  authClientCalls: number;
  roleChecks: RoleCheck[];
  roleCheckResult: { allowed: boolean; role: string | null };
  teamInsertError: { message: string } | null;
  tableAccesses: string[];
  mutations: Mutation[];
  rows: {
    teams: Row[];
    teamMembers: Row[];
    activityLog: Row[];
  };
  supabase: FakeSupabase;
}

class FakeQuery implements PromiseLike<QueryResult> {
  private payload: Row | null = null;
  private readonly state: TeamCreationAuthorityState;
  private readonly table: string;

  constructor(state: TeamCreationAuthorityState, table: string) {
    this.state = state;
    this.table = table;
  }

  insert(payload: Row) {
    this.payload = { ...payload };
    this.state.mutations.push({ table: this.table, payload: { ...payload } });
    return this;
  }

  select() {
    return this;
  }

  async single(): Promise<QueryResult> {
    assert.equal(this.table, "teams");
    assert.ok(this.payload);

    if (this.state.teamInsertError) {
      return { data: null, error: this.state.teamInsertError };
    }

    const team = {
      id: "team-created-by-database",
      created_at: "2026-07-15T12:00:00.000Z",
      ...this.payload,
    };
    this.state.rows.teams.push(team);

    // Simulate the AFTER INSERT trigger in the production migration.
    this.state.rows.teamMembers.push({
      team_id: team.id,
      user_id: team.owner_id,
      role: "owner",
      invited_by: team.owner_id,
    });

    return { data: team, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    if (this.table === "activity_log" && this.payload) {
      this.state.rows.activityLog.push({ ...this.payload });
    }
    return Promise.resolve({ data: null, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FakeSupabase {
  private readonly state: TeamCreationAuthorityState;

  constructor(state: TeamCreationAuthorityState) {
    this.state = state;
  }

  from(table: string) {
    this.state.tableAccesses.push(table);
    return new FakeQuery(this.state, table);
  }
}

const state: TeamCreationAuthorityState = {
  user: null,
  authClientCalls: 0,
  roleChecks: [],
  roleCheckResult: { allowed: true, role: "owner" },
  teamInsertError: null,
  tableAccesses: [],
  mutations: [],
  rows: { teams: [], teamMembers: [], activityLog: [] },
  supabase: undefined as unknown as FakeSupabase,
};
state.supabase = new FakeSupabase(state);

(globalThis as typeof globalThis & {
  __teamCreationAuthorityState: TeamCreationAuthorityState;
}).__teamCreationAuthorityState = state;

function resetState() {
  state.user = { id: "authenticated-user", email: "owner@example.test" };
  state.authClientCalls = 0;
  state.roleChecks = [];
  state.roleCheckResult = { allowed: true, role: "owner" };
  state.teamInsertError = null;
  state.tableAccesses = [];
  state.mutations = [];
  state.rows = { teams: [], teamMembers: [], activityLog: [] };
  state.supabase = new FakeSupabase(state);
}

async function teamRoutes() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/teams/route.ts")).href
  );
}

function apiRequest(method: "POST" | "PATCH" | "DELETE", body: unknown) {
  return new Request("https://deliver.contentco-op.com/api/teams", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTeam(body: unknown) {
  const { POST } = await teamRoutes();
  return POST(
    apiRequest("POST", body) as never,
  );
}

function mutationsFor(table: string) {
  return state.mutations.filter((mutation) => mutation.table === table);
}

test.beforeEach(resetState);

test("team creation relies on the insert trigger without duplicating membership", async () => {
  const response = await createTeam({ name: "Editorial" });

  assert.equal(response.status, 201);
  assert.equal(state.authClientCalls, 1);
  assert.deepEqual(await response.json(), {
    id: "team-created-by-database",
    created_at: "2026-07-15T12:00:00.000Z",
    name: "Editorial",
    owner_id: "authenticated-user",
  });
  assert.deepEqual(mutationsFor("teams"), [
    {
      table: "teams",
      payload: { name: "Editorial", owner_id: "authenticated-user" },
    },
  ]);
  assert.deepEqual(mutationsFor("team_members"), []);
  assert.equal(state.tableAccesses.includes("team_members"), false);
  assert.deepEqual(state.rows.teamMembers, [
    {
      team_id: "team-created-by-database",
      user_id: "authenticated-user",
      role: "owner",
      invited_by: "authenticated-user",
    },
  ]);
});

test("client-supplied owner and member identities cannot override authentication", async () => {
  const response = await createTeam({
    name: "Protected Team",
    owner_id: "attacker-user",
    user_id: "attacker-user",
    invited_by: "attacker-user",
    role: "owner",
    member: { user_id: "attacker-user", role: "owner" },
    members: [{ user_id: "attacker-user", role: "owner" }],
    team_members: [{ user_id: "attacker-user", role: "owner" }],
  });

  assert.equal(response.status, 201);
  assert.deepEqual(mutationsFor("teams")[0]?.payload, {
    name: "Protected Team",
    owner_id: "authenticated-user",
  });
  assert.deepEqual(mutationsFor("team_members"), []);
  assert.deepEqual(state.rows.teamMembers, [
    {
      team_id: "team-created-by-database",
      user_id: "authenticated-user",
      role: "owner",
      invited_by: "authenticated-user",
    },
  ]);
  assert.equal(JSON.stringify(state.mutations).includes("attacker-user"), false);
});

test("protected operations pass the authenticated client to every role check", async () => {
  state.roleCheckResult = { allowed: false, role: null };
  const routes = await teamRoutes();

  const responses = await Promise.all([
    routes.POST(
      apiRequest("POST", {
        action: "remove",
        team_id: "team-a",
        user_id: "target-user",
      }) as never,
    ),
    routes.PATCH(
      apiRequest("PATCH", { team_id: "team-b", name: "Renamed" }) as never,
    ),
    routes.DELETE(
      apiRequest("DELETE", { team_id: "team-c" }) as never,
    ),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [403, 403, 403]);
  assert.equal(state.authClientCalls, 3);
  assert.deepEqual(
    state.roleChecks.map((check) => ({
      teamId: check.teamId,
      userId: check.userId,
      minimumRole: check.minimumRole,
    })),
    [
      {
        teamId: "team-a",
        userId: "authenticated-user",
        minimumRole: "admin",
      },
      {
        teamId: "team-b",
        userId: "authenticated-user",
        minimumRole: "admin",
      },
      {
        teamId: "team-c",
        userId: "authenticated-user",
        minimumRole: "owner",
      },
    ],
  );
  assert.equal(
    state.roleChecks.every((check) => check.client === state.supabase),
    true,
  );
  assert.deepEqual(state.tableAccesses, []);
});

test("team insert failures are generic and do not report partial success", async () => {
  state.teamInsertError = {
    message:
      'duplicate key value violates unique constraint "team_members_team_id_user_id_key"',
  };

  const response = await createTeam({ name: "Editorial" });
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, { error: "Failed to create team" });
  assert.equal(JSON.stringify(payload).includes("team_members"), false);
  assert.deepEqual(state.rows.teamMembers, []);
  assert.deepEqual(mutationsFor("activity_log"), []);
});

test("existing authentication and name validation still stop creation", async () => {
  state.user = null;
  const unauthorized = await createTeam({
    name: "Unauthorized Team",
    owner_id: "attacker-user",
  });

  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "Unauthorized" });
  assert.deepEqual(state.mutations, []);

  resetState();
  const missingName = await createTeam({ owner_id: "attacker-user" });

  assert.equal(missingName.status, 400);
  assert.deepEqual(await missingName.json(), { error: "name is required" });
  assert.deepEqual(state.mutations, []);
});
