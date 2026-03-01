"use client";

import { Shield, Clock, CheckCircle2 } from "lucide-react";

interface ExternalReviewBannerProps {
  projectName: string;
  assetTitle: string;
  permissions: "view" | "comment" | "approve";
  expiresAt?: string | null;
  reviewerName?: string | null;
}

export default function ExternalReviewBanner({
  projectName,
  assetTitle,
  permissions,
  expiresAt,
  reviewerName,
}: ExternalReviewBannerProps) {
  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiresDate
    ? Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_rgba(59,130,246,0.15)]" />
        <div>
          <span className="text-sm font-semibold text-[var(--ink)]">{assetTitle}</span>
          <span className="text-xs text-[var(--dim)] ml-2">{projectName}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {reviewerName && (
          <span className="text-xs text-[var(--muted)]">
            Reviewing as <span className="font-medium text-[var(--ink)]">{reviewerName}</span>
          </span>
        )}

        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
          permissions === "approve"
            ? "bg-[var(--green-dim)] text-[var(--green)]"
            : permissions === "comment"
            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
            : "bg-[var(--surface-2)] text-[var(--muted)]"
        }`}>
          {permissions === "approve" ? <CheckCircle2 size={10} /> : <Shield size={10} />}
          Can {permissions}
        </span>

        {daysLeft !== null && (
          <span className={`flex items-center gap-1 text-xs ${
            daysLeft <= 1 ? "text-[var(--red)]" : daysLeft <= 3 ? "text-[var(--orange)]" : "text-[var(--dim)]"
          }`}>
            <Clock size={10} />
            {daysLeft <= 0 ? "Expired" : `${daysLeft}d left`}
          </span>
        )}
      </div>
    </div>
  );
}
