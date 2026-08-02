import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataAuthorityMigration =
  "supabase/migrations/20260715093300_fail_closed_co_production_authority.sql";
const identityAuthorityMigration =
  "supabase/migrations/20260715183000_identity_governance_authority.sql";

const logoutAuthStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function createSupabaseAuth() {
    return {
      auth: {
        async signOut() {
          const state = globalThis.__identityAuthorityLogoutState;
          state.calls += 1;
          return { error: state.error };
        }
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/supabase-auth") {
      return nextResolve(logoutAuthStubUrl, context);
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

type QueryError = { message: string } | null;
type TeamRow = { id: string; owner_id: string };
type MembershipRow = {
  team_id: string;
  user_id: string;
  role: string;
};

interface AuthorityFixture {
  team: TeamRow | null;
  membership: MembershipRow | null;
  teamError?: QueryError;
  membershipError?: QueryError;
}

class AuthorityQuery {
  private readonly filters = new Map<string, unknown>();
  private readonly fixture: AuthorityFixture;
  private readonly table: string;

  constructor(table: string, fixture: AuthorityFixture) {
    this.table = table;
    this.fixture = fixture;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  async maybeSingle() {
    if (this.table === "teams") {
      const row = this.fixture.team;
      return {
        data: row && row.id === this.filters.get("id") ? row : null,
        error: this.fixture.teamError ?? null,
      };
    }

    assert.equal(this.table, "team_members");
    const row = this.fixture.membership;
    return {
      data:
        row &&
        row.team_id === this.filters.get("team_id") &&
        row.user_id === this.filters.get("user_id")
          ? row
          : null,
      error: this.fixture.membershipError ?? null,
    };
  }
}

class AuthorityClient {
  private readonly fixture: AuthorityFixture;

  constructor(fixture: AuthorityFixture) {
    this.fixture = fixture;
  }

  from(table: string) {
    assert.ok(["teams", "team_members"].includes(table), `unexpected table ${table}`);
    return new AuthorityQuery(table, this.fixture);
  }
}

interface LogoutState {
  calls: number;
  error: QueryError;
}

const logoutState: LogoutState = { calls: 0, error: null };
(globalThis as typeof globalThis & {
  __identityAuthorityLogoutState: LogoutState;
}).__identityAuthorityLogoutState = logoutState;

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function moduleUrl(path: string) {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

function activityInsertBodies(routeSource: string) {
  return [...routeSource.matchAll(
    /\.from\(["']activity_log["']\)\s*\.insert\(\{([\s\S]*?)\n\s*\}\);/g,
  )].map((match) => match[1]);
}

function sqlFunction(name: string, migrationPath = identityAuthorityMigration) {
  const migration = source(migrationPath);
  const match = migration.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  );
  assert.ok(match, `missing ${name}`);
  return match[0].replace(/--.*$/gm, " ").replace(/\s+/g, " ");
}

test("production shell actor identity is projected from the authenticated session", () => {
  const shell = source("components/Shell.tsx");
  const sessionRoute = source("app/api/auth/session/route.ts");

  assert.match(sessionRoute, /id:\s*user\.id/);
  assert.match(sessionRoute, /email:\s*user\.email/);
  assert.doesNotMatch(shell, /Bailey Eubanks|bailey@contentco-op\.com/i);
  assert.match(
    shell,
    /\/api\/(?:auth\/session|identity\/context)|useAuthenticated(?:Actor|Identity|Session)|useIdentityContext|authenticatedActor/i,
    "the managed shell must consume server-derived actor identity",
  );
});

test("identity context is authenticated, non-cacheable, and RPC-bound", () => {
  const route = source("app/api/identity/context/route.ts");

  assert.match(route, /requireAuthWithClient\(\)/);
  assert.match(route, /Cache-Control["']?:\s*["']private, no-store["']/);
  assert.match(route, /supabase\.rpc\(["']get_identity_context["']/);
  assert.match(route, /p_team_id:\s*teamId/);
  assert.doesNotMatch(route, /from ["']@\/lib\/(?:auth|supabase)["']/);
  assert.doesNotMatch(route, /(?:actorId|actor_id|userId|user_id)\s*:\s*(?:body|request|parsed)/);
});

test("audit actor fields come only from the authenticated user", () => {
  const routes = [
    source("app/api/teams/route.ts"),
    source("app/api/teams/invites/route.ts"),
  ];
  const inserts = routes.flatMap(activityInsertBodies);

  assert.ok(inserts.length >= 7, "expected every team mutation to emit actor-bound audit evidence");
  for (const insert of inserts) {
    assert.match(insert, /actor_id:\s*user\.id/);
    assert.match(insert, /actor_name:\s*user\.email\s*\?\?/);
  }
  for (const route of routes) {
    assert.doesNotMatch(route, /(?:actor_id|actor_name|actorId|actorName)\s*:\s*body\b/);
  }
});

test("team roles are projected from exact membership instead of a fixed or fallback role", () => {
  const shell = source("components/Shell.tsx");
  const teamRoute = source("app/api/teams/route.ts");

  assert.doesNotMatch(shell, /const\s+WORKSPACE_ROLE[^=]*=\s*["'][^"']+["']/);
  assert.match(
    shell,
    /currentRole|workspaceRole|membership\.role|actor\.role/i,
    "navigation authority must consume a verified membership role",
  );
  assert.doesNotMatch(
    teamRoute,
    /currentRole:\s*roleMap\.get\([^)]*\)\s*\?\?\s*["']viewer["']/,
    "a missing or invalid membership role must not be synthesized as viewer",
  );
});

test("membership resolution denies absent, foreign, invalid, and failed rows", async () => {
  const { getTeamRole, requireTeamRole } = await import(
    moduleUrl("lib/middleware/rbac.ts")
  );

  const exactOwner = new AuthorityClient({
    team: { id: "team-a", owner_id: "actor-a" },
    membership: { team_id: "team-a", user_id: "actor-a", role: "owner" },
  });
  assert.equal(await getTeamRole("team-a", "actor-a", exactOwner as never), "owner");

  const ownerWithoutMembership = new AuthorityClient({
    team: { id: "team-a", owner_id: "actor-a" },
    membership: null,
  });
  assert.equal(
    await getTeamRole("team-a", "actor-a", ownerWithoutMembership as never),
    null,
    "owner_id cannot substitute for the canonical membership row",
  );

  const foreignMembership = new AuthorityClient({
    team: { id: "team-a", owner_id: "actor-b" },
    membership: { team_id: "team-b", user_id: "actor-a", role: "owner" },
  });
  assert.equal(await getTeamRole("team-a", "actor-a", foreignMembership as never), null);

  const invalidRole = new AuthorityClient({
    team: { id: "team-a", owner_id: "actor-b" },
    membership: { team_id: "team-a", user_id: "actor-a", role: "superadmin" },
  });
  assert.equal(await getTeamRole("team-a", "actor-a", invalidRole as never), null);

  const failedLookup = new AuthorityClient({
    team: { id: "team-a", owner_id: "actor-b" },
    membership: { team_id: "team-a", user_id: "actor-a", role: "admin" },
    membershipError: { message: "database unavailable" },
  });
  assert.equal(await getTeamRole("team-a", "actor-a", failedLookup as never), null);

  const viewer = new AuthorityClient({
    team: { id: "team-a", owner_id: "actor-b" },
    membership: { team_id: "team-a", user_id: "actor-a", role: "viewer" },
  });
  assert.deepEqual(
    await requireTeamRole("team-a", "actor-a", "admin", viewer as never),
    { allowed: false, role: "viewer" },
  );
});

test("team SQL authority binds tenant and actor inside the database", () => {
  const authority = sqlFunction(
    "co_production_private.has_team_role",
    dataAuthorityMigration,
  );

  assert.match(authority, /target_team_id uuid, required_rank integer DEFAULT 10/);
  assert.doesNotMatch(authority, /(?:target_|actor_|user_)user_id uuid/);
  assert.match(authority, /team\.id = target_team_id/);
  assert.match(authority, /member\.team_id = team\.id/);
  assert.match(authority, /member\.user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(authority, /role_rank\(member\.role\) >= required_rank/);
  assert.doesNotMatch(authority, /USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
});

test("identity context can provision its principal only through a writable RPC", () => {
  const context = sqlFunction("co_production.get_identity_context");

  assert.match(context, /actor uuid := co_production_private\.identity_actor\(\)/);
  assert.match(context, /PERFORM co_production\.ensure_identity_principal\(\)/);
  assert.match(
    context,
    /LANGUAGE plpgsql VOLATILE SECURITY DEFINER/,
    "a context RPC that provisions profile rows cannot be declared STABLE",
  );
  assert.match(context, /WHERE member\.user_id = actor/);
  assert.match(context, /'role', member\.role/);
});

test("account preference RPCs are versioned, actor-owned, and tenant-checked", async () => {
  const migration = source(identityAuthorityMigration);
  const preferences = sqlFunction("co_production.update_identity_preferences");
  const { parseIdentityMutation } = await import(moduleUrl("lib/identity/authority.ts"));

  assert.match(
    migration,
    /CREATE TABLE co_production\.identity_preferences \([\s\S]*?user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\)/,
  );
  assert.match(migration, /authority_version integer NOT NULL DEFAULT 1/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(preferences, /actor uuid := co_production_private\.identity_actor\(\)/);
  assert.match(preferences, /has_team_role\(requested_team, 10\)/);
  assert.match(preferences, /MESSAGE = 'cross_tenant_identity_forbidden'/);
  assert.match(preferences, /WHERE preference\.user_id = actor AND preference\.authority_version = p_expected_version/);
  assert.match(preferences, /authority_version = preference\.authority_version \+ 1/);
  assert.match(preferences, /updated_by = actor/);
  assert.match(preferences, /append_identity_audit/);
  assert.doesNotMatch(preferences, /p_(?:actor|user)_id/);

  assert.deepEqual(
    parseIdentityMutation({
      action: "preferences.update",
      expectedVersion: 1,
      userId: "00000000-0000-4000-8000-000000000001",
      patch: { theme: "dark" },
    }),
    { ok: false, error: "Request contains an unknown field" },
  );
});

test("identity RPCs deny cross-tenant teams and nested project scopes", () => {
  const route = source("app/api/identity/context/route.ts");
  const context = sqlFunction("co_production.get_identity_context");
  const preferences = sqlFunction("co_production.update_identity_preferences");
  const featureFlag = sqlFunction("co_production.update_team_feature_flag");
  const brandRevision = sqlFunction("co_production.create_team_brand_revision");

  assert.match(context, /IF NOT co_production_private\.has_team_role\(p_team_id, 10\) THEN/);
  assert.match(preferences, /IF NOT co_production_private\.has_team_role\(requested_team, 10\) THEN/);
  for (const mutation of [featureFlag, brandRevision]) {
    assert.match(mutation, /project\.id = p_project_id AND project\.team_id = p_team_id/);
    assert.match(mutation, /MESSAGE = 'cross_tenant_identity_forbidden'/);
  }
  assert.match(route, /message\.includes\(["']cross_tenant["']\)/);
  assert.match(route, /\{ error: ["']Forbidden["'], code: ["']IDENTITY_FORBIDDEN["'] \}/);
});

test("notification preferences persist through authenticated versioned authority", () => {
  const route = source("app/api/notifications/preferences/route.ts");
  const migration = source("supabase/migrations/20260715222311_versioned_notification_preferences.sql");

  assert.match(route, /requireAuthWithClient\(\)/);
  assert.match(route, /\.eq\(["']user_id["'],\s*user\.id\)/);
  assert.match(route, /\.rpc\(["']update_notification_preferences["']/);
  assert.match(route, /p_expected_versions:\s*expectedVersions/);
  assert.match(route, /NOTIFICATION_VERSION_CONFLICT/);
  assert.match(route, /NOTIFICATION_CONFIRMATION_MISMATCH/);
  assert.doesNotMatch(route, /body\.(?:user_id|userId)|preferencesInput\.(?:user_id|userId)/);
  assert.doesNotMatch(route, /error:\s*error\.message/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /authority_version = preference\.authority_version \+ 1/);
  assert.match(migration, /notification_preferences_version_conflict/);
  assert.match(migration, /expected_version IS NULL/);
  assert.match(migration, /append_identity_audit/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE[\s\S]*FROM authenticated/);
});

test("production settings use persisted preferences while demo storage stays explicit", () => {
  const settings = source("app/(dashboard)/settings/page.tsx");
  const managed = source("components/auth/ManagedSettingsSurface.tsx");
  const demo = source("components/auth/DemoSettingsSurface.tsx");

  assert.match(
    managed,
    /NotificationPreferences[\s\S]*useIdentityContext|useIdentityContext[\s\S]*NotificationPreferences/,
    "managed settings need a server-persisted preference adapter",
  );
  assert.match(
    settings,
    /demoMode\s*\?\s*<DemoSettingsSurface\s*\/>\s*:\s*<ManagedSettingsSurface\s*\/>/,
    "the route must make its managed/demo authority split explicit",
  );
  assert.doesNotMatch(managed, /useDemoWorkspace|localStorage|sessionStorage/);
  assert.match(demo, /useDemoWorkspace|useEnterpriseIdentityDemo/);
});

test("managed settings never render failure feedback as a successful save", () => {
  const frame = source("components/auth/SettingsFrame.tsx");
  const managed = source("components/auth/ManagedIdentitySettings.tsx");
  const identityClient = source("components/auth/useIdentityContext.ts");
  const identityRoute = source("app/api/identity/context/route.ts");

  assert.match(managed, /onNotice\(errorMessage\(error\),\s*["']error["']\)/);
  assert.match(frame, /notice\.tone === ["']error["'] \? ["']alert["'] : ["']status["']/);
  assert.match(frame, /<AlertCircle/);
  assert.match(identityClient, /payload\.ok !== true/);
  assert.match(identityClient, /payload\.context\.actor\.id !== expectedActorId/);
  assert.match(identityRoute, /IDENTITY_CONFIRMATION_UNAVAILABLE/);
  assert.doesNotMatch(identityRoute, /context:\s*contextResult\.error\s*\?\s*null/);
});

test("demo bypass is limited to explicit local or canonical demo surfaces", () => {
  const proxy = source("proxy.ts");
  const launchDemo = proxy.match(/const launchDemo\s*=([\s\S]*?);/);

  assert.ok(launchDemo, "missing explicit demo launch boundary");
  assert.match(launchDemo[1], /searchParams\.get\(["']demo["']\)\s*===\s*["']1["']/);
  assert.match(launchDemo[1], /localDevelopment/);
  assert.match(launchDemo[1], /hostSurface\s*===\s*["']canonical["']/);
  assert.doesNotMatch(launchDemo[1], /hostSurface\s*===\s*["'](?:admin|client)["']/);

  for (const path of [
    "app/api/auth/session/route.ts",
    "app/api/auth/logout/route.ts",
    "app/api/identity/context/route.ts",
  ]) {
    assert.doesNotMatch(source(path), /useDemo|demoWorkspace|localStorage|searchParams.*demo/i);
  }
});

test("managed sign-out uses the server endpoint and keeps demo revocation local", () => {
  const shell = source("components/Shell.tsx");
  const handlerStart = shell.indexOf("async function handleLogout()");
  const handlerEnd = shell.indexOf("\n  if (isProjectCockpit)", handlerStart);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "missing shell logout handler");
  const logoutHandler = shell.slice(handlerStart, handlerEnd);
  assert.match(logoutHandler, /if\s*\(demoSuffix\)[\s\S]*signOutDemoSession\(\)[\s\S]*return;/);
  assert.match(
    logoutHandler,
    /fetch\(\s*["']\/api\/auth\/logout["']|signOutManagedSession/,
    "managed sign-out must revoke through the server cookie authority",
  );
  assert.doesNotMatch(logoutHandler, /createSupabaseBrowser\(\)|supabase\.auth\.signOut\(\)/);
});

test("successful server sign-out is explicitly non-cacheable", async () => {
  logoutState.calls = 0;
  logoutState.error = null;
  const { POST } = await import(moduleUrl("app/api/auth/logout/route.ts"));

  const response = await POST();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(logoutState.calls, 1);
  assert.equal((await response.json()).success, true);
});

test("provider sign-out failure never reports a successful logout", async () => {
  logoutState.calls = 0;
  logoutState.error = { message: "secret provider account detail" };
  const { POST } = await import(moduleUrl("app/api/auth/logout/route.ts"));

  const response = await POST();
  const payload = await response.text();
  assert.ok(response.status >= 500, `expected provider failure status, received ${response.status}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(logoutState.calls, 1);
  assert.doesNotMatch(payload, /secret provider|success["']?\s*:\s*true/i);
});
