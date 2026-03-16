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
import {
  SHARE_INTENTS,
  getShareIntentDefinition,
  resolveShareIntentDefaults,
  type ShareIntent,
} from "@/lib/sharing/share-intent";

interface ShareModalProps {
  assetId: string;
  assetTitle?: string;
  assetStatus?: string;
  previewMode?: boolean;
  open: boolean;
  onClose: () => void;
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

export default function ShareModal({
  assetId,
  assetTitle,
  assetStatus,
  previewMode = false,
  open,
  onClose,
}: ShareModalProps) {
  const [shareIntent, setShareIntent] = useState<ShareIntent>("client_review");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState(formatExpiryInput(7));
  const [watermark, setWatermark] = useState(false);
  const [allowDownload, setAllowDownload] = useState(false);
  const [maxViews, setMaxViews] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const intentDefinition = useMemo(() => getShareIntentDefinition(shareIntent), [shareIntent]);
  const intentDefaults = useMemo(() => resolveShareIntentDefaults(shareIntent), [shareIntent]);
  const statusLabel = formatStatusLabel(assetStatus);
  const hasOverrides =
    watermark !== intentDefaults.watermarkEnabled ||
    allowDownload !== intentDefaults.downloadEnabled;

  useEffect(() => {
    setWatermark(intentDefaults.watermarkEnabled);
    setAllowDownload(intentDefaults.downloadEnabled);
    setExpiresAt(formatExpiryInput(intentDefaults.expiresInDays));
    setError("");
  }, [intentDefaults]);

  useEffect(() => {
    if (!open) return;

    const clientReviewDefaults = resolveShareIntentDefaults("client_review");
    setShareIntent("client_review");
    setWatermark(clientReviewDefaults.watermarkEnabled);
    setAllowDownload(clientReviewDefaults.downloadEnabled);
    setExpiresAt(formatExpiryInput(clientReviewDefaults.expiresInDays));
    setLink("");
    setCopied(false);
    setLoading(false);
    setError("");
    setReviewerName("");
    setReviewerEmail("");
    setMaxViews(null);
  }, [open]);

  if (!open) return null;

  async function createLink() {
    setError("");

    if (intentDefaults.requiresReviewerEmail && !reviewerEmail.trim()) {
      setError("Approval-needed review links require the reviewer email.");
      return;
    }

    setLoading(true);

    if (previewMode) {
      setLink(`${window.location.origin}/review/demo?demo=1&intent=${shareIntent}`);
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/assets/${assetId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        share_intent: shareIntent,
        reviewer_name: reviewerName || null,
        reviewer_email: reviewerEmail || null,
        expires_at: expiresAt || null,
        watermark_enabled: watermark,
        download_enabled: allowDownload,
        max_views: maxViews,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setLink(`${window.location.origin}/review/${data.token}`);
      setRefreshKey((current) => current + 1);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Could not create the share link.");
    }

    setLoading(false);
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
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[calc(var(--radius)+10px)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className="rounded-full bg-[var(--surface-2)] px-3 py-1">Co-Deliver sharing</span>
              {statusLabel ? (
                <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 capitalize">
                  {statusLabel}
                </span>
              ) : null}
            </div>
            <h3 className="review-display mt-3 text-xl font-semibold text-[var(--ink)]">
              Share or hand off {assetTitle ? <span className="text-[var(--accent)]">{assetTitle}</span> : "this asset"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Pick the outcome first, then Co-Deliver will frame the link so the recipient knows whether they
              are reviewing, approving, or receiving the final delivery.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-[var(--border)] p-2 text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
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
                        onClick={() => setShareIntent(intent.value)}
                        className={`rounded-[var(--radius)] border px-4 py-4 text-left transition-colors ${
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent)]/8 shadow-[0_0_0_1px_var(--accent)]"
                            : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${
                              selected ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--ink)]"
                            }`}
                          >
                            {INTENT_ICONS[intent.value]}
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
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
                        Recipient name
                      </label>
                      <input
                        value={reviewerName}
                        onChange={(event) => setReviewerName(event.target.value)}
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
                        onChange={(event) => setReviewerEmail(event.target.value)}
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
                          : "Add an email if Co-Deliver should send the link for you."}
                      </p>
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
                      <span className="rounded-full bg-[var(--orange)]/10 px-3 py-1 text-[11px] font-medium text-[var(--orange)]">
                        Custom
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]">
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
                          onChange={(event) => setExpiresAt(event.target.value)}
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
                          onChange={(event) =>
                            setMaxViews(event.target.value ? Number.parseInt(event.target.value, 10) : null)
                          }
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
                          onChange={(event) => setWatermark(event.target.checked)}
                          className="accent-[var(--accent)]"
                        />
                        <Droplets size={14} className="text-[var(--muted)]" />
                        Watermark
                      </label>

                      <label className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--ink)]">
                        <input
                          type="checkbox"
                          checked={allowDownload}
                          onChange={(event) => setAllowDownload(event.target.checked)}
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

                <button
                  type="button"
                  onClick={createLink}
                  disabled={loading}
                  className="w-full rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Creating..." : `Create ${intentDefinition.label.toLowerCase()} link`}
                </button>
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
                    Co-Deliver will present this as <span className="font-medium text-[var(--ink)]">{intentDefinition.label}</span>,
                    so the recipient understands the intent before they interact with the asset.
                  </p>
                  <p>
                    The page will frame the next step as <span className="font-medium text-[var(--ink)]">{intentDefinition.nextStepLabel}</span>,
                    rather than a generic review request.
                  </p>
                  <p>
                    If you added a recipient email, Co-Deliver will send the link with intent-specific copy.
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
