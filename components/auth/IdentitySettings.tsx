"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  Accessibility,
  CalendarDays,
  Check,
  Clock3,
  Download,
  Fingerprint,
  Globe2,
  KeyRound,
  Laptop,
  Languages,
  LockKeyhole,
  MonitorSmartphone,
  Moon,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  UserCog,
  UsersRound,
} from "lucide-react";
import {
  activateWorkspace,
  buildGovernanceExport,
  canPerformGovernance,
  isFeatureEnabled,
  renameOrganization,
  renameWorkspace,
  revokeDemoSession,
  setDelegatedCapability,
  setFeatureFlag,
  updateAccessPolicy,
  updateEnterpriseProfile,
  type EnterpriseIdentityState,
  type EnterpriseMutationResult,
  type FeatureFlagKey,
  type GovernanceCapability,
} from "./enterprise-model";
import { SettingsSection, SettingsToggle, StatusBadge, settingsStyles as styles } from "./SettingsFrame";
import {
  updateDemoAppearance,
  updateDemoProfile,
  type DemoWorkspaceSettings,
} from "@/lib/demo/workspace-store";

const REVIEWER_COLORS = [
  "#4c8ef5",
  "#286eb5",
  "#14694e",
  "#22c55e",
  "#14b8a6",
  "#b64e4e",
  "#b66c18",
  "#c33778",
  "#7c4bb2",
  "#9a6500",
  "#4e57b8",
  "#087e91",
];

const DELEGATED_CAPABILITIES: Array<{
  capability: GovernanceCapability;
  label: string;
}> = [
  { capability: "policy.manage", label: "Policy" },
  { capability: "brand.manage", label: "Brand" },
  { capability: "session.manage", label: "Sessions" },
  { capability: "audit.export", label: "Audit" },
  { capability: "feature_flags.manage", label: "Flags" },
];

const FEATURE_FLAGS: Array<{ key: FeatureFlagKey; label: string; detail: string }> = [
  {
    key: "identity.policy_preview",
    label: "Identity policy preview",
    detail: "Expose staged policy controls to organization owners.",
  },
  {
    key: "identity.audit_export",
    label: "Governance export",
    detail: "Allow a redacted local audit and configuration export.",
  },
  {
    key: "branding.version_history",
    label: "Brand version history",
    detail: "Enable workspace-scoped draft, publish, and rollback controls.",
  },
];

type MutateEnterprise = (
  mutation: (state: EnterpriseIdentityState) => EnterpriseMutationResult,
) => EnterpriseMutationResult;

interface SharedPanelProps {
  state: EnterpriseIdentityState;
  demoMode: boolean;
  mutate: MutateEnterprise;
  onNotice: (message: string) => void;
}

