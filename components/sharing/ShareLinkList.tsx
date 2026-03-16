"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  Download,
  Droplets,
  ExternalLink,
  Eye,
  MessageSquare,
  Shield,
  Trash2,
} from "lucide-react";
import { timeAgo } from "@/lib/utils/media";
import {
  deriveShareIntent,
  formatShareIntentMeta,
  type ShareIntent,
} from "@/lib/sharing/share-intent";
import type { ShareLink, SharePermission } from "@/lib/types/codeliver";

interface ShareLinkListProps {
  assetId: string;
  refreshKey?: number;
}

type ShareLinkWithIntent = ShareLink & {
  share_intent?: ShareIntent;
};

function capabilityLabel(permission: SharePermission) {
  if (permission === "approve") return "Comments and approval";
  if (permission === "comment") return "Comments open";
  return "View only";
}

export default function ShareLinkList({ assetId, refreshKey = 0 }: ShareLinkListProps) {
  const [links, setLinks] = useState<ShareLinkWithIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    fetch(`/api/assets/${assetId}/share`)
      .then((r) => r.json())
      .then((data) => setLinks(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId, refreshKey]);

  const orderedLinks = useMemo(
    () =>
      [...links].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [links],
  );

  function copyLink(token: string, id: string) {
    navigator.clipboard.writeText(`${window.location.origin}/review/${token}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function revokeLink(id: string) {
    const res = await fetch(`/api/assets/${assetId}/share`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      setLinks((prev) => prev.filter((link) => link.id !== id));
    }
  }

  if (loading) {
    return <div className="skeleton h-24 rounded-[var(--radius)]" />;
  }

  if (orderedLinks.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-8 text-center">
        <p className="text-sm font-medium text-[var(--ink)]">No active handoffs yet</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a link for internal review, client review, approval, or final delivery.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Active handoffs ({orderedLinks.length})
      </h4>

      {orderedLinks.map((link) => {
        const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
        const isMaxed = link.max_views != null && link.view_count >= link.max_views;
        const disabled = isExpired || isMaxed;
        const shareIntent =
          link.share_intent ??
          deriveShareIntent({
            permissions: link.permissions,
            downloadEnabled: link.download_enabled,
            watermarkEnabled: link.watermark_enabled,
          });
        const meta = formatShareIntentMeta(shareIntent);

        return (
          <div
            key={link.id}
            className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 ${
              disabled ? "opacity-60" : ""
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                      shareIntent === "approval_needed"
                        ? "bg-[var(--green)]/12 text-[var(--green)]"
                        : shareIntent === "final_delivery"
                          ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                          : shareIntent === "internal_review"
                            ? "bg-[var(--orange)]/12 text-[var(--orange)]"
                            : "bg-[var(--surface-2)] text-[var(--muted)]"
                    }`}
                  >
                    {meta.label}
                  </span>
                  <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11px] text-[var(--muted)]">
                    {capabilityLabel(link.permissions)}
                  </span>
                  {disabled ? (
                    <span className="rounded-full bg-[var(--red)]/10 px-3 py-1 text-[11px] font-medium text-[var(--red)]">
                      {isExpired ? "Expired" : "View limit reached"}
                    </span>
                  ) : null}
                </div>

                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{meta.recipientTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{meta.nextStepDescription}</p>
                </div>
              </div>

              <span className="text-xs text-[var(--dim)]">{timeAgo(link.created_at)}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1">
                <Eye size={11} />
                {link.view_count} views
              </span>
              {link.last_viewed_at ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1">
                  <Clock size={11} />
                  Last opened {timeAgo(link.last_viewed_at)}
                </span>
              ) : null}
              {link.download_enabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1">
                  <Download size={11} />
                  Download on
                </span>
              ) : null}
              {link.watermark_enabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1">
                  <Droplets size={11} />
                  Watermarked
                </span>
              ) : null}
              {link.permissions === "comment" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1">
                  <MessageSquare size={11} />
                  Feedback enabled
                </span>
              ) : null}
              {link.permissions === "approve" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1">
                  <Shield size={11} />
                  Approval enabled
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {link.reviewer_name || link.reviewer_email ? (
                <span className="text-[var(--muted)]">
                  Sent to <span className="font-medium text-[var(--ink)]">{link.reviewer_name || link.reviewer_email}</span>
                </span>
              ) : (
                <span className="text-[var(--dim)]">Link can be shared manually</span>
              )}
              {link.expires_at ? (
                <span className="text-[var(--dim)]">
                  Expires {new Date(link.expires_at).toLocaleDateString()}
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
              <button
                onClick={() => copyLink(link.token, link.id)}
                className="inline-flex items-center gap-1 text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
              >
                {copiedId === link.id ? <Check size={12} /> : <Copy size={12} />}
                {copiedId === link.id ? "Copied" : "Copy link"}
              </button>
              <a
                href={`/review/${link.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              >
                <ExternalLink size={12} />
                Open page
              </a>
              <button
                onClick={() => revokeLink(link.id)}
                className="ml-auto inline-flex items-center gap-1 text-[var(--red)] transition-colors hover:underline"
              >
                <Trash2 size={12} />
                Revoke
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
