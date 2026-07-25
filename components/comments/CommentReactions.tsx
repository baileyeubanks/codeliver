"use client";

import { useState } from "react";
import {
  REACTION_EMOJIS,
  groupReactions,
  toggleReaction,
} from "@/lib/comments/reactions";
import type { CommentReaction } from "@/lib/types/codeliver";

interface CommentReactionsProps {
  commentId: string;
  reactions: CommentReaction[];
  userId?: string;
  /** Called after the local toggle; use it to persist when a backend exists. */
  onToggle?: (emoji: string, reacted: boolean) => void;
  /**
   * When true (default), also attempts the legacy `/api/comments/reactions`
   * call. Pass false for honest local-only demo behavior.
   */
  persist?: boolean;
}

/**
 * Fixed emoji toggle row (👍 ❤️ ✅ 👀). Toggling adds/removes the viewer's
 * own reaction and updates local state immediately; counts aggregate across
 * users. Any extra emojis already present are shown after the fixed row.
 */
export default function CommentReactions({
  commentId,
  reactions,
  userId,
  onToggle,
  persist = true,
}: CommentReactionsProps) {
  const effectiveUserId = userId ?? "demo-user";
  const [localReactions, setLocalReactions] = useState(reactions);

  const grouped = groupReactions(localReactions, effectiveUserId);
  const extraEmojis = grouped.filter(
    (group) => !(REACTION_EMOJIS as readonly string[]).includes(group.emoji),
  );
  const chips = [
    ...REACTION_EMOJIS.map((emoji) => {
      const group = grouped.find((entry) => entry.emoji === emoji);
      return {
        emoji,
        count: group?.count ?? 0,
        userReacted: group?.userReacted ?? false,
      };
    }),
    ...extraEmojis,
  ];

  async function handleToggle(emoji: string) {
    const reacted = !localReactions.some(
      (reaction) =>
        reaction.emoji === emoji && reaction.user_id === effectiveUserId,
    );
    setLocalReactions((prev) =>
      toggleReaction(prev, emoji, effectiveUserId, commentId),
    );
    onToggle?.(emoji, reacted);

    if (persist) {
      try {
        await fetch("/api/comments/reactions", {
          method: reacted ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment_id: commentId, emoji }),
        });
      } catch {
        // Local state is the honest source of truth in demo/offline contexts.
      }
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label="Comment reactions"
    >
      {chips.map((chip) => (
        <button
          key={chip.emoji}
          type="button"
          onClick={() => handleToggle(chip.emoji)}
          aria-pressed={chip.userReacted}
          aria-label={`${chip.emoji} reaction, ${chip.count}${chip.userReacted ? ", you reacted" : ""}`}
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-2 text-xs transition-colors sm:min-h-0 sm:min-w-0 sm:py-0.5 ${
            chip.userReacted
              ? "border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--ink)]"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]/30"
          }`}
        >
          <span aria-hidden>{chip.emoji}</span>
          <span>{chip.count}</span>
        </button>
      ))}
    </div>
  );
}