function reportMutation(
  outcome: EnterpriseMutationResult,
  onNotice: (message: string) => void,
  success: string,
) {
  if (outcome.changed || outcome.reason === "ok") {
    onNotice(success);
    return;
  }
  const message = {
    forbidden: "Your current role cannot make that change",
    invalid: "The requested value was not accepted",
    not_found: "The target is outside the active organization",
    current_session: "Use sign out to end the current session",
    sso_required: "Verify SSO before disabling password access",
    ok: success,
  }[outcome.reason];
  onNotice(message);
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? "C"}${lastName[0] ?? "C"}`.toUpperCase();
}

export function AccountSettings({
  state,
  demoMode,
  mutate,
  onNotice,
  profile,
  email,
}: SharedPanelProps & {
  profile: DemoWorkspaceSettings["profile"];
  email: string;
}) {
  function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoMode) {
      onNotice("Profile writes require the managed identity service");
      return;
    }
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get("firstName") ?? "").trim();
    const lastName = String(data.get("lastName") ?? "").trim();
    const title = String(data.get("title") ?? "").trim();
    const avatarPath = String(data.get("avatarPath") ?? "").trim();
    updateDemoProfile({ firstName, lastName, avatarPath });
    const outcome = mutate((current) =>
      updateEnterpriseProfile(current, { firstName, lastName, title }),
    );
    reportMutation(outcome, onNotice, "Account profile saved");
  }

  const membership = state.memberships.find(
    (candidate) =>
      candidate.userId === state.currentUserId &&
      candidate.organizationId === state.activeOrganizationId,
  );

  return (
    <div className={styles.panel}>
      <SettingsSection
        title="Account identity"
        detail="Identity attributes shown across internal comments, approvals, and audit records."
        action={<StatusBadge tone="good">{membership?.role ?? "member"}</StatusBadge>}
      >
        <div className={styles.identitySummary}>
          <div className={styles.avatar} style={{ backgroundColor: profile.reviewerColor }}>
            {profile.avatarPath ? (
              <Image
                className={styles.avatarImage}
                src={profile.avatarPath}
                alt=""
                width={52}
                height={52}
                unoptimized
              />
            ) : initials(profile.firstName, profile.lastName)}
          </div>
          <div className={styles.identityCopy}>
            <strong>{profile.firstName} {profile.lastName}</strong>
            <span>{email}</span>
          </div>
          <span className={styles.scopeBadge}>Organization identity</span>
        </div>
      </SettingsSection>

      <SettingsSection title="Profile" detail="The email address remains owned by the authentication provider.">
        <form
          key={`${profile.firstName}-${profile.lastName}-${profile.avatarPath}-${state.profile.title}-${email}`}
          className={styles.formGrid}
          onSubmit={saveAccount}
        >
          <label className={styles.field}>
            <span>First name</span>
            <input
              className={styles.input}
              name="firstName"
              defaultValue={profile.firstName}
              autoComplete="given-name"
              required
              maxLength={60}
              disabled={!demoMode}
            />
          </label>
          <label className={styles.field}>
            <span>Last name</span>
            <input
              className={styles.input}
              name="lastName"
              defaultValue={profile.lastName}
              autoComplete="family-name"
              required
              maxLength={60}
              disabled={!demoMode}
            />
          </label>
          <label className={styles.field}>
            <span>Role title</span>
            <input
              className={styles.input}
              name="title"
              defaultValue={state.profile.title}
              autoComplete="organization-title"
              maxLength={80}
              disabled={!demoMode}
            />
          </label>
          <label className={styles.field}>
            <span>Email</span>
            <input
              className={`${styles.input} ${styles.readOnly}`}
              value={email}
              readOnly
              aria-readonly="true"
            />
          </label>
          <label className={styles.field}>
            <span>Profile photo</span>
            <select
              className={styles.select}
              name="avatarPath"
              defaultValue={profile.avatarPath}
              disabled={!demoMode}
            >
              <option value="/brand/bailey-eubanks-profile.jpg">Bailey Eubanks portrait</option>
              <option value="">Use initials</option>
            </select>
          </label>
          <div className={styles.formActions}>
            <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit" disabled={!demoMode}>
              <Save size={14} aria-hidden="true" /> Save profile
            </button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection title="Reviewer color" detail="Used to distinguish annotations and review activity.">
        <div className={styles.colorGrid}>
          {REVIEWER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={styles.colorButton}
              style={{ backgroundColor: color, color }}
              aria-label={`Use reviewer color ${color}`}
              aria-pressed={profile.reviewerColor === color}
              disabled={!demoMode}
              onClick={() => {
                updateDemoProfile({ reviewerColor: color });
                onNotice("Reviewer color saved");
              }}
            />
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

export function OrganizationSettings({ state, demoMode, mutate, onNotice }: SharedPanelProps) {
  const organization = state.organizations.find(
    (candidate) => candidate.id === state.activeOrganizationId,
  );
  const workspace = state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId);
  const canManageOrganization = canPerformGovernance(state, "organization.manage");
  const canManageWorkspace = canPerformGovernance(state, "workspace.manage");
  const canDelegate = state.memberships.some(
    (membership) =>
      membership.userId === state.currentUserId &&
      membership.organizationId === state.activeOrganizationId &&
      membership.role === "owner",
  );

  function saveNames(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoMode) {
      onNotice("Organization writes require server authorization");
      return;
    }
    const data = new FormData(event.currentTarget);
    const outcome = mutate((current) => {
      const organizationOutcome = renameOrganization(
        current,
        String(data.get("organizationName") ?? ""),
      );
      if (!organizationOutcome.changed) return organizationOutcome;
      return renameWorkspace(
        organizationOutcome.state,
        state.activeWorkspaceId,
        String(data.get("workspaceName") ?? ""),
      );
    });
    reportMutation(outcome, onNotice, "Organization and workspace saved");
  }

  function exportGovernance() {
    if (!demoMode) {
      onNotice("Audit export requires server authorization");
      return;
    }
    const payload = buildGovernanceExport(state);
    if (!payload) {
      onNotice("Your current role cannot export governance data");
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${organization?.slug ?? "co-production-pro"}-governance-demo.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice("Redacted governance export created");
  }

  if (!organization || !workspace) return null;

  return (
    <div className={styles.panel}>
      <SettingsSection
        title="Tenant context"
        detail="Policy and brand changes are evaluated inside the active organization and workspace."
        action={<StatusBadge tone="info">US Central</StatusBadge>}
      >
        <div className={styles.workspaceBar}>
          <div>
            <div className={styles.identityCopy}>
              <strong>{organization.displayName}</strong>
              <span>{organization.id}</span>
            </div>
            <div className={styles.tenantMeta}>
              <StatusBadge tone="good">
                <Check size={11} aria-hidden="true" /> {organization.verifiedDomains[0]}
              </StatusBadge>
              <span className={styles.scopeBadge}>{workspace.name}</span>
            </div>
          </div>
          <label className={styles.field}>
            <span>Active workspace</span>
            <select
              className={styles.select}
              value={state.activeWorkspaceId}
              disabled={!demoMode}
              onChange={(event) => {
                const outcome = mutate((current) => activateWorkspace(current, event.target.value));
                reportMutation(outcome, onNotice, "Workspace context changed");
              }}
            >
              {state.workspaces
                .filter((candidate) => candidate.organizationId === organization.id && candidate.status === "active")
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                ))}
            </select>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title="Organization and workspace names" detail="Technical IDs remain stable behind this demo surface.">
        <form
          key={`${organization.displayName}-${workspace.name}`}
          className={styles.formGrid}
          onSubmit={saveNames}
        >
          <label className={styles.field}>
            <span>Organization name</span>
            <input
              className={styles.input}
              name="organizationName"
              defaultValue={organization.displayName}
              disabled={!demoMode || !canManageOrganization}
              required
              maxLength={80}
            />
          </label>
          <label className={styles.field}>
            <span>Workspace name</span>
            <input
              className={styles.input}
              name="workspaceName"
              defaultValue={workspace.name}
              disabled={!demoMode || !canManageWorkspace}
              required
              maxLength={72}
            />
          </label>
          <div className={styles.formActions}>
            <button
              className={`${styles.button} ${styles.buttonPrimary}`}
              type="submit"
              disabled={!demoMode || (!canManageOrganization && !canManageWorkspace)}
            >
              <Save size={14} aria-hidden="true" /> Save names
            </button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection title="Membership and delegation" detail="Delegation grants narrow capabilities without changing the base role.">
        <div style={{ overflowX: "auto" }}>
          <table className={styles.memberTable}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Delegated administration</th>
              </tr>
            </thead>
            <tbody>
              {state.memberships
                .filter((membership) => membership.organizationId === organization.id)
                .map((membership) => (
                  <tr key={membership.id}>
                    <td>
                      <span className={styles.memberName}>
                        <strong>{membership.displayName}</strong>
                        <span>{membership.email}</span>
                      </span>
                    </td>
                    <td><StatusBadge>{membership.role}</StatusBadge></td>
                    <td>
                      {membership.role === "owner" || membership.role === "viewer" ? (
                        <span className={styles.scopeBadge}>
                          {membership.role === "owner" ? "Full authority" : "No delegation"}
                        </span>
                      ) : (
                        <div className={styles.delegationList}>
                          {DELEGATED_CAPABILITIES.map(({ capability, label }) => (
                            <label key={capability}>
                              <input
                                type="checkbox"
                                checked={membership.delegatedCapabilities.includes(capability)}
                                disabled={!demoMode || !canDelegate}
                                onChange={(event) => {
                                  const outcome = mutate((current) =>
                                    setDelegatedCapability(
                                      current,
                                      membership.id,
                                      capability,
                                      event.target.checked,
                                    ),
                                  );
                                  reportMutation(outcome, onNotice, "Delegated authority updated");
                                }}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Workspace feature flags"
        detail="Unknown flags and cross-tenant workspace IDs resolve disabled."
      >
        <div className={styles.flagList}>
          {FEATURE_FLAGS.map((flag) => {
            const workspaceScoped = flag.key === "branding.version_history";
            const workspaceId = workspaceScoped ? state.activeWorkspaceId : null;
            return (
              <div className={styles.flagRow} key={flag.key}>
                <div className={styles.controlCopy}>
                  <strong>{flag.label}</strong>
                  <span>{flag.detail}</span>
                </div>
                <SettingsToggle
                  checked={isFeatureEnabled(state, flag.key, organization.id, workspaceId)}
                  disabled={!demoMode || !canPerformGovernance(state, "feature_flags.manage")}
                  label={`Toggle ${flag.label}`}
                  onChange={(enabled) => {
                    const outcome = mutate((current) =>
                      setFeatureFlag(current, flag.key, enabled, workspaceId),
                    );
                    reportMutation(outcome, onNotice, "Feature flag updated");
                  }}
                />
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Audit export"
        detail="The local export excludes member emails, session IDs, credentials, and tokens."
        action={
          <button
            type="button"
            className={styles.button}
            onClick={exportGovernance}
            disabled={!demoMode || !canPerformGovernance(state, "audit.export")}
          >
            <Download size={14} aria-hidden="true" /> Export JSON
          </button>
        }
      >
        <div className={styles.controlRow}>
          <span className={styles.controlIcon}><Clock3 size={15} aria-hidden="true" /></span>
          <div className={styles.controlCopy}>
            <strong>{state.audit.length} local governance events</strong>
            <span>Last event: {state.audit[0]?.action ?? "No activity"}</span>
          </div>
          <StatusBadge tone="info">Demo only</StatusBadge>
        </div>
      </SettingsSection>
    </div>
  );
}

export function SecuritySettings({ state, demoMode, mutate, onNotice }: SharedPanelProps) {
  const policy = state.policies.find(
    (candidate) => candidate.organizationId === state.activeOrganizationId,
  );
  if (!policy) return null;
  const canManagePolicy = canPerformGovernance(state, "policy.manage");

  function applyPolicy(patch: Parameters<typeof updateAccessPolicy>[1], success: string) {
    const outcome = mutate((current) => updateAccessPolicy(current, patch));
    reportMutation(outcome, onNotice, success);
  }

  return (
    <div className={styles.panel}>
      <SettingsSection
        title="Authentication policy"
        detail="Policy controls persist locally in demo mode and never alter real credentials."
        action={<StatusBadge tone="info">Owner policy</StatusBadge>}
      >
        <div className={styles.policyGrid}>
          <label className={styles.field}>
            <span>MFA requirement</span>
            <select
              className={styles.select}
              value={policy.mfaRequirement}
              disabled={!demoMode || !canManagePolicy}
              onChange={(event) =>
                applyPolicy(
                  { mfaRequirement: event.target.value as typeof policy.mfaRequirement },
                  "MFA policy preview updated",
                )
              }
            >
              <option value="optional">Optional</option>
              <option value="administrators">Administrators</option>
              <option value="everyone">Everyone</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Idle session timeout</span>
            <select
              className={styles.select}
              value={policy.sessionIdleMinutes}
              disabled={!demoMode || !canManagePolicy}
              onChange={(event) =>
                applyPolicy(
                  { sessionIdleMinutes: Number(event.target.value) as typeof policy.sessionIdleMinutes },
                  "Idle timeout preview updated",
                )
              }
            >
              {[15, 30, 60, 120, 240].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60
                    ? `${minutes} minutes`
                    : minutes === 60
                      ? "1 hour"
                      : `${minutes / 60} hours`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Maximum session lifetime</span>
            <select
              className={styles.select}
              value={policy.sessionMaxDays}
              disabled={!demoMode || !canManagePolicy}
              onChange={(event) =>
                applyPolicy(
                  { sessionMaxDays: Number(event.target.value) as typeof policy.sessionMaxDays },
                  "Session lifetime preview updated",
                )
              }
            >
              {[1, 7, 14, 30, 90].map((days) => (
                <option key={days} value={days}>{days === 1 ? "1 day" : `${days} days`}</option>
              ))}
            </select>
          </label>
          <div className={styles.field}>
            <span>Admin changes</span>
            <div className={styles.controlRow}>
              <span className={styles.controlIcon}><UserCog size={15} aria-hidden="true" /></span>
              <div className={styles.controlCopy}>
                <strong>Require approval</strong>
                <span>Policy and delegation changes</span>
              </div>
              <SettingsToggle
                checked={policy.adminApprovalRequired}
                disabled={!demoMode || !canManagePolicy}
                label="Require approval for administrator changes"
                onChange={(adminApprovalRequired) =>
                  applyPolicy({ adminApprovalRequired }, "Admin approval policy preview updated")
                }
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Managed identity readiness" detail="Configuration remains unavailable until server metadata, secrets, and verified domains exist.">
        <div className={styles.providerList}>
          {[
            { icon: <KeyRound size={15} />, name: "SAML / OIDC SSO", status: policy.ssoStatus },
            { icon: <UsersRound size={15} />, name: "SCIM directory sync", status: policy.scimStatus },
            { icon: <Fingerprint size={15} />, name: "Multi-factor enrollment", status: "preview" as const },
          ].map((provider) => (
            <div className={styles.providerRow} key={provider.name}>
              <span className={styles.controlIcon} aria-hidden="true">{provider.icon}</span>
              <div className={styles.controlCopy}>
                <strong>{provider.name}</strong>
                <span>Organization-scoped identity provider</span>
              </div>
              <StatusBadge tone={provider.status === "verified" ? "good" : provider.status === "preview" ? "info" : "neutral"}>
                {provider.status === "not_configured" ? "Not configured" : provider.status}
              </StatusBadge>
            </div>
          ))}
        </div>
        <div className={styles.controlRow}>
          <span className={styles.controlIcon}><LockKeyhole size={15} aria-hidden="true" /></span>
          <div className={styles.controlCopy}>
            <strong>Password authentication</strong>
            <span>Cannot be disabled until SSO is verified.</span>
          </div>
          <SettingsToggle
            checked={policy.passwordAuthenticationEnabled}
            disabled={!demoMode || !canManagePolicy || policy.ssoStatus !== "verified"}
            label="Toggle password authentication"
            onChange={(passwordAuthenticationEnabled) =>
              applyPolicy({ passwordAuthenticationEnabled }, "Password policy preview updated")
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Sessions and devices" detail="Revocation below changes only the local demo session ledger.">
        <div className={styles.sessionList}>
          {state.sessions
            .filter((session) => session.organizationId === state.activeOrganizationId)
            .map((session) => {
              const DeviceIcon = session.device.includes("iPhone") ? Smartphone : session.current ? Laptop : MonitorSmartphone;
              return (
                <div className={styles.sessionRow} key={session.id}>
                  <span className={styles.controlIcon}><DeviceIcon size={15} aria-hidden="true" /></span>
                  <div className={styles.sessionMeta}>
                    <strong>{session.device}</strong>
                    <span>{session.location} · Last active {new Date(session.lastActiveAt).toLocaleDateString(state.profile.locale)}</span>
                  </div>
                  {session.revokedAt ? (
                    <StatusBadge tone="warn">Revoked</StatusBadge>
                  ) : session.current ? (
                    <StatusBadge tone="good">Current</StatusBadge>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonDanger}`}
                      disabled={!demoMode}
                      onClick={() => {
                        const outcome = mutate((current) => revokeDemoSession(current, session.id));
                        reportMutation(outcome, onNotice, "Demo session revoked");
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </SettingsSection>
    </div>
  );
}

