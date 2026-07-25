"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";
import {
  DEFAULT_SHARE_LINK_SETTINGS,
  SHARE_LINK_NAME_MAX,
  shareExpiryCountdownLabel,
  type StoredShareLinkSettings,
} from "@/lib/sharing/share-link-settings";
import {
  readShareLinkRecord,
  saveShareLinkSettings,
} from "@/lib/sharing/share-link-store";
import { summarizeShareViewReceipts } from "@/lib/sharing/share-view-receipts";

/**
 * Share links 2.0 (P22) — review-link settings dialog.
 *
 * Standalone: the coordinator mounts this from the share surface. In demo
 * mode every change validates and persists to this browser's localStorage
 * share-link store (LOCAL PREVIEW — labeled as such in the footer) and the
 * gate/expiry/receipt surfaces read it back on next load.
 */

const EXPIRY_CHOICES = [
  { value: "none", label: "No expiry", days: null },
  { value: "1d", label: "1 day", days: 1 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
] as const;

interface ShareSettingsDialogProps {
  shareToken: string;
  /** Fallback heading when the link has no saved name yet. */
  shareName?: string;
  onClose?: () => void;
}

interface DraftState {
  name: string;
  allow_approvals: boolean;
  current_version_only: boolean;
  enable_downloading: boolean;
  expiry_choice: (typeof EXPIRY_CHOICES)[number]["value"];
  has_password: boolean;
  password: string;
}

function draftFromSettings(settings: StoredShareLinkSettings): DraftState {
  return {
    name: settings.name,
    allow_approvals: settings.allow_approvals,
    current_version_only: settings.current_version_only,
    enable_downloading: settings.enable_downloading,
    expiry_choice: settings.expires_at ? "7d" : "none",
    has_password: settings.has_password,
    password: "",
  };
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  badge?: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-[var(--radius-sm)] border border-[var(--line,#e3e7ee)] px-3 py-2.5">
      <span>
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--ink,#18223e)]">
          {label}
          {badge ? (
            <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--accent)]"
      />
    </label>
  );
}

export default function ShareSettingsDialog({
  shareToken,
  shareName,
  onClose,
}: ShareSettingsDialogProps) {
  // Initial state reads the local store synchronously (SSR-safe: the store
  // returns null outside the browser and the defaults render). Remount with
  // a React `key` to re-read when shareToken changes.
  const [initialRecord] = useState(() => readShareLinkRecord(shareToken));
  const initialSettings = initialRecord?.settings ?? {
    ...DEFAULT_SHARE_LINK_SETTINGS,
    name: shareName ?? "",
  };
  const [draft, setDraft] = useState<DraftState>(() => draftFromSettings(initialSettings));
  const [existingHash, setExistingHash] = useState<string | null>(
    initialSettings.password_hash,
  );
  const [savedSettings, setSavedSettings] = useState<StoredShareLinkSettings | null>(
    initialRecord?.settings ?? null,
  );
  const [receiptSummary] = useState(() =>
    summarizeShareViewReceipts(initialRecord?.receipts ?? []),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [savedTick, setSavedTick] = useState(false);

  const countdown = shareExpiryCountdownLabel(savedSettings?.expires_at ?? null);

  function patch(next: Partial<DraftState>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
    setSavedTick(false);
  }

  function handleSave() {
    if (!draft) return;
    const choice = EXPIRY_CHOICES.find((candidate) => candidate.value === draft.expiry_choice)
      ?? EXPIRY_CHOICES[0];
    const expiresAt = choice.days === null
      ? null
      : new Date(Date.now() + choice.days * 24 * 60 * 60 * 1000).toISOString();
    const result = saveShareLinkSettings(shareToken, {
      name: draft.name,
      allow_approvals: draft.allow_approvals,
      current_version_only: draft.current_version_only,
      enable_downloading: draft.enable_downloading,
      expires_at: expiresAt,
      has_password: draft.has_password,
      password: draft.password || null,
      existing_password_hash: existingHash,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSavedSettings(result.settings);
    setExistingHash(result.settings.password_hash);
    setDraft((current) => (current ? { ...current, password: "" } : current));
    setSavedTick(true);
  }

  return (
    <section
      role="dialog"
      aria-label="Share link settings"
      data-testid="share-settings-dialog"
      className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--line,#e3e7ee)] bg-white p-5 shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink,#18223e)]">Share link settings</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {savedSettings?.name || shareName || "Review link"}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share settings"
            className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="share-link-name" className="text-xs font-medium text-[var(--muted)]">
            Link name
          </label>
          <input
            id="share-link-name"
            type="text"
            value={draft.name}
            maxLength={SHARE_LINK_NAME_MAX}
            onChange={(event) => patch({ name: event.target.value })}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--line,#e3e7ee)] px-3 py-2 text-sm text-[var(--ink,#18223e)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        <ToggleRow
          label="Allow approvals"
          description="Reviewers can record approval decisions from this link."
          checked={draft.allow_approvals}
          onChange={(next) => patch({ allow_approvals: next })}
        />
        <ToggleRow
          label="Enable downloading"
          description="Reviewers get a download action on the review surface."
          checked={draft.enable_downloading}
          onChange={(next) => patch({ enable_downloading: next })}
        />
        <ToggleRow
          label="Current version only"
          description="Applies when versions exist — versioned links land with P19 in a later wave. The setting is saved now."
          badge="Coming with P19"
          checked={draft.current_version_only}
          onChange={(next) => patch({ current_version_only: next })}
        />

        <div className="rounded-[var(--radius-sm)] border border-[var(--line,#e3e7ee)] px-3 py-2.5">
          <ToggleRowInline
            label="Password protection"
            description="Viewers must enter a password before the review opens."
            checked={draft.has_password}
            onChange={(next) => patch({ has_password: next })}
          />
          {draft.has_password ? (
            <div className="mt-2">
              <input
                type="password"
                aria-label="Link password"
                placeholder={existingHash ? "New password (blank keeps current)" : "Set a password"}
                value={draft.password}
                onChange={(event) => patch({ password: event.target.value })}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--line,#e3e7ee)] px-3 py-2 text-sm text-[var(--ink,#18223e)] focus:border-[var(--accent)] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[var(--dim)]">
                Demo protection — a browser-local fingerprint, not production-grade security.
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-[var(--radius-sm)] border border-[var(--line,#e3e7ee)] px-3 py-2.5">
          <label htmlFor="share-link-expiry" className="text-sm font-medium text-[var(--ink,#18223e)]">
            Link expiry
          </label>
          <select
            id="share-link-expiry"
            value={draft.expiry_choice}
            onChange={(event) => patch({ expiry_choice: event.target.value as DraftState["expiry_choice"] })}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--line,#e3e7ee)] bg-white px-3 py-2 text-sm text-[var(--ink,#18223e)]"
          >
            {EXPIRY_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          {countdown ? (
            <p className="mt-1 text-[11px] font-medium text-[var(--ink-secondary,#3f4962)]" data-testid="share-expiry-countdown">
              {countdown}
            </p>
          ) : null}
        </div>
      </div>

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-[var(--radius-sm)] bg-[#fdecea] px-3 py-2">
          {errors.map((error) => (
            <li key={error} className="text-xs font-medium text-[#b3261e]">
              {error}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          Save settings
        </button>
        {savedTick ? (
          <span className="text-xs font-medium text-[var(--green)]">Saved to this browser</span>
        ) : null}
      </div>

      <div className="mt-5 border-t border-[var(--line,#e3e7ee)] pt-3" data-testid="share-view-receipts">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          <Eye size={12} aria-hidden="true" />
          View receipts
        </p>
        <p className="mt-1 text-sm text-[var(--ink,#18223e)]">
          {receiptSummary && receiptSummary.count > 0
            ? `${receiptSummary.count} ${receiptSummary.count === 1 ? "view" : "views"} recorded`
            : "No views recorded yet"}
          <span className="text-[var(--dim)]"> — local preview, this browser only.</span>
        </p>
        {receiptSummary && receiptSummary.latest.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {receiptSummary.latest.map((receipt) => (
              <li key={receipt.id} className="flex items-center justify-between text-xs text-[var(--ink-secondary,#3f4962)]">
                <span>{receipt.viewer_label}</span>
                <span className="text-[var(--dim)]">
                  {new Date(receipt.viewed_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--dim)]">
        Demo preview — settings persist to this browser&apos;s local share-link
        store and apply to P22 surfaces (gate, expiry, receipts) on next load.
        Wiring into the shared demo workspace store lands with the integration
        pass.
      </p>
    </section>
  );
}

function ToggleRowInline({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-[var(--ink,#18223e)]">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--accent)]"
      />
    </label>
  );
}
