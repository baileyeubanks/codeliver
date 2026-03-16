"use client";

import React from "react";

/* ──────────────────────────────────────────────────────────────────
   PublicReviewWorkspace — Legacy layout shell for public review
   pages (review/[token]). This preserves the old slot-driven API
   that the 843-line PublicReviewPage depends on.
   ────────────────────────────────────────────────────────────────── */

interface Filter {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

interface StageSection {
  kicker: string;
  title: string;
  description: string;
  stats: string[];
  context: React.ReactNode;
  media: React.ReactNode;
}

interface RailSection {
  kicker: string;
  title: string;
  description: string;
  stats: string[];
  intro: React.ReactNode;
  approval?: {
    header: React.ReactNode;
    summary: React.ReactNode;
    error: string;
    content: React.ReactNode;
    footer?: React.ReactNode;
  } | null;
  comments: {
    title: string;
    description: string;
    countLabel: string;
    filters: Filter[];
    hasResults: boolean;
    emptyTitle: string;
    emptyDescription: string;
    content: React.ReactNode;
  };
  composer: React.ReactNode;
}

export interface ReviewWorkspaceProps {
  loading: boolean;
  error: string;
  header: React.ReactNode;
  stage: StageSection;
  rail: RailSection;
}

export default function ReviewWorkspace({
  loading,
  error,
  header,
  stage,
  rail,
}: ReviewWorkspaceProps) {
  if (loading) {
    return (
      <div className="review-shell flex items-center justify-center min-h-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="review-shell flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto px-6">
          <p className="text-lg font-semibold text-[var(--ink)] mb-2">Review unavailable</p>
          <p className="text-sm text-[var(--muted)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="review-shell min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header area */}
      <div className="px-6 py-6 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto grid xl:grid-cols-2 gap-6">
          {header}
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid xl:grid-cols-[1fr_420px] gap-6 p-6">
        {/* Stage (left) — media + context */}
        <div className="space-y-6">
          <div>
            <p className="review-kicker mb-1">{stage.kicker}</p>
            <h2 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {stage.title}
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">{stage.description}</p>
          </div>

          {stage.stats.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {stage.stats.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Media player */}
          <div className="review-ring rounded-2xl overflow-hidden">{stage.media}</div>

          {/* Context (selected comment or review state) */}
          <div className="card p-4">{stage.context}</div>
        </div>

        {/* Rail (right) — comments, approval, composer */}
        <div className="space-y-6">
          <div>
            <p className="review-kicker mb-1">{rail.kicker}</p>
            <h2 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {rail.title}
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">{rail.description}</p>
          </div>

          {rail.stats.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rail.stats.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Intro steps */}
          {rail.intro}

          {/* Approval section */}
          {rail.approval && (
            <div className="card p-4 space-y-4">
              {rail.approval.header}
              {rail.approval.summary}
              {rail.approval.error && (
                <p className="text-sm text-[var(--red)]">{rail.approval.error}</p>
              )}
              <div className="space-y-3">{rail.approval.content}</div>
              {rail.approval.footer}
            </div>
          )}

          {/* Comments section */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold">{rail.comments.title}</h3>
                <span className="text-xs text-[var(--muted)]">{rail.comments.countLabel}</span>
              </div>
              <p className="text-xs text-[var(--muted)]">{rail.comments.description}</p>
            </div>

            {/* Filters */}
            <div className="flex gap-1 px-4 py-2 border-b border-[var(--border)]">
              {rail.comments.filters.map((f) => (
                <button
                  key={f.id}
                  onClick={f.onClick}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    f.active
                      ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {rail.comments.hasResults ? (
                rail.comments.content
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm font-medium text-[var(--muted)] mb-1">
                    {rail.comments.emptyTitle}
                  </p>
                  <p className="text-xs text-[var(--dim)]">{rail.comments.emptyDescription}</p>
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          {rail.composer}
        </div>
      </div>
    </div>
  );
}
