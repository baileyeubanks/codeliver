import assert from "node:assert/strict";
import test from "node:test";

import {
  activateWorkspace,
  buildGovernanceExport,
  canPerformGovernance,
  createEnterpriseIdentityState,
  isFeatureEnabled,
  restoreEnterpriseIdentityState,
  revokeDemoSession,
  setDelegatedCapability,
  updateAccessPolicy,
} from "../components/auth/enterprise-model.ts";

test("restoration treats browser storage as preferences, not identity authority", () => {
  const base = createEnterpriseIdentityState();
  const forged = {
    ...base,
    currentUserId: "attacker",
    activeOrganizationId: "org-attacker",
    memberships: base.memberships.map((membership) => ({
      ...membership,
      role: "owner",
      delegatedCapabilities: ["organization.manage", "policy.manage"],
    })),
    policies: base.policies.map((policy) => ({
      ...policy,
      ssoStatus: "verified",
      scimStatus: "verified",
      passwordAuthenticationEnabled: false,
    })),
  };

  const restored = restoreEnterpriseIdentityState(JSON.stringify(forged)).state;
  assert.equal(restored.currentUserId, base.currentUserId);
  assert.equal(restored.activeOrganizationId, base.activeOrganizationId);
  assert.deepEqual(restored.memberships.map((membership) => membership.role), base.memberships.map((membership) => membership.role));
  assert.equal(restored.policies[0].ssoStatus, "not_configured");
  assert.equal(restored.policies[0].scimStatus, "not_configured");
  assert.equal(restored.policies[0].passwordAuthenticationEnabled, true);
});

test("workspace selection fails closed across tenant boundaries", () => {
  const base = createEnterpriseIdentityState();
  const state = {
    ...base,
    organizations: [
      ...base.organizations,
      {
        id: "org-other",
        displayName: "Other tenant",
        slug: "other",
        dataRegion: "us-central" as const,
        verifiedDomains: ["other.example"],
      },
    ],
    workspaces: [
      ...base.workspaces,
      {
        id: "workspace-other",
        organizationId: "org-other",
        name: "Other workspace",
        slug: "other",
        status: "active" as const,
      },
    ],
  };

  const outcome = activateWorkspace(state, "workspace-other", "2026-07-15T03:00:00.000Z");
  assert.equal(outcome.changed, false);
  assert.equal(outcome.reason, "forbidden");
  assert.equal(outcome.state.activeWorkspaceId, base.activeWorkspaceId);
  assert.equal(isFeatureEnabled(state, "identity.policy_preview", "org-other", "workspace-other"), false);
});

test("delegated administration adds one narrow capability without role escalation", () => {
  const ownerState = createEnterpriseIdentityState();
  const before = { ...ownerState, currentUserId: "user-jordan" };
  assert.equal(canPerformGovernance(before, "brand.manage"), true);
  assert.equal(canPerformGovernance(before, "policy.manage"), false);
  assert.equal(canPerformGovernance(before, "organization.manage"), false);

  const delegated = setDelegatedCapability(
    ownerState,
    "membership-jordan",
    "policy.manage",
    true,
    "2026-07-15T03:01:00.000Z",
  );
  assert.equal(delegated.changed, true);
  const asJordan = { ...delegated.state, currentUserId: "user-jordan" };
  assert.equal(canPerformGovernance(asJordan, "policy.manage"), true);
  assert.equal(canPerformGovernance(asJordan, "organization.manage"), false);
});

test("policy preview cannot remove the only verified authentication path", () => {
  const state = createEnterpriseIdentityState();
  const denied = updateAccessPolicy(
    state,
    { passwordAuthenticationEnabled: false },
    "2026-07-15T03:02:00.000Z",
  );
  assert.equal(denied.changed, false);
  assert.equal(denied.reason, "sso_required");
  assert.equal(denied.state.policies[0].passwordAuthenticationEnabled, true);

  const verified = {
    ...state,
    policies: state.policies.map((policy) => ({ ...policy, ssoStatus: "verified" as const })),
  };
  const allowed = updateAccessPolicy(
    verified,
    { passwordAuthenticationEnabled: false },
    "2026-07-15T03:03:00.000Z",
  );
  assert.equal(allowed.changed, true);
  assert.equal(allowed.state.policies[0].passwordAuthenticationEnabled, false);
});

test("session controls protect the current session and revoke only same-tenant records", () => {
  const state = createEnterpriseIdentityState();
  const current = revokeDemoSession(state, "session-current", "2026-07-15T03:04:00.000Z");
  assert.equal(current.reason, "current_session");
  assert.equal(current.changed, false);

  const revoked = revokeDemoSession(state, "session-studio", "2026-07-15T03:05:00.000Z");
  assert.equal(revoked.changed, true);
  assert.equal(
    revoked.state.sessions.find((session) => session.id === "session-studio")?.revokedAt,
    "2026-07-15T03:05:00.000Z",
  );
});

test("schema migration recovers known preferences and rejects unknown versions", () => {
  const migrated = restoreEnterpriseIdentityState(
    JSON.stringify({
      schemaVersion: 1,
      profile: { locale: "en-GB", highContrast: true },
      activeWorkspaceId: "workspace-executive-review",
    }),
  );
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.profile.locale, "en-GB");
  assert.equal(migrated.state.profile.highContrast, true);
  assert.equal(migrated.state.activeWorkspaceId, "workspace-executive-review");

  const recovered = restoreEnterpriseIdentityState(JSON.stringify({ schemaVersion: 999 }));
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.state.schemaVersion, 2);
});

test("restoration migrates the retired workspace display name without changing its stable id", () => {
  const base = createEnterpriseIdentityState();
  const legacy = {
    ...base,
    workspaces: base.workspaces.map((workspace) =>
      workspace.id === "workspace-co-deliver"
        ? { ...workspace, name: "Co-Deliver" }
        : workspace,
    ),
  };

  const restored = restoreEnterpriseIdentityState(JSON.stringify(legacy)).state;
  const workspace = restored.workspaces.find((candidate) => candidate.id === "workspace-co-deliver");
  assert.equal(workspace?.id, "workspace-co-deliver");
  assert.equal(workspace?.name, "Co-Production Pro");
});

test("governance export is tenant-scoped and redacts direct identifiers", () => {
  const state = createEnterpriseIdentityState();
  const exported = buildGovernanceExport(state, "2026-07-15T03:06:00.000Z");
  assert.ok(exported);
  const serialized = JSON.stringify(exported);
  assert.equal(serialized.includes("bailey@contentco-op.com"), false);
  assert.equal(serialized.includes("session-current"), false);
  assert.equal(exported?.organization.id, state.activeOrganizationId);
  assert.equal(exported?.mode, "demo");
});
