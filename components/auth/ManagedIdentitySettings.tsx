"use client";

import { useState, type FormEvent } from "react";
import { Building2, Loader2, Palette, Save, ShieldCheck, UserRound } from "lucide-react";
import type { SettingsTab } from "./settings-route";
import {
  SettingsSection,
  SettingsToggle,
  StatusBadge,
  type SettingsNoticeTone,
  settingsStyles as styles,
} from "./SettingsFrame";
import type {
  IdentityContext,
  IdentityMutationResponse,
} from "./useIdentityContext";
import type { IdentityMutation } from "@/lib/identity/authority";

interface ManagedIdentitySettingsProps {
  tab: Exclude<SettingsTab, "notifications">;
  context: IdentityContext;
  mutate: (mutation: IdentityMutation) => Promise<IdentityMutationResponse>;
  onNotice: (message: string, tone?: SettingsNoticeTone) => void;
}

const REVIEWER_COLORS = [
  "#4c8ef5",
  "#286eb5",
  "#14694e",
  "#b64e4e",
  "#b66c18",
  "#7c4bb2",
] as const;

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The managed account service could not save this change";
}

function revisionIdFrom(response: IdentityMutationResponse) {
  if (!response.result || typeof response.result !== "object" || Array.isArray(response.result)) {
    return null;
  }
  const id = (response.result as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function formString(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

export default function ManagedIdentitySettings({
  tab,
  context,
  mutate,
  onNotice,
}: ManagedIdentitySettingsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const activeMembership = context.memberships.find(
    (membership) => membership.teamId === context.activeTeamId,
  );

  async function run(key: string, success: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      onNotice(success);
    } catch (error) {
      onNotice(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  if (tab === "account") {
    return (
      <div className={styles.panel}>
        <SettingsSection
          title="Account identity"
          detail="Identity used for comments, approvals, and audit records."
          action={<StatusBadge tone="good">{activeMembership?.role ?? "member"}</StatusBadge>}
        >
          <div className={styles.identitySummary}>
            <div
              className={styles.avatar}
              style={{ backgroundColor: context.profile.reviewerColor }}
            >
              {(context.profile.firstName[0] ?? "C").toUpperCase()}
              {(context.profile.lastName[0] ?? "C").toUpperCase()}
            </div>
            <div className={styles.identityCopy}>
              <strong>
                {context.profile.firstName} {context.profile.lastName}
              </strong>
              <span>{context.actor.email ?? "Managed account"}</span>
            </div>
            <span className={styles.scopeBadge}>Managed identity</span>
          </div>
        </SettingsSection>

        <SettingsSection title="Profile">
          <form
            key={context.profile.version}
            className={styles.formGrid}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run("profile", "Account profile saved", () =>
                mutate({
                  action: "profile.update",
                  expectedVersion: context.profile.version,
                  patch: {
                    firstName: formString(data, "firstName"),
                    lastName: formString(data, "lastName"),
                    title: formString(data, "title"),
                  },
                }),
              );
            }}
          >
            <label className={styles.field}>
              <span>First name</span>
              <input
                className={styles.input}
                name="firstName"
                defaultValue={context.profile.firstName}
                maxLength={80}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Last name</span>
              <input
                className={styles.input}
                name="lastName"
                defaultValue={context.profile.lastName}
                maxLength={80}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Role title</span>
              <input
                className={styles.input}
                name="title"
                defaultValue={context.profile.title}
                maxLength={120}
              />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input
                className={`${styles.input} ${styles.readOnly}`}
                value={context.actor.email ?? ""}
                readOnly
              />
            </label>
            <div className={styles.formActions}>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="submit"
                disabled={Boolean(busy)}
              >
                {busy === "profile" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save profile
              </button>
            </div>
          </form>
        </SettingsSection>

        <SettingsSection title="Reviewer color">
          <div className={styles.colorGrid}>
            {REVIEWER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.colorButton}
                style={{ backgroundColor: color, color }}
                aria-label={`Use reviewer color ${color}`}
                aria-pressed={context.profile.reviewerColor === color}
                disabled={Boolean(busy)}
                onClick={() =>
                  void run("reviewer-color", "Reviewer color saved", () =>
                    mutate({
                      action: "profile.update",
                      expectedVersion: context.profile.version,
                      patch: { reviewerColor: color },
                    }),
                  )
                }
              />
            ))}
          </div>
        </SettingsSection>
      </div>
    );
  }

  if (tab === "organization") {
    return (
      <div className={styles.panel}>
        <SettingsSection
          title="Organization context"
          detail="The active organization controls projects, policy, and branding."
          action={<Building2 size={17} />}
        >
          <div className={styles.workspaceBar}>
            <div className={styles.identityCopy}>
              <strong>{activeMembership?.teamName ?? "No active organization"}</strong>
              <span>{context.activeTeamId ?? "No organization selected"}</span>
            </div>
            <label className={styles.field}>
              <span>Active organization</span>
              <select
                className={styles.select}
                value={context.activeTeamId ?? ""}
                disabled={Boolean(busy) || context.memberships.length === 0}
                onChange={(event) =>
                  void run("active-team", "Organization context changed", () =>
                    mutate({
                      action: "preferences.update",
                      expectedVersion: context.preferences.version,
                      patch: { activeTeamId: event.target.value || null },
                    }),
                  )
                }
              >
                {context.memberships.map((membership) => (
                  <option key={membership.teamId} value={membership.teamId}>
                    {membership.teamName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="Your memberships">
          <div style={{ overflowX: "auto" }}>
            <table className={styles.memberTable}>
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Role</th>
                  <th>Delegated authority</th>
                </tr>
              </thead>
              <tbody>
                {context.memberships.map((membership) => (
                  <tr key={membership.teamId}>
                    <td>{membership.teamName}</td>
                    <td><StatusBadge tone="info">{membership.role}</StatusBadge></td>
                    <td>{membership.delegatedCapabilities.join(", ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      </div>
    );
  }

  if (tab === "security") {
    const policy = context.policy;
    return (
      <div className={styles.panel}>
        <SettingsSection
          title="Access policy"
          detail="Organization-wide sign-in and session policy."
          action={<ShieldCheck size={17} />}
        >
          {policy && context.activeTeamId ? (
            <form
              key={`${context.activeTeamId}-${policy.version}`}
              className={styles.policyGrid}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void run("policy", "Access policy saved", () =>
                  mutate({
                    action: "policy.update",
                    teamId: context.activeTeamId as string,
                    expectedVersion: policy.version,
                    patch: {
                      mfaRequirement: formString(data, "mfaRequirement") as
                        | "optional"
                        | "administrators"
                        | "everyone",
                      sessionIdleMinutes: Number(data.get("sessionIdleMinutes")) as 15 | 30 | 60 | 120 | 240,
                      sessionMaxDays: Number(data.get("sessionMaxDays")) as 1 | 7 | 14 | 30 | 90,
                      passwordAuthenticationEnabled: data.get("passwordAuthenticationEnabled") === "on",
                      adminApprovalRequired: data.get("adminApprovalRequired") === "on",
                    },
                  }),
                );
              }}
            >
              <label className={styles.field}>
                <span>MFA requirement</span>
                <select className={styles.select} name="mfaRequirement" defaultValue={policy.mfaRequirement}>
                  <option value="optional">Optional</option>
                  <option value="administrators">Administrators</option>
                  <option value="everyone">Everyone</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Idle timeout</span>
                <select className={styles.select} name="sessionIdleMinutes" defaultValue={policy.sessionIdleMinutes}>
                  {[15, 30, 60, 120, 240].map((minutes) => (
                    <option key={minutes} value={minutes}>{minutes} minutes</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Maximum session</span>
                <select className={styles.select} name="sessionMaxDays" defaultValue={policy.sessionMaxDays}>
                  {[1, 7, 14, 30, 90].map((days) => (
                    <option key={days} value={days}>{days} days</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Password access</span>
                <input
                  name="passwordAuthenticationEnabled"
                  type="checkbox"
                  defaultChecked={policy.passwordAuthenticationEnabled}
                />
              </label>
              <label className={styles.field}>
                <span>Admin approval</span>
                <input
                  name="adminApprovalRequired"
                  type="checkbox"
                  defaultChecked={policy.adminApprovalRequired}
                />
              </label>
              <div className={styles.formActions}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  type="submit"
                  disabled={Boolean(busy)}
                >
                  {busy === "policy" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save policy
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select an organization to manage access policy.</p>
          )}
        </SettingsSection>

        <SettingsSection title="Release controls">
          <div className={styles.flagList}>
            {([
              ["identity.policy_preview", "Identity policy preview"],
              ["identity.audit_export", "Governance export"],
              ["branding.version_history", "Brand version history"],
            ] as const).map(([key, label]) => {
              const flag = context.featureFlags.find(
                (candidate) => candidate.key === key && candidate.projectId === null,
              );
              return (
                <div key={key} className={styles.flagRow}>
                  <span>{label}</span>
                  <SettingsToggle
                    checked={flag?.enabled ?? false}
                    label={`${flag?.enabled ? "Disable" : "Enable"} ${label}`}
                    disabled={Boolean(busy) || !context.activeTeamId}
                    onChange={(enabled) => {
                      if (!context.activeTeamId) return;
                      void run(`flag-${key}`, `${label} ${enabled ? "enabled" : "disabled"}`, () =>
                        mutate({
                          action: "feature-flag.update",
                          teamId: context.activeTeamId as string,
                          projectId: null,
                          expectedVersion: flag?.version ?? 0,
                          key,
                          enabled,
                        }),
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        </SettingsSection>
      </div>
    );
  }

  if (tab === "preferences") {
    return (
      <div className={styles.panel}>
        <SettingsSection
          title="Workspace preferences"
          action={<UserRound size={17} />}
        >
          <form
            key={context.preferences.version}
            className={styles.formGrid}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run("preferences", "Workspace preferences saved", () =>
                mutate({
                  action: "preferences.update",
                  expectedVersion: context.preferences.version,
                  patch: {
                    theme: formString(data, "theme") as "system" | "light" | "dark",
                    density: formString(data, "density") as "comfortable" | "compact",
                    reduceMotion: data.get("reduceMotion") === "on",
                    defaultLandingPage: formString(data, "defaultLandingPage") as
                      | "projects"
                      | "reviews"
                      | "activity",
                  },
                }),
              );
            }}
          >
            <label className={styles.field}>
              <span>Theme</span>
              <select className={styles.select} name="theme" defaultValue={context.preferences.theme}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Density</span>
              <select className={styles.select} name="density" defaultValue={context.preferences.density}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Default landing</span>
              <select
                className={styles.select}
                name="defaultLandingPage"
                defaultValue={context.preferences.defaultLandingPage}
              >
                <option value="projects">Projects</option>
                <option value="reviews">Reviews</option>
                <option value="activity">Activity</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Reduce motion</span>
              <input name="reduceMotion" type="checkbox" defaultChecked={context.preferences.reduceMotion} />
            </label>
            <div className={styles.formActions}>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="submit"
                disabled={Boolean(busy)}
              >
                {busy === "preferences" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save preferences
              </button>
            </div>
          </form>
        </SettingsSection>

        <SettingsSection title="Locale and accessibility">
          <form
            key={`locale-${context.profile.version}`}
            className={styles.formGrid}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run("locale", "Locale preferences saved", () =>
                mutate({
                  action: "profile.update",
                  expectedVersion: context.profile.version,
                  patch: {
                    locale: formString(data, "locale") as "en-US" | "en-GB" | "es-US",
                    timeZone: formString(data, "timeZone") as
                      | "America/Chicago"
                      | "America/New_York"
                      | "America/Los_Angeles"
                      | "UTC",
                    weekStartsOn: formString(data, "weekStartsOn") as "sunday" | "monday",
                    highContrast: data.get("highContrast") === "on",
                  },
                }),
              );
            }}
          >
            <label className={styles.field}>
              <span>Language</span>
              <select className={styles.select} name="locale" defaultValue={context.profile.locale}>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-US">Spanish (US)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Time zone</span>
              <select className={styles.select} name="timeZone" defaultValue={context.profile.timeZone}>
                <option value="America/Chicago">Central</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Los_Angeles">Pacific</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Week starts</span>
              <select className={styles.select} name="weekStartsOn" defaultValue={context.profile.weekStartsOn}>
                <option value="sunday">Sunday</option>
                <option value="monday">Monday</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>High contrast</span>
              <input name="highContrast" type="checkbox" defaultChecked={context.profile.highContrast} />
            </label>
            <div className={styles.formActions}>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="submit"
                disabled={Boolean(busy)}
              >
                {busy === "locale" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save locale
              </button>
            </div>
          </form>
        </SettingsSection>
      </div>
    );
  }

  const currentBrand = context.brand?.values ?? {
    displayName: activeMembership?.teamName ?? "Co-VideoPro",
    playerLabel: activeMembership?.teamName ?? "Co-VideoPro Review",
    primaryColor: "#1265e8",
    logoAssetId: null,
    cornerRadius: 6,
    showPoweredBy: true,
  };

  return (
    <div className={styles.panel}>
      <SettingsSection
        title="Published brand"
        detail="Organization identity used on review and delivery surfaces."
        action={<Palette size={17} />}
      >
        {context.activeTeamId ? (
          <form
            key={context.brand?.revisionId ?? context.activeTeamId}
            className={styles.formGrid}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const teamId = context.activeTeamId as string;
              void run("brand", "Brand revision published", async () => {
                const created = await mutate({
                  action: "brand.revision.create",
                  teamId,
                  projectId: null,
                  scope: "organization",
                  expectedPublishedVersion: context.brand?.publicationVersion ?? 0,
                  idempotencyKey: `brand-${Date.now()}-${crypto.randomUUID()}`,
                  values: {
                    displayName: formString(data, "displayName"),
                    playerLabel: formString(data, "playerLabel"),
                    primaryColor: formString(data, "primaryColor"),
                    logoAssetId: currentBrand.logoAssetId,
                    cornerRadius: Number(data.get("cornerRadius")),
                    showPoweredBy: data.get("showPoweredBy") === "on",
                  },
                });
                const revisionId = revisionIdFrom(created);
                if (!revisionId) throw new Error("Brand draft was saved but could not be published");
                await mutate({
                  action: "brand.revision.publish",
                  teamId,
                  revisionId,
                  expectedPublishedVersion: context.brand?.publicationVersion ?? 0,
                });
              });
            }}
          >
            <label className={styles.field}>
              <span>Display name</span>
              <input className={styles.input} name="displayName" defaultValue={currentBrand.displayName} maxLength={120} required />
            </label>
            <label className={styles.field}>
              <span>Player label</span>
              <input className={styles.input} name="playerLabel" defaultValue={currentBrand.playerLabel} maxLength={120} required />
            </label>
            <label className={styles.field}>
              <span>Primary color</span>
              <input className={styles.input} name="primaryColor" type="color" defaultValue={currentBrand.primaryColor} />
            </label>
            <label className={styles.field}>
              <span>Corner radius</span>
              <input className={styles.input} name="cornerRadius" type="number" min={0} max={12} defaultValue={currentBrand.cornerRadius} />
            </label>
            <label className={styles.field}>
              <span>Show Content Co-op attribution</span>
              <input name="showPoweredBy" type="checkbox" defaultChecked={currentBrand.showPoweredBy} />
            </label>
            <div className={styles.formActions}>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="submit"
                disabled={Boolean(busy)}
              >
                {busy === "brand" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Publish brand
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">Select an organization to publish branding.</p>
        )}
      </SettingsSection>
    </div>
  );
}
