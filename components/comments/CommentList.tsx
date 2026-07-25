"use client";

import { useState } from "react";
import {
  buildThreads,
  countThreadsByStatus,
  filterThreads,
} from "@/lib/comments/threads";
import CommentThread from "@/components/comments/CommentThread";
import type {
  Comment,
  CommentThreadFilter,
  MentionRosterEntry,
} from "@/lib/types/codeliver";

interface CommentListProps {
  comments: Comment[];
  roster?: MentionRosterEntry[];
  currentUserId?: string;
  demoMode?: boolean;
  showVisibilityLabel?: boolean;
  selectedId?: string | null;
  onSelect?: (comment: Comment) => void;
  onSeek?: (time: number) => void;
  onReplySubmit?: (parentId: string, body: string, mentions: string[]) => void;
  onResolve?: (id: string) => void;
  onUnresolve?: (id: string) => void;
  onEdit?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
}

const FILTERS: { id: CommentThreadFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
];

/**
 * Comments 2.0 rail: status filter chips (All / Open / Resolved) over a flat
 * comment list, shaped into threads. Data arrives via props so any page can
 * wire its own backend later.
 */
export default function CommentList({
  comments,
  roster,
  currentUserId,
  demoMode = false,
  showVisibilityLabel = false,
  selectedId = null,
  onSelect,
  onSeek,
  onReplySubmit,
  onResolve,
  onUnresolve,
  onEdit,
  onDelete,
}: CommentListProps) {
  const [filter, setFilter] = useState<CommentThreadFilter>("all");

  const threads = buildThreads(comments);
  const counts = countThreadsByStatus(threads);
  const visible = filterThreads(threads, filter);

  return (
    <div>
      {/* Filter chips */}
      <div
        role="group"
        aria-label="Filter comments by status"
        className="mb-3 flex items-center gap-1.5"
      >
        {FILTERS.map((entry) => {
          const active = filter === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              aria-pressed={active}
              className={`flex min-h-[44px] items-center rounded-full border px-3 text-xs transition-colors sm:min-h-0 sm:py-1 ${
                active
                  ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 font-medium text-[var(--ink)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]/30"
              }`}
            >
              {entry.label} ({counts[entry.id]})
            </button>
          );
        })}
      </div>

      {/* Threads */}
      {visible.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-center text-sm text-[var(--dim)]">
          No {filter === "all" ? "" : `${filter} `}comments yet.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((thread, threadIndex) => (
            <CommentThread
              key={thread.comment.id}
              comment={thread.comment}
              replies={thread.replies}
              index={threadIndex + 1}
              roster={roster}
              currentUserId={currentUserId}
              demoMode={demoMode}
              showVisibilityLabel={showVisibilityLabel}
              selected={thread.comment.id === selectedId}
              onSelect={onSelect ? () => onSelect(thread.comment) : undefined}
              onSeek={onSeek}
              onReplySubmit={onReplySubmit}
              onResolve={onResolve}
              onUnresolve={onUnresolve}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