export function PreferenceSettings({
  state,
  demoMode,
  mutate,
  onNotice,
  appearance,
  onReset,
}: SharedPanelProps & {
  appearance: DemoWorkspaceSettings["appearance"];
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const cancelResetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmReset) cancelResetRef.current?.focus();
  }, [confirmReset]);

  function closeResetConfirmation() {
    setConfirmReset(false);
    window.requestAnimationFrame(() => resetButtonRef.current?.focus());
  }

  function confirmLocalReset() {
    onReset();
    setConfirmReset(false);
    window.requestAnimationFrame(() => resetButtonRef.current?.focus());
  }

  function updatePreference(
    patch: Parameters<typeof updateEnterpriseProfile>[1],
    message: string,
  ) {
    const outcome = mutate((current) => updateEnterpriseProfile(current, patch));
    reportMutation(outcome, onNotice, message);
  }

  return (
    <div className={styles.panel}>
      <SettingsSection title="Appearance and accessibility" detail="Preferences are scoped to this account in the local demo.">
        <div className={styles.controlList}>
          <div className={styles.controlRow}>
            <span className={styles.controlIcon}><Moon size={15} aria-hidden="true" /></span>
            <div className={styles.controlCopy}>
              <strong>Dark interface</strong>
              <span>Use a dark treatment on supporting pages; the review cockpit stays bright.</span>
            </div>
            <SettingsToggle
              checked={appearance.darkMode}
              disabled={!demoMode}
              label="Toggle dark interface"
              onChange={(darkMode) => {
                updateDemoAppearance({ darkMode });
                onNotice("Appearance saved");
              }}
            />
          </div>
          <div className={styles.controlRow}>
            <span className={styles.controlIcon}><Accessibility size={15} aria-hidden="true" /></span>
            <div className={styles.controlCopy}>
              <strong>Reduced motion</strong>
              <span>Minimize transitions and animated feedback.</span>
            </div>
            <SettingsToggle
              checked={appearance.reducedMotion}
              disabled={!demoMode}
              label="Toggle reduced motion"
              onChange={(reducedMotion) => {
                updateDemoAppearance({ reducedMotion });
                onNotice("Motion preference saved");
              }}
            />
          </div>
          <div className={styles.controlRow}>
            <span className={styles.controlIcon}><ShieldCheck size={15} aria-hidden="true" /></span>
            <div className={styles.controlCopy}>
              <strong>High contrast settings</strong>
              <span>Increase text and control boundary contrast on this surface.</span>
            </div>
            <SettingsToggle
              checked={state.profile.highContrast}
              disabled={!demoMode}
              label="Toggle high contrast settings"
              onChange={(highContrast) =>
                updatePreference({ highContrast }, "Contrast preference saved")
              }
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Locale and time" detail="Formatting preferences do not change organization data residency.">
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span><Languages size={12} aria-hidden="true" /> Locale</span>
            <select
              className={styles.select}
              value={state.profile.locale}
              disabled={!demoMode}
              onChange={(event) =>
                updatePreference(
                  { locale: event.target.value as typeof state.profile.locale },
                  "Locale preference saved",
                )
              }
            >
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="es-US">Español (Estados Unidos)</option>
            </select>
          </label>
          <label className={styles.field}>
            <span><Globe2 size={12} aria-hidden="true" /> Time zone</span>
            <select
              className={styles.select}
              value={state.profile.timeZone}
              disabled={!demoMode}
              onChange={(event) =>
                updatePreference(
                  { timeZone: event.target.value as typeof state.profile.timeZone },
                  "Time zone preference saved",
                )
              }
            >
              <option value="America/Chicago">Central Time</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <label className={styles.field}>
            <span><CalendarDays size={12} aria-hidden="true" /> Week starts on</span>
            <select
              className={styles.select}
              value={state.profile.weekStartsOn}
              disabled={!demoMode}
              onChange={(event) =>
                updatePreference(
                  { weekStartsOn: event.target.value as typeof state.profile.weekStartsOn },
                  "Calendar preference saved",
                )
              }
            >
              <option value="sunday">Sunday</option>
              <option value="monday">Monday</option>
            </select>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title="Local demo reset" detail="Restore seeded projects, reviews, identity policy, and brand history.">
        <div className={styles.controlRow}>
          <span className={styles.controlIcon}><RotateCcw size={15} aria-hidden="true" /></span>
          <div className={styles.controlCopy}>
            <strong>Reset browser workspace</strong>
            <span>This does not call a server or modify production data.</span>
          </div>
          {confirmReset ? (
            <div
              className={styles.resetActions}
              role="group"
              aria-label="Confirm local demo reset"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                closeResetConfirmation();
              }}
            >
              <button
                ref={cancelResetRef}
                type="button"
                className={styles.button}
                onClick={closeResetConfirmation}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={confirmLocalReset}
              >
                Confirm reset
              </button>
            </div>
          ) : (
            <button
              ref={resetButtonRef}
              type="button"
              className={`${styles.button} ${styles.buttonDanger}`}
              disabled={!demoMode}
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
