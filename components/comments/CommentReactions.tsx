"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { CommentReaction } from "@/lib/types/codeliver";

interface CommentReactionsProps {
  commentId: string;
  reactions: CommentReaction[];
  userId?: string;
}

const EMOJI_PICKER = ["👍", "❤️", "👀", "🔥", "✅"];

interface GroupedReaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

function groupReactions(
  reactions: CommentReaction[],
  userId?: string
): GroupedReaction[] {
  const map = new Map<string, { count: number; userReacted: boolean }>();
  for (const r of reactions) {
    const existing = map.get(r.emoji) || { count: 0, userReacted: false };
    existing.count++;
    if (userId && r.user_id === userId) existing.userReacted = true;
    map.set(r.emoji, existing);
  }
  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    ...data,
  }));
}

export default function CommentReactions({
  commentId,
  reactions,
  userId,
}: CommentReactionsProps) {
  const [localReactions, setLocalReactions] = useState(reactions);
  const [pickerOpen, setPickerOpen] = useState(false);

  const grouped = groupReactions(localReactions, userId);

  async function toggleReaction(emoji: string) {
    const userReacted = localReactions.some(
      (r) => r.emoji === emoji && r.user_id === userId
    );

    if (userReacted) {
      setLocalReactions((prev) =>
        prev.filter((r) => !(r.emoji === emoji && r.user_id === userId))
      );
      await fetch("/api/comments/reactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: commentId, emoji }),
      });
    } else {
      const optimistic: CommentReaction = {
        id: crypto.randomUUID(),
        comment_id: commentId,
        user_id: userId || "",
        emoji,
        created_at: new Date().toISOString(),
      };
      setLocalReactions((prev) => [...prev, optimistic]);
      await fetch("/api/comments/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: commentId, emoji }),
      });
    }

    setPickerOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {grouped.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => toggleReaction(g.emoji)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
            g.userReacted
              ? "border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--ink)]"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]/30"
          }`}
        >
          <span>{g.emoji}</span>
          <span>{g.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen(!pickerOpen)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--dim)] transition-colors hover:border-[var(--accent)]/30 hover:text-[var(--muted)]"
        >
          <Plus size={12} />
        </button>

        {pickerOpen && (
          <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg">
            {EMOJI_PICKER.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(emoji)}
                className="rounded p-1 text-sm transition-colors hover:bg-[var(--surface-2)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
