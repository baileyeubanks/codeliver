"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Droplets,
  Link2,
  MessageSquare,
  Shield,
  Users,
  X,
} from "lucide-react";
import styles from "./ShareModal.module.css";
import ShareLinkList from "@/components/sharing/ShareLinkList";
import { useDialogFocus } from "@/components/navigation/useDialogFocus";
import ShareAuthorityPreview from "@/components/sharing/ShareAuthorityPreview";
import NotificationAuthorityControl, {
  EMPTY_NOTIFICATION_AUTHORITY,
  type NotificationAuthorityValue,
} from "@/components/notifications/NotificationAuthorityControl";
import NotificationPreview from "@/components/notifications/NotificationPreview";
import {
  SHARE_INTENTS,
  getShareIntentDefinition,
  resolveShareIntentDefaults,
  type ShareIntent,
} from "@/lib/sharing/share-intent";
import {
  buildSurfaceUrl,
  getReviewSiteUrl,
  getDemoSiteUrl,
} from "@/lib/surface-origins";

interface ShareModalProps {
  assetId: string;
  assetTitle?: string;
  assetStatus?: string;
  previewMode?: boolean;
  open: boolean;
  onClose: () => void;
}

interface AssetVersionOption {
  id: string;
  version_number: number;
  is_current: boolean;
  created_at: string;
}

const INTENT_ICONS: Record<ShareIntent, ReactNode> = {
  internal_review: <Users size={16} />,
  client_review: <MessageSquare size={16} />,
  approval_needed: <Shield size={16} />,
  final_delivery: <Download size={16} />,
};

