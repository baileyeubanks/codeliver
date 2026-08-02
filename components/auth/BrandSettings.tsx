"use client";

import { useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  GitBranch,
  History,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  accessibleForeground,
  contrastRatio,
  normalizeHexColor,
  type BrandLogoPath,
  type BrandScope,
  type BrandValues,
  type LegacyBrandValues,
  type ResolvedBrandValues,
} from "@contentco-op/brand";
import {
  canPerformGovernance,
  isFeatureEnabled,
  type EnterpriseIdentityState,
} from "./enterprise-model";
import { SettingsSection, SettingsToggle, StatusBadge, settingsStyles as styles } from "./SettingsFrame";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import { useBrandGovernanceDemo } from "./useBrandGovernanceDemo";

type EditableBrandField = keyof ResolvedBrandValues;
type OverrideMap = Record<EditableBrandField, boolean>;

const ORGANIZATION_OVERRIDES: OverrideMap = {
  displayName: true,
  playerLabel: true,
  primaryColor: true,
  logoPath: true,
  cornerRadius: true,
  showPoweredBy: true,
};

const WORKSPACE_OVERRIDES: OverrideMap = {
  displayName: false,
  playerLabel: false,
  primaryColor: false,
  logoPath: false,
  cornerRadius: false,
  showPoweredBy: false,
};

function formatRevisionStatus(status: "draft" | "published" | "archived") {
  return status[0].toUpperCase() + status.slice(1);
}

