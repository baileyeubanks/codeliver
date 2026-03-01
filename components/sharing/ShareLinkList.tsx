"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Trash2, ExternalLink, Eye, Clock } from "lucide-react";
import type { ShareLink } from "@/lib/types/codeliver";
import { timeAgo } from "@/lib/utils/media";

interface ShareLinkListProps {
  assetId: string;
}

export default function ShareLinkList({ assetId }: ShareLinkListProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/assets/${assetId}/share`)
      .then((r) => r.json())
      .then((data) => setLinks(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId]);

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
      setLinks((prev) => prev.filter((l) => l.id !== id));
    }
  }

  if (loading) {
    return <div className="skeleton h-16 rounded-lg" />;
  }

  if (links.length === 0) {
    return (
      <p className="text-sm text-[var(--dim)] text-center py-4">No active share links</p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
        Active Links ({links.length})
      </h4>
      {links.map((link) => {
        const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
        const isMaxed = link.max_views != null && link.view_count >= link.max_views;
        const disabled = isExpired || isMaxed;

        return (
          <div
            key={link.id}
            className={`bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 ${disabled ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  link.permissions === "approve"
                    ? "bg-[var(--green-dim)] text-[var(--green)]"
                    : link.permissions === "comment"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}>
                  {link.permissions}
                </span>
                {link.watermark_enabled && (
                  <span className="text-[10px] text-[var(--dim)]">watermarked</span>
                )}
                {disabled && (
                  <span className="text-[10px] text-[var(--red)]">
                    {isExpired ? "expired" : "max views reached"}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[var(--dim)]">{timeAgo(link.created_at)}</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-[var(--dim)] mb-2">
              <span className="flex items-center gap-1">
                <Eye size={10} /> {link.view_count} views
              </span>
              {link.last_viewed_at && (
                <span className="flex items-center gap-1">
                  <Clock size={10} /> Last: {timeAgo(link.last_viewed_at)}
                </span>
              )}
              {link.reviewer_name && (
                <span>{link.reviewer_name}</span>
              )}
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => copyLink(link.token, link.id)}
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              >
                {copiedId === link.id ? <Check size={12} /> : <Copy size={12} />}
                {copiedId === link.id ? "Copied" : "Copy"}
              </button>
              <a
                href={`/review/${link.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
              >
                <ExternalLink size={12} /> Open
              </a>
              <button
                onClick={() => revokeLink(link.id)}
                className="flex items-center gap-1 text-xs text-[var(--red)] hover:underline ml-auto"
              >
                <Trash2 size={12} /> Revoke
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
