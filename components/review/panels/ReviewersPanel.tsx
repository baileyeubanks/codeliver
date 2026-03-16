"use client";

import { Users, Plus, Share2 } from "lucide-react";

interface Reviewer {
  id: string;
  name: string;
  email?: string;
  role: string;
  status: string;
  is_external?: boolean;
}

interface ReviewersPanelProps {
  approvers: Reviewer[];
  reviewers: Reviewer[];
  others: Reviewer[];
  approvalRequired: number;
  reviewRequired: number;
}

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function statusLabel(status: string) {
  switch (status) {
    case "approved": return "Approved";
    case "commented": return "Commented";
    case "done": return "Done";
    case "pending": return "Pending";
    default: return status;
  }
}

function ReviewerRow({ reviewer }: { reviewer: Reviewer }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`comment-avatar ${reviewer.is_external ? "external" : ""}`} style={{ width: 32, height: 32 }}>
        {getInitials(reviewer.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{reviewer.name}</p>
        <p className="text-xs text-[var(--muted)]">
          {reviewer.is_external ? "External reviewer" : "Team member"}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-[var(--muted)]">{statusLabel(reviewer.status)}</span>
        <button className="btn-icon" style={{ width: 28, height: 28 }} title="Share">
          <Share2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function ReviewersPanel({
  approvers,
  reviewers,
  others,
  approvalRequired,
  reviewRequired,
}: ReviewersPanelProps) {
  const approvalDone = approvers.filter((r) => r.status === "approved").length;
  const reviewDone = reviewers.filter((r) => ["commented", "done", "approved"].includes(r.status)).length;

  return (
    <div className="space-y-6">
      {/* Approval section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="kicker">Approval ({approvalDone}/{approvalRequired})</p>
        </div>
        <div className="progress-bar mb-3">
          <div
            className="progress-bar-fill"
            style={{ width: approvalRequired ? `${(approvalDone / approvalRequired) * 100}%` : "0%" }}
          />
        </div>
        {approvers.length > 0 ? (
          <div className="space-y-1">
            {approvers.map((r) => (
              <ReviewerRow key={r.id} reviewer={r} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">No approvers assigned</p>
        )}
        <button className="btn btn-secondary w-full mt-3">
          <Plus size={13} /> Invite users to approve
        </button>
      </section>

      {/* Review section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="kicker">Review ({reviewDone}/{reviewRequired})</p>
        </div>
        <div className="progress-bar mb-3">
          <div
            className="progress-bar-fill"
            style={{
              width: reviewRequired ? `${(reviewDone / reviewRequired) * 100}%` : "0%",
              background: "var(--blue)",
            }}
          />
        </div>
        {reviewers.length > 0 ? (
          <div className="space-y-1">
            {reviewers.map((r) => (
              <ReviewerRow key={r.id} reviewer={r} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">No reviewers assigned</p>
        )}
        <button className="btn btn-secondary w-full mt-3">
          <Plus size={13} /> Invite users to review
        </button>
      </section>

      {/* Other */}
      {others.length > 0 && (
        <section>
          <p className="kicker mb-2">Other</p>
          <div className="space-y-1">
            {others.map((r) => (
              <ReviewerRow key={r.id} reviewer={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
