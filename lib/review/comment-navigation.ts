export interface TimedVersionComment {
  id: string;
  timecode_seconds: number | null;
  created_at: string;
}

/** Stable timestamp order for the review arrows. Database response order is
 * never used as a tiebreaker, so two notes at one frame remain deterministic. */
export function orderedTimedComments<T extends TimedVersionComment>(comments: readonly T[]): T[] {
  return comments
    .filter((comment) => comment.timecode_seconds != null)
    .sort((left, right) =>
      (left.timecode_seconds ?? Number.POSITIVE_INFINITY) - (right.timecode_seconds ?? Number.POSITIVE_INFINITY)
      || left.created_at.localeCompare(right.created_at)
      || left.id.localeCompare(right.id),
    );
}

export function adjacentTimedComment<T extends TimedVersionComment>(
  comments: readonly T[],
  selectedId: string | null,
  direction: -1 | 1,
): T | null {
  if (comments.length === 0) return null;
  const index = comments.findIndex((comment) => comment.id === selectedId);
  return comments[index < 0
    ? (direction > 0 ? 0 : comments.length - 1)
    : (index + direction + comments.length) % comments.length] ?? null;
}
