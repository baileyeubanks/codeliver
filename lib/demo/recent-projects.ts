/**
 * Co‑ProVideo — recent projects ordering (N2).
 *
 * The nav drawer's "Recent projects" rail is ordered by each project's latest
 * workspace activity, newest first. Projects with no recorded activity keep
 * their workspace order at the end of the list (stable sort).
 */

export interface ActivityLike {
  project_id: string;
  created_at: string;
}

export function orderProjectsByActivity<T extends { id: string }>(
  projects: readonly T[],
  activity: readonly ActivityLike[],
): T[] {
  const latestByProject = new Map<string, string>();
  for (const item of activity) {
    const previous = latestByProject.get(item.project_id);
    if (!previous || item.created_at > previous) {
      latestByProject.set(item.project_id, item.created_at);
    }
  }
  return [...projects].sort((a, b) =>
    (latestByProject.get(b.id) ?? "").localeCompare(latestByProject.get(a.id) ?? ""),
  );
}
