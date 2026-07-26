// Pure thread shaping for Co-Deliver comments.

import type { Comment, CommentThreadFilter } from "@/lib/types/codeliver";

export interface CommentThreadNode {
  comment: Comment;
  replies: Comment[];
}

function byCreatedAtAsc(left: Comment, right: Comment): number {
  return left.created_at.localeCompare(right.created_at);
}

/**
 * Shape a flat comment list (roots + replies linked by `parent_id`) into
 * threads. Replies are sorted oldest-first; roots are sorted oldest-first.
 * Orphaned replies (parent missing from the list) are promoted to roots so
 * no comment silently disappears.
 */
export function buildThreads(comments: Comment[]): CommentThreadNode[] {
  const byParent = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  const ids = new Set(comments.map((comment) => comment.id));

  for (const comment of comments) {
    if (comment.parent_id && ids.has(comment.parent_id)) {
      const siblings = byParent.get(comment.parent_id) ?? [];
      siblings.push(comment);
      byParent.set(comment.parent_id, siblings);
    } else {
      roots.push(comment);
    }
  }

  return roots.sort(byCreatedAtAsc).map((comment) => ({
    comment,
    replies: (byParent.get(comment.id) ?? []).sort(byCreatedAtAsc),
  }));
}

/** Apply the All / Open / Resolved filter to shaped threads. */
export function filterThreads(
  threads: CommentThreadNode[],
  filter: CommentThreadFilter,
): CommentThreadNode[] {
  if (filter === "all") return threads;
  return threads.filter((thread) => thread.comment.status === filter);
}

export function countThreadsByStatus(threads: CommentThreadNode[]): {
  all: number;
  open: number;
  resolved: number;
} {
  let open = 0;
  let resolved = 0;
  for (const thread of threads) {
    if (thread.comment.status === "resolved") resolved += 1;
    else if (thread.comment.status === "open") open += 1;
  }
  return { all: threads.length, open, resolved };
}
