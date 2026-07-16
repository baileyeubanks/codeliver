"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  Copy,
  Download,
  Droplets,
  Eye,
  Link2,
  MessageSquare,
  Shield,
  Users,
  X,
} from "lucide-react";
import ShareLinkList from "@/components/sharing/ShareLinkList";
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
  getBrowserClientSiteUrl,
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

function formatStatusLabel(status?: string) {
  if (!status) return null;
  return status.replace(/_/g, " ");
}

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
  assetStatus,
  previewMode = false,
  onClose,
}: ShareModalContentProps) {
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
  const statusLabel = formatStatusLabel(assetStatus);
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
  const hasOverrides =
    watermark !== intentDefaults.watermarkEnabled ||
    allowDownload !== intentDefaults.downloadEnabled;

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
        : getBrowserClientSiteUrl(window.location.origin);
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
      setError("The sharing authority could not be reached. No new link was created.");
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

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,29,42,0.34)] px-4 py-6 backdrop-blur-[2px]">
      <div
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Co-Production Pro sharing controls"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-1">Co-Production Pro sharing</span>
              {statusLabel ? (
                <span className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-1 capitalize">
                  {statusLabel}
                </span>
              ) : null}
            </div>
            <h3 className="review-display mt-3 text-xl font-semibold text-[var(--ink)]">
              Share or hand off {assetTitle ? <span className="text-[var(--accent)]">{assetTitle}</span> : "this asset"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Pick the outcome first, then Co-Production Pro will frame the link so the recipient knows whether they
              are reviewing, approving, or receiving the final delivery.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2 text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
            aria-label="Close share modal"
          >
            <X size={18} />
          </button>
        </div>

        {!link ? (
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
              <section className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                    Canonical handoff states
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-[var(--ink)]">Choose the recipient experience</h4>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {SHARE_INTENTS.map((intent) => {
                    const selected = intent.value === shareIntent;

                    return (
                      <button
                        key={intent.value}
                        type="button"
                        onClick={() => selectShareIntent(intent.value)}
                        aria-pressed={selected}
                        className={`rounded-[var(--radius)] border px-4 py-4 text-left transition-colors ${
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent)]/8 shadow-[0_0_0_1px_var(--accent)]"
                            : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] ${
                              selected ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--ink)]"
                            }`}
                          >
                            {INTENT_ICONS[intent.value]}
                          </div>
                          <span
                            className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium ${
                              selected
                                ? "bg-[var(--accent)] text-white"
                                : "bg-[var(--surface-2)] text-[var(--muted)]"
                            }`}
                          >
                            {intent.permissionsLabel}
                          </span>
                        </div>
                        <p className="mt-4 text-sm font-semibold text-[var(--ink)]">{intent.label}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{intent.dashboardDescription}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                    Recipient framing
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-[var(--ink)]">{intentDefinition.recipientTitle}</h4>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {intentDefinition.recipientDescription}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                        Access
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                        {intentDefinition.permissionsLabel}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                        Recipient next step
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                        {intentDefinition.nextStepLabel}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        {intentDefinition.nextStepDescription}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                    Recipient setup
                  </p>

                  <div className="mt-4 grid gap-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Asset version
                      </label>
                      <select
                        value={versionId}
                        disabled={versionsLoading || versions.length === 0}
                        onChange={(event) => {
                          setVersionId(event.target.value);
                          invalidateLiveSendAuthority();
                        }}
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      >
                        {versions.length === 0 ? (
                          <option value="">{versionsLoading ? "Loading versions..." : "No media version"}</option>
                        ) : null}
                        {versions.map((version) => (
                          <option key={version.id} value={version.id}>
                            Version {version.version_number}{version.is_current ? " (current)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Recipient name
                      </label>
                      <input
                        value={reviewerName}
                        onChange={(event) => {
                          setReviewerName(event.target.value);
                          invalidateLiveSendAuthority();
                        }}
                        placeholder="Optional"
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Recipient email
                      </label>
                      <input
                        value={reviewerEmail}
                        onChange={(event) => {
                          setReviewerEmail(event.target.value);
                          invalidateLiveSendAuthority();
                        }}
                        placeholder={
                          intentDefaults.requiresReviewerEmail
                            ? "Required for approval-needed review"
                            : "Optional"
                        }
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
                      />
                      <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
                        {intentDefaults.requiresReviewerEmail
                          ? "This link is tied to a named approver so approval intent stays explicit."
                          : "An email identifies the recipient. It does not send the link."}
                      </p>
                    </div>

                    <div className="border-t border-[var(--border)] pt-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Notification authority
                      </p>
                      <NotificationAuthorityControl
                        email={reviewerEmail}
                        value={notificationAuthority}
                        onChange={(value) => {
                          const previewChanged =
                            JSON.stringify(notificationPreviewSubject(value)) !==
                            JSON.stringify(notificationPreviewSubject(notificationAuthority));
                          setNotificationAuthority(value);
                          if (previewChanged) {
                            setNotificationPreview(null);
                            setSharePreview(null);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                        Access controls
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Adjust only when this handoff needs an exception.
                      </p>
                    </div>
                    {hasOverrides ? (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--orange)]/10 px-3 py-1 text-[11px] font-medium text-[var(--orange)]">
                        Custom
                      </span>
                    ) : (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
                        Preset defaults
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Expiration
                      </label>
                      <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                        <Calendar size={14} className="text-[var(--muted)]" />
                        <input
                          type="date"
                          value={expiresAt}
                          onChange={(event) => {
                            setExpiresAt(event.target.value);
                            invalidateLiveSendAuthority();
                          }}
                          className="w-full bg-transparent text-sm text-[var(--ink)] outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Max views
                      </label>
                      <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                        <Eye size={14} className="text-[var(--muted)]" />
                        <input
                          type="number"
                          min={1}
                          value={maxViews ?? ""}
                          onChange={(event) => {
                            setMaxViews(
                              event.target.value ? Number.parseInt(event.target.value, 10) : null,
                            );
                            invalidateLiveSendAuthority();
                          }}
                          placeholder="Unlimited"
                          className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--dim)]"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--ink)]">
                        <input
                          type="checkbox"
                          checked={watermark}
                          onChange={(event) => {
                            setWatermark(event.target.checked);
                            invalidateLiveSendAuthority();
                          }}
                          className="accent-[var(--accent)]"
                        />
                        <Droplets size={14} className="text-[var(--muted)]" />
                        Watermark
                      </label>

                      <label className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--ink)]">
                        <input
                          type="checkbox"
                          checked={allowDownload}
                          onChange={(event) => {
                            setAllowDownload(event.target.checked);
                            invalidateLiveSendAuthority();
                          }}
                          className="accent-[var(--accent)]"
                        />
                        <Download size={14} className="text-[var(--muted)]" />
                        Allow download
                      </label>
                    </div>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-[var(--radius-sm)] border border-[var(--red)]/20 bg-[var(--red)]/5 px-3 py-3 text-sm text-[var(--red)]">
                    {error}
                  </div>
                ) : null}

                <NotificationPreview
                  preview={
                    previewFingerprint === previewSubjectFingerprint ? notificationPreview : null
                  }
                />
                <ShareAuthorityPreview
                  preview={previewFingerprint === previewSubjectFingerprint ? sharePreview : null}
                />

                <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                  <button
                    type="button"
                    onClick={previewShare}
                    disabled={loading || versionsLoading || !versionId}
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={createLink}
                    disabled={loading || versionsLoading || !versionId}
                    className="w-full rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading
                      ? "Working..."
                      : notificationAuthority.action === "send"
                        ? `Create ${intentDefinition.label.toLowerCase()} link and send`
                        : `Create ${intentDefinition.label.toLowerCase()} link`}
                  </button>
                </div>
              </section>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                    Active handoffs
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {previewMode
                      ? "Live links are not loaded in preview mode. Use the asset workspace to manage real handoffs."
                      : "Review the live links on this asset and revoke any that no longer match the handoff state."}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                {previewMode ? (
                  <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                    <p className="text-sm font-medium text-[var(--ink)]">Preview mode</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Create links here to preview the recipient experience, then use the asset workspace for the
                      real active handoff list.
                    </p>
                  </div>
                ) : (
                  <ShareLinkList assetId={assetId} refreshKey={refreshKey} />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-5 py-5">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
                  <Check size={16} />
                  {intentDefinition.label} ready
                </div>
                <h4 className="review-display mt-3 text-xl font-semibold text-[var(--ink)]">
                  Send the link when the recipient is ready to {intentDefinition.nextStepLabel.toLowerCase()}.
                </h4>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {intentDefinition.recipientDescription}
                </p>

                <div className="mt-5 flex gap-2">
                  <input
                    readOnly
                    value={link}
                    className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                  />
                  <button
                    onClick={copyLink}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                      Version
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                      {selectedVersion ? `Version ${selectedVersion.version_number}` : "Unavailable"}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                      Access
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--ink)]">{intentDefinition.permissionsLabel}</p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                      Expires
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--ink)]">{formatExpiryLabel(expiresAt)}</p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                      Download
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                      {allowDownload ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                      Watermark
                    </p>
                    <p className="mt-2 text-sm font-medium text-[var(--ink)]">{watermark ? "Enabled" : "Off"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                  What changed
                </p>
                <div className="mt-4 space-y-4 text-sm leading-6 text-[var(--muted)]">
                  <p>
                    Co-Production Pro will present this as <span className="font-medium text-[var(--ink)]">{intentDefinition.label}</span>,
                    so the recipient understands the intent before they interact with the asset.
                  </p>
                  <p>
                    The page will frame the next step as <span className="font-medium text-[var(--ink)]">{intentDefinition.nextStepLabel}</span>,
                    rather than a generic review request.
                  </p>
                  <p>
                    {notificationStatus === "sent"
                      ? "Every requested notification was accepted by its configured provider."
                      : notificationStatus === "partial"
                        ? "At least one requested notification was sent, but another channel did not complete."
                      : notificationStatus === "dry_run"
                        ? "The notification was previewed without contacting a provider."
                        : notificationStatus === "not_configured"
                          ? "The link was created, but no selected channel has a configured provider."
                          : notificationStatus === "suppressed"
                            ? "The link was created, but delivery was suppressed for the recorded recipient."
                            : notificationStatus === "failed"
                              ? "The link was created, but the requested notification did not complete."
                              : "The link was created without sending an external notification."}
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={resetCreatedState}
                    className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <Link2 size={14} />
                    Create another link
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-glass)]"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">Active handoffs</p>
              <div className="mt-4">
                {previewMode ? (
                  <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                    <p className="text-sm font-medium text-[var(--ink)]">Preview mode</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Use the real asset workspace to review or revoke live links after previewing the state here.
                    </p>
                  </div>
                ) : (
                  <ShareLinkList assetId={assetId} refreshKey={refreshKey} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
