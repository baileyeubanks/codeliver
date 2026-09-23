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
  canReplyTo?: (comment: Comment) => boolean;
  canResolveComment?: (comment: Comment) => boolean;
  canEditComment?: (comment: Comment) => boolean;
  canReact?: boolean;
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
  canReplyTo,
  canResolveComment,
  canEditComment,
  canReact = true,
}: CommentListProps) {
  const [filter, setFilter] = useState<CommentThreadFilter>("all");
  const [query, setQuery] = useState("");

  const threads = buildThreads(comments);
  const counts = countThreadsByStatus(threads);
  const statusFiltered = filterThreads(threads, filter);
  // VA-019 R-W3: the side panel searches bodies, authors, and replies.
  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? statusFiltered.filter((thread) =>
        thread.comment.body.toLowerCase().includes(normalizedQuery) ||
        (thread.comment.author_name ?? "").toLowerCase().includes(normalizedQuery) ||
        thread.replies.some((reply) => reply.body.toLowerCase().includes(normalizedQuery)),
      )
    : statusFiltered;

  return (
    <div className="min-w-0">
      {threads.length > 0 ? (
        <div className="mb-3">
          <label htmlFor="comment-list-search" className="sr-only">
            Search comments
          </label>
          <input
            id="comment-list-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search comments"
            className="min-h-[44px] w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)] sm:min-h-0 sm:py-1.5"
          />
        </div>
      ) : null}

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
        <p className="border-y border-[var(--border)] px-3 py-4 text-center text-sm text-[var(--dim)]">
          {normalizedQuery
            ? `No comments match "${query.trim()}".`
            : `No ${filter === "all" ? "" : `${filter} `}comments yet.`}
        </p>
      ) : (
        <div>
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
              canReply={Boolean(onReplySubmit) && (canReplyTo?.(thread.comment) ?? true)}
              canResolve={Boolean(onResolve || onUnresolve) && (canResolveComment?.(thread.comment) ?? true)}
              canEditComment={canEditComment}
              canReact={canReact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