export default function BrandSettings({
  state,
  demoMode,
  legacyBrand,
  coverPath,
  avatarPath,
  onCompanyAssetChange,
  onPublished,
  onNotice,
}: {
  state: EnterpriseIdentityState;
  demoMode: boolean;
  legacyBrand: LegacyBrandValues;
  coverPath: string;
  avatarPath: string;
  onCompanyAssetChange: (patch: { coverPath?: string; avatarPath?: string }) => void;
  onPublished: (brand: ResolvedBrandValues) => void;
  onNotice: (message: string) => void;
}) {
  const [scope, setScope] = useState<Exclude<BrandScope, "platform">>("organization");
  const [overrides, setOverrides] = useState<OverrideMap>(ORGANIZATION_OVERRIDES);
  const context = {
    organizationId: state.activeOrganizationId,
    workspaceId: state.activeWorkspaceId,
  };
  const governance = useBrandGovernanceDemo(
    demoMode,
    context,
    legacyBrand,
    state.currentUserId,
  );
  const [edits, setEdits] = useState<Partial<ResolvedBrandValues>>({});
  const values: ResolvedBrandValues = { ...governance.resolved.values, ...edits };
  const canManage = canPerformGovernance(state, "brand.manage");
  const historyEnabled = isFeatureEnabled(
    state,
    "branding.version_history",
    state.activeOrganizationId,
    state.activeWorkspaceId,
  );

  const activeDraft = governance.previewRevisionId
    ? governance.revisions.find(
        (revision) => revision.id === governance.previewRevisionId && revision.status === "draft",
      ) ?? null
    : null;

  const relevantRevisions = useMemo(
    () =>
      governance.revisions
        .filter(
          (revision) =>
            revision.organizationId === state.activeOrganizationId &&
            revision.scope === scope &&
            (scope === "organization" || revision.workspaceId === state.activeWorkspaceId),
        )
        .sort((left, right) => right.version - left.version),
    [governance.revisions, scope, state.activeOrganizationId, state.activeWorkspaceId],
  );

  const foreground = accessibleForeground(values.primaryColor);
  const ratio = contrastRatio(foreground, values.primaryColor);

  function chooseScope(nextScope: Exclude<BrandScope, "platform">) {
    setScope(nextScope);
    setOverrides(nextScope === "organization" ? ORGANIZATION_OVERRIDES : WORKSPACE_OVERRIDES);
    governance.setPreviewRevisionId(null);
    setEdits({});
  }

  function setOverride(field: EditableBrandField, enabled: boolean) {
    setOverrides((current) => ({ ...current, [field]: enabled }));
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoMode || !canManage) {
      onNotice("Brand writes require organization authorization");
      return;
    }
    const draftValues: BrandValues = {};
    for (const field of Object.keys(overrides) as EditableBrandField[]) {
      if (!overrides[field]) continue;
      Object.assign(draftValues, { [field]: values[field] });
    }

    try {
      const draft = governance.saveDraft(scope, draftValues);
      onNotice(draft ? `Brand draft v${draft.version} saved` : "Brand draft was not saved");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Brand draft was not accepted");
    }
  }

  function publishDraft() {
    if (!activeDraft) return;
    try {
      const published = governance.publishDraft(activeDraft.id);
      if (!published) return;
      setEdits({});
      onPublished(published.values);
      onNotice(`Brand v${activeDraft.version} published to the local demo`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Brand draft could not be published");
    }
  }

  function discardDraft() {
    if (!activeDraft) return;
    try {
      governance.discardDraft(activeDraft.id);
      setEdits({});
      onNotice(`Brand draft v${activeDraft.version} discarded`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Brand draft could not be discarded");
    }
  }

  return (
    <div className={styles.panel}>
      <SettingsSection
        title="Company profile"
        detail="The organization logo, project cover, and account portrait used across the workspace."
        action={
          <div className={styles.segment} aria-label="Brand scope">
            <button
              type="button"
              aria-pressed={scope === "organization"}
              onClick={() => chooseScope("organization")}
            >
              Organization
            </button>
            <button
              type="button"
              aria-pressed={scope === "workspace"}
              onClick={() => chooseScope("workspace")}
            >
              Workspace
            </button>
          </div>
        }
      >
        {!demoMode || !canManage ? (
          <div className={styles.warningBox}>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>Brand editing is read-only until the managed identity service confirms tenant and role authority.</span>
          </div>
        ) : null}

        <div className={styles.brandGrid} style={{ marginTop: 18 }}>
          <form className={styles.brandEditor} onSubmit={saveDraft}>
            <div className={styles.overrideField}>
              <label className={styles.field}>
                <span>Brand name</span>
                <input
                  className={styles.input}
                  value={values.displayName}
                  disabled={!demoMode || !canManage || !overrides.displayName}
                  maxLength={80}
                  onChange={(event) => setEdits((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label className={styles.overrideControl}>
                <input
                  type="checkbox"
                  checked={overrides.displayName}
                  disabled={!demoMode || !canManage}
                  onChange={(event) => setOverride("displayName", event.target.checked)}
                /> Override
              </label>
            </div>

            <div className={styles.overrideField}>
              <label className={styles.field}>
                <span>Player label</span>
                <input
                  className={styles.input}
                  value={values.playerLabel}
                  disabled={!demoMode || !canManage || !overrides.playerLabel}
                  maxLength={120}
                  onChange={(event) => setEdits((current) => ({ ...current, playerLabel: event.target.value }))}
                />
              </label>
              <label className={styles.overrideControl}>
                <input
                  type="checkbox"
                  checked={overrides.playerLabel}
                  disabled={!demoMode || !canManage}
                  onChange={(event) => setOverride("playerLabel", event.target.checked)}
                /> Override
              </label>
            </div>

            <div className={styles.overrideField}>
              <div className={styles.field}>
                <span>Action color</span>
                <div className={styles.colorInputRow}>
                  <input
                    className={styles.colorInput}
                    type="color"
                    value={normalizeHexColor(values.primaryColor) ?? "#145bb8"}
                    aria-label="Action color picker"
                    disabled={!demoMode || !canManage || !overrides.primaryColor}
                    onChange={(event) => setEdits((current) => ({ ...current, primaryColor: event.target.value }))}
                  />
                  <input
                    className={styles.input}
                    value={values.primaryColor}
                    aria-label="Action color hexadecimal value"
                    disabled={!demoMode || !canManage || !overrides.primaryColor}
                    onChange={(event) => setEdits((current) => ({ ...current, primaryColor: event.target.value }))}
                  />
                </div>
              </div>
              <label className={styles.overrideControl}>
                <input
                  type="checkbox"
                  checked={overrides.primaryColor}
                  disabled={!demoMode || !canManage}
                  onChange={(event) => setOverride("primaryColor", event.target.checked)}
                /> Override
              </label>
            </div>

            <div className={styles.overrideField}>
              <label className={styles.field}>
                <span>Logo asset</span>
                <select
                  className={styles.select}
                  value={values.logoPath}
                  disabled={!demoMode || !canManage || !overrides.logoPath}
                  onChange={(event) =>
                    setEdits((current) => ({ ...current, logoPath: event.target.value as BrandLogoPath }))
                  }
                >
                  <option value="/brand/co-videopro-color-supplied.png">Co-VideoPro color lockup</option>
                  <option value="/brand/co-videopro-canonical.png">Co-VideoPro blue lockup</option>
                  <option value="/demo/cco-spiral.png">Legacy Content Co-op spiral</option>
                  <option value="/demo/cco-lockup.png">Legacy Content Co-op lockup</option>
                </select>
              </label>
              <label className={styles.overrideControl}>
                <input
                  type="checkbox"
                  checked={overrides.logoPath}
                  disabled={!demoMode || !canManage}
                  onChange={(event) => setOverride("logoPath", event.target.checked)}
                /> Override
              </label>
            </div>

            <label className={styles.field}>
              <span>Project cover</span>
              <select
                className={styles.select}
                value={coverPath}
                disabled={!demoMode || !canManage}
                onChange={(event) => {
                  onCompanyAssetChange({ coverPath: event.target.value });
                  onNotice("Project cover updated");
                }}
              >
                <option value="/brand/co-videopro-project-cover.jpg">Co-VideoPro blue production artwork</option>
                <option value="">No project cover</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>User profile photo</span>
              <select
                className={styles.select}
                value={avatarPath}
                disabled={!demoMode || !canManage}
                onChange={(event) => {
                  onCompanyAssetChange({ avatarPath: event.target.value });
                  onNotice("Profile photo updated");
                }}
              >
                <option value="/brand/bailey-eubanks-profile.jpg">Bailey Eubanks portrait</option>
                <option value="">Use initials</option>
              </select>
            </label>

            <div className={styles.overrideField}>
              <div className={styles.field}>
                <span>Corner radius</span>
                <div className={styles.segment}>
                  {[0, 4, 8].map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      aria-pressed={values.cornerRadius === radius}
                      disabled={!demoMode || !canManage || !overrides.cornerRadius}
                      onClick={() =>
                        setEdits((current) => ({ ...current, cornerRadius: radius as 0 | 4 | 8 }))
                      }
                    >
                      {radius}px
                    </button>
                  ))}
                </div>
              </div>
              <label className={styles.overrideControl}>
                <input
                  type="checkbox"
                  checked={overrides.cornerRadius}
                  disabled={!demoMode || !canManage}
                  onChange={(event) => setOverride("cornerRadius", event.target.checked)}
                /> Override
              </label>
            </div>

            <div className={styles.controlRow}>
              <span className={styles.controlIcon}><ShieldCheck size={15} aria-hidden="true" /></span>
              <div className={styles.controlCopy}>
                <strong>Content Co-op attribution</strong>
                <span>Display a compact provider mark on client review media.</span>
              </div>
              <SettingsToggle
                checked={values.showPoweredBy}
                disabled={!demoMode || !canManage || !overrides.showPoweredBy}
                label="Toggle Content Co-op attribution"
                onChange={(showPoweredBy) => setEdits((current) => ({ ...current, showPoweredBy }))}
              />
            </div>
            <label className={styles.overrideControl}>
              <input
                type="checkbox"
                checked={overrides.showPoweredBy}
                disabled={!demoMode || !canManage}
                onChange={(event) => setOverride("showPoweredBy", event.target.checked)}
              /> Override attribution
            </label>

            <div className={styles.formActions}>
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                type="submit"
                disabled={!demoMode || !canManage}
              >
                <Save size={14} aria-hidden="true" /> Save draft
              </button>
            </div>
          </form>

          <aside className={styles.previewWrap} aria-label="Resolved brand preview">
            <div className={styles.previewLabel}>
              <span>Resolved review player</span>
              <StatusBadge tone={activeDraft ? "info" : "good"}>{activeDraft ? "Draft preview" : "Published"}</StatusBadge>
            </div>
            <div className={styles.brandPreview} style={{ borderRadius: values.cornerRadius }}>
              <div className={styles.previewHeader}>
                {values.logoPath.startsWith("/brand/co-videopro-") ? (
                  <CoProductionBrand
                    variant="compact-mark"
                    label="Co-VideoPro"
                    sizes="34px"
                  />
                ) : (
                  <Image
                    className={styles.previewLogoImage}
                    src={values.logoPath}
                    alt=""
                    width={34}
                    height={34}
                    unoptimized
                  />
                )}
                <div className={styles.previewCopy}>
                  <strong>{values.displayName || "Inherited brand"}</strong>
                  <span>{values.playerLabel || "Inherited player label"}</span>
                </div>
                <span
                  className={styles.previewAction}
                  style={{
                    backgroundColor: normalizeHexColor(values.primaryColor) ?? "#145bb8",
                    borderRadius: Math.min(values.cornerRadius, 6),
                    color: foreground,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Approve
                </span>
              </div>
              <div
                className={styles.previewMedia}
                style={coverPath ? { backgroundImage: `url(${coverPath})` } : undefined}
              >
                {values.showPoweredBy ? <span className={styles.poweredBy}>Powered by Content Co-op</span> : null}
                <span className={styles.previewProfile}>
                  {avatarPath ? (
                    <Image src={avatarPath} alt="" width={34} height={34} unoptimized />
                  ) : (
                    <i>BE</i>
                  )}
                  Bailey Eubanks
                </span>
              </div>
            </div>
            <p className={styles.contrastNote}>
              <Check size={12} aria-hidden="true" /> Action text contrast {ratio.toFixed(2)}:1 with automatic foreground
            </p>
          </aside>
        </div>
      </SettingsSection>

      {activeDraft ? (
        <section className={styles.section}>
          <div className={styles.draftBar}>
            <span>Draft v{activeDraft.version} is isolated from published client surfaces.</span>
            <div className={styles.draftActions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={discardDraft}
                disabled={!demoMode || !canManage}
              >
                <Trash2 size={14} aria-hidden="true" /> Discard draft
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={publishDraft}
                disabled={!demoMode || !canManage}
              >
                <UploadCloud size={14} aria-hidden="true" /> Publish demo brand
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <SettingsSection
        title="Version history"
        detail="Publishing archives the prior layer; rollback always creates a new draft."
        action={<StatusBadge tone={historyEnabled ? "good" : "neutral"}>{historyEnabled ? "Enabled" : "Flag off"}</StatusBadge>}
      >
        <div className={styles.historyList}>
          {relevantRevisions.map((revision) => (
            <div className={styles.historyRow} key={revision.id}>
              <div className={styles.historyMeta}>
                <strong>v{revision.version} · {formatRevisionStatus(revision.status)}</strong>
                <span>{revision.scope} · {new Date(revision.createdAt).toLocaleDateString(state.profile.locale)} · {revision.createdBy}</span>
              </div>
              <div className={styles.historyActions}>
                <StatusBadge tone={revision.status === "published" ? "good" : revision.status === "draft" ? "info" : "neutral"}>
                  {revision.status}
                </StatusBadge>
                {revision.status === "draft" ? (
                  <button
                    type="button"
                    className={styles.historyButton}
                    onClick={() => {
                      setEdits({});
                      governance.setPreviewRevisionId(revision.id);
                    }}
                  >
                    Preview
                  </button>
                ) : null}
                {revision.status === "archived" ? (
                  <button
                    type="button"
                    className={styles.historyButton}
                    disabled={!demoMode || !canManage || !historyEnabled}
                    onClick={() => {
                      try {
                        const draft = governance.rollback(revision.id);
                        setEdits({});
                        onNotice(draft ? `Rollback draft v${draft.version} created` : "Rollback unavailable");
                      } catch (error) {
                        onNotice(error instanceof Error ? error.message : "Rollback unavailable");
                      }
                    }}
                  >
                    <RotateCcw size={11} aria-hidden="true" /> Roll back
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {relevantRevisions.length === 0 ? (
            <div className={styles.controlRow}>
              <span className={styles.controlIcon}><History size={15} aria-hidden="true" /></span>
              <div className={styles.controlCopy}>
                <strong>No {scope} revisions</strong>
                <span>Save a draft to establish this inheritance layer.</span>
              </div>
            </div>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title="Asset boundary" detail="Custom uploads require tenant-scoped storage and malware scanning before this control can leave demo mode.">
        <div className={styles.controlRow}>
          <span className={styles.controlIcon}><Palette size={15} aria-hidden="true" /></span>
          <div className={styles.controlCopy}>
            <strong>Approved demo assets only</strong>
            <span>No URL fetch, file upload, storage write, or credential access occurs here.</span>
          </div>
          <StatusBadge tone="warn"><GitBranch size={11} aria-hidden="true" /> Backend gate</StatusBadge>
        </div>
      </SettingsSection>
    </div>
  );
}
