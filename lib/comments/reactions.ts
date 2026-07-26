// Pure reaction toggling/aggregation for Co-Deliver comments.

import type { CommentReaction } from "@/lib/types/codeliver";

/** The fixed emoji row offered on each comment. */
export const REACTION_EMOJIS = ["👍", "❤️", "✅", "👀"] as const;

export interface GroupedReaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

/** Aggregate reactions by emoji; `userReacted` reflects `userId`'s own state. */
export function groupReactions(
  reactions: CommentReaction[],
  userId?: string,
): GroupedReaction[] {
  const map = new Map<string, GroupedReaction>();
  for (const reaction of reactions) {
    const existing =
      map.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        count: 0,
        userReacted: false,
      };
    existing.count += 1;
    if (userId && reaction.user_id === userId) existing.userReacted = true;
    map.set(reaction.emoji, existing);
  }
  return Array.from(map.values());
}

function defaultMakeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `reaction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Toggle `userId`'s reaction of `emoji` on a comment: removes their existing
 * reaction of that emoji if present, otherwise appends a new one. Never
 * touches other users' reactions. Returns a new array.
 */
export function toggleReaction(
  reactions: CommentReaction[],
  emoji: string,
  userId: string,
  commentId: string,
  makeId: () => string = defaultMakeId,
): CommentReaction[] {
  const own = reactions.find(
    (reaction) => reaction.emoji === emoji && reaction.user_id === userId,
  );
  if (own) {
    return reactions.filter((reaction) => reaction.id !== own.id);
  }
  return [
    ...reactions,
    {
      id: makeId(),
      comment_id: commentId,
      user_id: userId,
      emoji,
      created_at: new Date().toISOString(),
    },
  ];
}