function formatExpiryInput(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function formatExpiryLabel(value: string) {
  if (!value) return "No expiration";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "No expiration";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function newRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `share-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function notificationPreviewSubject(value: NotificationAuthorityValue) {
  return {
    action: value.action,
    channels: value.channels,
    phone: value.phone,
    imessageHandle: value.imessageHandle,
  };
}

type NotificationStatus =
  | "not_requested"
  | "dry_run"
  | "sent"
  | "partial"
  | "not_configured"
  | "suppressed"
  | "failed";

function summarizeNotificationStatus(
  action: NotificationAuthorityValue["action"],
  notification: unknown,
): NotificationStatus {
  if (action === "none") return "not_requested";
  if (!notification || typeof notification !== "object" || Array.isArray(notification)) {
    return "failed";
  }

  const result = notification as Record<string, unknown>;
  if (result.mode === "preview") return "dry_run";
  if (result.ok === false) return "failed";
  const statuses = Array.isArray(result.receipts)
    ? result.receipts.flatMap((receipt) =>
        receipt && typeof receipt === "object" && !Array.isArray(receipt)
          ? [String((receipt as Record<string, unknown>).status ?? "")]
          : [],
      )
    : [];
  if (statuses.length > 0 && statuses.every((status) => status === "sent")) return "sent";
  if (statuses.some((status) => status === "sent")) return "partial";
  if (statuses.length > 0 && statuses.every((status) => status === "not_configured")) {
    return "not_configured";
  }
  if (statuses.length > 0 && statuses.every((status) => status === "suppressed")) {
    return "suppressed";
  }
  return "failed";
}

export default function ShareModal(props: ShareModalProps) {
  const { open, ...contentProps } = props;
  if (!open) return null;
  return (
    <ShareModalContent
      key={`${contentProps.assetId}:${contentProps.previewMode ? "preview" : "live"}`}
      {...contentProps}
    />
  );
}

type ShareModalContentProps = Omit<ShareModalProps, "open">;

function ShareModalContent({
  assetId,
  assetTitle,
  previewMode = false,
  onClose,
}: ShareModalContentProps) {
  // Always rendered "open" — focus moves into the dialog on mount, returns
  // to the trigger on close, and Escape is owned by useDialogFocus.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, onClose);
  const clientReviewDefaults = resolveShareIntentDefaults("client_review");
  const [shareIntent, setShareIntent] = useState<ShareIntent>("client_review");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [notificationAuthority, setNotificationAuthority] = useState<NotificationAuthorityValue>(
    EMPTY_NOTIFICATION_AUTHORITY,
  );
  const [notificationStatus, setNotificationStatus] =
    useState<NotificationStatus>("not_requested");
  const [notificationPreview, setNotificationPreview] = useState<unknown>(null);
  const [sharePreview, setSharePreview] = useState<unknown>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [versions, setVersions] = useState<AssetVersionOption[]>(() =>
    previewMode
      ? [{ id: "demo-version", version_number: 1, is_current: true, created_at: new Date().toISOString() }]
      : [],
  );
  const [versionId, setVersionId] = useState(previewMode ? "demo-version" : "");
  const [versionsLoading, setVersionsLoading] = useState(!previewMode);
  const [expiresAt, setExpiresAt] = useState(() =>
    formatExpiryInput(clientReviewDefaults.expiresInDays),
  );
  const [watermark, setWatermark] = useState(clientReviewDefaults.watermarkEnabled);
  const [allowDownload, setAllowDownload] = useState(clientReviewDefaults.downloadEnabled);
  const [maxViews, setMaxViews] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const intentDefinition = useMemo(() => getShareIntentDefinition(shareIntent), [shareIntent]);
  const intentDefaults = useMemo(() => resolveShareIntentDefaults(shareIntent), [shareIntent]);
  const selectedVersion = versions.find((version) => version.id === versionId) ?? null;
  const previewSubjectFingerprint = JSON.stringify({
    versionId,
    shareIntent,
    reviewerName,
    reviewerEmail,
    expiresAt,
    watermark,
    allowDownload,
    maxViews,
    notification: notificationPreviewSubject(notificationAuthority),
  });

  useEffect(() => {
    if (previewMode) return;

    let cancelled = false;
    fetch(`/api/assets/${assetId}/versions`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Version load failed"))))
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data.items) ? (data.items as AssetVersionOption[]) : [];
        setVersions(items);
        const current = items.find((version) => version.is_current) ?? items[0];
        setVersionId(current?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Media versions could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assetId, previewMode]);

  function selectShareIntent(intent: ShareIntent) {
    const defaults = resolveShareIntentDefaults(intent);
    setShareIntent(intent);
    setWatermark(defaults.watermarkEnabled);
    setAllowDownload(defaults.downloadEnabled);
    setExpiresAt(formatExpiryInput(defaults.expiresInDays));
    setError("");
    invalidateLiveSendAuthority();
  }

  function invalidateLiveSendAuthority() {
    setNotificationAuthority((current) =>
      current.confirmLiveSend ? { ...current, confirmLiveSend: false } : current,
    );
    setNotificationPreview(null);
    setSharePreview(null);
  }

  function buildNotificationPayload() {
    if (notificationAuthority.action === "none") return { action: "none" };
    const consent: Record<string, unknown> = {};
    if (notificationAuthority.smsConsentConfirmed) {
      consent.sms = {
        granted: true,
        source: "operator-confirmed-client-record",
        recorded_at: notificationAuthority.smsConsentRecordedAt,
      };
    }
    if (notificationAuthority.imessageConsentConfirmed) {
      consent.imessage = {
        granted: true,
        source: "operator-confirmed-client-record",
        recorded_at: notificationAuthority.imessageConsentRecordedAt,
      };
    }
    return {
      action: notificationAuthority.action,
      channels: notificationAuthority.channels,
      confirm_live_send: notificationAuthority.confirmLiveSend,
      idempotency_key: `${requestId}:notification`,
      consent,
    };
  }

  function validateNotificationAuthority(operation: "preview" | "create") {
    if (notificationAuthority.action === "none") return null;
    if (notificationAuthority.channels.length === 0) return "Choose at least one notification channel.";
    if (notificationAuthority.channels.includes("email") && !reviewerEmail.trim()) {
      return "Add a recipient email for the email channel.";
    }
    if (notificationAuthority.channels.includes("sms") && !notificationAuthority.phone.trim()) {
      return "Add an E.164 phone number for SMS.";
    }
    if (
      notificationAuthority.channels.includes("imessage") &&
      !notificationAuthority.imessageHandle.trim()
    ) {
      return "Add an iMessage email or E.164 phone number.";
    }
    if (operation === "create" && notificationAuthority.action === "send") {
      if (previewFingerprint !== previewSubjectFingerprint) {
        return "Preview the current recipient, version, and controls before a live send.";
      }
      if (
        notificationAuthority.channels.includes("sms") &&
        (!notificationAuthority.smsConsentConfirmed || !notificationAuthority.smsConsentRecordedAt)
      ) {
        return "Confirm the recorded SMS consent before a live send.";
      }
      if (
        notificationAuthority.channels.includes("imessage") &&
        (!notificationAuthority.imessageConsentConfirmed ||
          !notificationAuthority.imessageConsentRecordedAt)
      ) {
        return "Confirm the recorded iMessage consent before a live send.";
      }
      if (!notificationAuthority.confirmLiveSend) {
        return "Confirm live-send authority before creating and sending.";
      }
    }
    return null;
  }

  async function submitShare(operation: "preview" | "create") {
    setError("");
    if (!versionId) {
      setError("Choose an asset version before creating a link.");
      return;
    }

    if (intentDefaults.requiresReviewerEmail && !reviewerEmail.trim()) {
      setError("Approval-needed review links require the reviewer email.");
      return;
    }
    const notificationError = validateNotificationAuthority(operation);
    if (notificationError) {
      setError(notificationError);
      return;
    }

    let publicOrigin: string;
    try {
      publicOrigin = previewMode
        ? getDemoSiteUrl(window.location.origin)
        : getReviewSiteUrl(window.location.origin);
    } catch {
      setError("The public review origin is not configured safely.");
      return;
    }

    setLoading(true);
    try {
      if (previewMode) {
        setNotificationPreview(
          notificationAuthority.action === "none"
            ? null
            : {
                message: { title: `${assetTitle ?? "Asset"} v1 is ready`, body: "Preview review link" },
                channels: notificationAuthority.channels.map((channel) => ({
                  channel,
                  recipient:
                    channel === "email"
                      ? reviewerEmail
                      : channel === "sms"
                        ? notificationAuthority.phone
                        : notificationAuthority.imessageHandle,
                })),
              },
        );
        setSharePreview({
          items: [
            {
              version: { version_number: 1 },
              permissions: intentDefaults.permissions,
              download_enabled: allowDownload,
              watermark_enabled: watermark,
            },
          ],
        });
        setPreviewFingerprint(previewSubjectFingerprint);
        if (operation === "preview" && notificationAuthority.action === "send") {
          setNotificationAuthority((current) => ({ ...current, confirmLiveSend: false }));
        }
        if (operation === "create") {
          setLink(
            buildSurfaceUrl(
              publicOrigin,
              `/review/demo?demo=1&intent=${encodeURIComponent(shareIntent)}`,
            ),
          );
          setNotificationStatus(
            notificationAuthority.action === "none" ? "not_requested" : "dry_run",
          );
        }
        return;
      }

      const res = await fetch(`/api/assets/${assetId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          manifest_id: requestId,
          version_id: versionId,
          share_intent: shareIntent,
          reviewer_name: reviewerName || null,
          reviewer_email: reviewerEmail || null,
          reviewer_phone: notificationAuthority.phone || null,
          reviewer_imessage_handle: notificationAuthority.imessageHandle || null,
          expires_at: expiresAt || null,
          watermark_enabled: watermark,
          download_enabled: allowDownload,
          max_views: maxViews,
          notification: buildNotificationPayload(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (operation === "preview") {
          setSharePreview(data.manifest ?? null);
          setNotificationPreview(data.notifications?.[0] ?? null);
          setPreviewFingerprint(previewSubjectFingerprint);
          if (notificationAuthority.action === "send") {
            setNotificationAuthority((current) => ({ ...current, confirmLiveSend: false }));
          }
        } else {
          if (typeof data.token !== "string" || !data.token) {
            setError("The share link response did not include a valid review token.");
            return;
          }
          setLink(
            buildSurfaceUrl(publicOrigin, `/review/${encodeURIComponent(data.token)}`),
          );
          const notification = data.notification;
          setNotificationStatus(
            summarizeNotificationStatus(notificationAuthority.action, notification),
          );
          setRefreshKey((current) => current + 1);
        }
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Could not create the share link.");
      }
    } catch {
      setRefreshKey((current) => current + 1);
      setError("Could not confirm the result. Check Existing links before trying again.");
    } finally {
      setLoading(false);
    }
  }

  async function createLink() {
    await submitShare("create");
  }

  async function previewShare() {
    await submitShare("preview");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setError("");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setError("Could not copy. Select the link to copy it, or open the review.");
    }
  }

  function resetCreatedState() {
    setLink("");
    setCopied(false);
    setError("");
    setNotificationAuthority(EMPTY_NOTIFICATION_AUTHORITY);
    setNotificationStatus("not_requested");
    setNotificationPreview(null);
    setSharePreview(null);
    setPreviewFingerprint("");
    setRequestId(newRequestId());
  }

  return (
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Share review">
        <header className={styles.header}>
          <div><h3>{link ? "Link ready" : "Share review"}</h3><p>{assetTitle || "Current asset"}</p></div>
          <button type="button" onClick={onClose} aria-label="Close share modal"><X size={20} /></button>
        </header>
        <div className={styles.body}>
          {!link ? <>
            <div className={styles.intents} aria-label="Review purpose">
              {SHARE_INTENTS.map((intent) => <button key={intent.value} type="button"
                aria-pressed={shareIntent === intent.value} onClick={() => selectShareIntent(intent.value)}>
                {INTENT_ICONS[intent.value]}<span>{{ internal_review: "Internal", client_review: "Review", approval_needed: "Approval", final_delivery: "Delivery" }[intent.value]}</span>
              </button>)}
            </div>
            <p className={styles.summary}>{intentDefinition.permissionsLabel}</p>
            <label className={styles.field}>Version
              <select value={versionId} disabled={versionsLoading || !versions.length}
                onChange={(event) => { setVersionId(event.target.value); invalidateLiveSendAuthority(); }}>
                {!versions.length ? <option value="">{versionsLoading ? "Loading…" : "No media version"}</option> : null}
                {versions.map((version) => <option key={version.id} value={version.id}>Version {version.version_number}{version.is_current ? " · Current" : ""}</option>)}
              </select>
            </label>
            <div className={styles.fields}>
              <label className={styles.field}>Name <span className={styles.optional}>Optional</span>
                <input value={reviewerName} autoComplete="name" onChange={(event) => { setReviewerName(event.target.value); invalidateLiveSendAuthority(); }} />
              </label>
              <label className={styles.field}>Email <span className={styles.optional}>{intentDefaults.requiresReviewerEmail ? "Required" : "Optional"}</span>
                <input type="email" value={reviewerEmail} autoComplete="email" onChange={(event) => { setReviewerEmail(event.target.value); invalidateLiveSendAuthority(); }} />
              </label>
            </div>
            <div className={styles.toggles}>
              <label><Download size={17} /><span>Downloads</span><input type="checkbox" role="switch" aria-label="Allow downloads" checked={allowDownload} onChange={(event) => { setAllowDownload(event.target.checked); invalidateLiveSendAuthority(); }} /></label>
              <label><Droplets size={17} /><span>Watermark</span><input type="checkbox" role="switch" aria-label="Watermark" checked={watermark} onChange={(event) => { setWatermark(event.target.checked); invalidateLiveSendAuthority(); }} /></label>
            </div>
            <label className={styles.field}>Expires
              <input type="date" value={expiresAt} onChange={(event) => { setExpiresAt(event.target.value); invalidateLiveSendAuthority(); }} />
            </label>
            <details className={styles.details}><summary>More access settings</summary>
              <label className={styles.field}>Maximum views
                <input type="number" min={1} value={maxViews ?? ""} placeholder="Unlimited" onChange={(event) => { setMaxViews(event.target.value ? Number.parseInt(event.target.value, 10) : null); invalidateLiveSendAuthority(); }} />
              </label>
            </details>
            <details className={styles.details}><summary>Notification {notificationAuthority.action !== "none" ? "· Configured" : "· Off"}</summary>
              <NotificationAuthorityControl email={reviewerEmail} value={notificationAuthority} onChange={(value) => {
                const changed = JSON.stringify(notificationPreviewSubject(value)) !== JSON.stringify(notificationPreviewSubject(notificationAuthority));
                setNotificationAuthority(value);
                if (changed) { setNotificationPreview(null); setSharePreview(null); }
              }} />
            </details>
            {previewFingerprint === previewSubjectFingerprint && (notificationPreview || sharePreview) ? <details className={styles.details} open><summary>Link preview</summary>
              <NotificationPreview preview={notificationPreview} /><ShareAuthorityPreview preview={sharePreview} />
            </details> : null}
          </> : <>
            <p className={styles.ready}><Check size={18} />{intentDefinition.label}</p>
            <div className={styles.linkRow}><input aria-label="Review link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" className={styles.primary} onClick={() => void copyLink()}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy link"}</button>
            </div>
            <a className={styles.openLink} href={link} target="_blank" rel="noopener noreferrer"><Link2 size={17} />Open review</a>
            <p className={styles.summary}>{selectedVersion ? `Version ${selectedVersion.version_number} · ` : ""}{formatExpiryLabel(expiresAt)} · Downloads {allowDownload ? "on" : "off"}</p>
            {notificationStatus !== "not_requested" ? <p role="status">Notification: {notificationStatus.replace(/_/g, " ")}</p> : null}
          </>}
          {!previewMode ? <details className={styles.details}><summary>Existing links</summary><ShareLinkList assetId={assetId} refreshKey={refreshKey} /></details> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
        <footer className={styles.footer}>
          {link ? <><button type="button" onClick={resetCreatedState}>New link</button><button type="button" className={styles.primary} onClick={onClose}>Done</button></> : <>
            <button type="button" onClick={previewShare} disabled={loading || versionsLoading || !versionId}>Preview</button>
            <button type="button" className={styles.primary} onClick={createLink} disabled={loading || versionsLoading || !versionId}>{loading ? "Creating…" : notificationAuthority.action === "send" ? "Create & send" : "Create link"}</button>
          </>}
        </footer>
      </div>
    </div>
  );
}
