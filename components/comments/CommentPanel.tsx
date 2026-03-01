"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import CommentFilters, {
  type CommentFilterState,
} from "@/components/comments/CommentFilters";
import CommentThread from "@/components/comments/CommentThread";
import CommentInput from "@/components/comments/CommentInput";
import type { Comment } from "@/lib/types/codeliver";

interface CommentPanelProps {
  assetId: string;
  onSeek?: (time: number) => void;
}

export default function CommentPanel({ assetId, onSeek }: CommentPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [filters, setFilters] = useState<CommentFilterState>({
    status: "all",
    search: "",
    sort: "newest",
  });
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  // Fetch comments
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/assets/${assetId}/comments`);
        if (!res.ok) return;
        const data = await res.json();
        setComments(data.comments || data.items || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assetId]);

  // Partition root vs replies
  const roots = useMemo(
    () => comments.filter((c) => !c.parent_id),
    [comments]
  );
  const repliesMap = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const existing = map.get(c.parent_id) || [];
        existing.push(c);
        map.set(c.parent_id, existing);
      }
    }
    return map;
  }, [comments]);

  // Counts
  const resolvedCount = roots.filter((c) => c.status === "resolved").length;

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...roots];

    // Status filter
    if (filters.status === "open") {
      list = list.filter((c) => c.status !== "resolved");
    } else if (filters.status === "resolved") {
      list = list.filter((c) => c.status === "resolved");
    }

    // Search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.body.toLowerCase().includes(q) ||
          c.author_name?.toLowerCase().includes(q)
      );
    }

    // Sort
    if (filters.sort === "newest") {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (filters.sort === "oldest") {
      list.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else if (filters.sort === "timecode") {
      list.sort(
        (a, b) => (a.timecode_seconds ?? 0) - (b.timecode_seconds ?? 0)
      );
    }

    return list;
  }, [roots, filters]);

  // Handlers
  const handleNewComment = useCallback((comment: Comment) => {
    setComments((prev) => [...prev, comment]);
    setReplyTo(undefined);
  }, []);

  const handleResolve = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/assets/${assetId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "resolved" }),
      });
      if (res.ok) {
        setComments((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "resolved" } : c))
        );
      }
    },
    [assetId]
  );

  const handleSummarize = useCallback(async () => {
    setSummarizing(true);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          comments: roots.map((c) => ({
            author: c.author_name,
            body: c.body,
            status: c.status,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setSummaryOpen(true);
      }
    } finally {
      setSummarizing(false);
    }
  }, [assetId, roots]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--dim)]">
        Loading comments...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Comments
          </h3>
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--muted)]">
            {roots.length}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSummarize}
          disabled={summarizing || roots.length === 0}
          className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--purple)]/10 px-2.5 py-1 text-xs font-medium text-[var(--purple)] transition-colors hover:bg-[var(--purple)]/20 disabled:opacity-40"
        >
          <Sparkles size={12} />
          {summarizing ? "Summarizing..." : "Summarize"}
        </button>
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="border-b border-[var(--border)] bg-[var(--purple)]/5 px-4 py-3">
          <button
            type="button"
            onClick={() => setSummaryOpen(!summaryOpen)}
            className="flex w-full items-center justify-between text-xs font-medium text-[var(--purple)]"
          >
            <span className="flex items-center gap-1">
              <Sparkles size={12} />
              AI Summary
            </span>
            {summaryOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {summaryOpen && (
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {summary}
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <CommentFilters
          onFilterChange={setFilters}
          commentCount={roots.length}
          resolvedCount={resolvedCount}
        />
      </div>

      {/* Thread list */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--dim)]">
            No comments yet
          </p>
        )}
        {filtered.map((comment, i) => (
          <CommentThread
            key={comment.id}
            comment={comment}
            replies={repliesMap.get(comment.id) || []}
            onReply={setReplyTo}
            onResolve={handleResolve}
            onSeek={onSeek}
            index={i + 1}
          />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <CommentInput
          assetId={assetId}
          parentId={replyTo}
          onSubmit={handleNewComment}
          onCancel={replyTo ? () => setReplyTo(undefined) : undefined}
        />
      </div>
    </div>
  );
}
