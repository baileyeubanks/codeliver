import type { Version } from "../types/codeliver.ts";

/**
 * P19 versions foundation — pure, DOM-free version-selection logic.
 *
 * These helpers are the single source of truth for how the review UI orders
 * versions, picks the "current" one, and interprets `?version=` deep-link
 * params. Everything here is null-safe: empty lists and unknown params
 * return null rather than throwing, so callers can fall back to the asset's
 * own file_url.
 */

/**
 * Newest first: `version_number` descending, ties broken by `created_at`
 * descending (later upload wins). Returns a new array; the input is not
 * mutated.
 */
export function sortVersions(versions: readonly Version[]): Version[] {
  return [...versions].sort((left, right) => {
    if (right.version_number !== left.version_number) {
      return right.version_number - left.version_number;
    }
    return Date.parse(right.created_at) - Date.parse(left.created_at);
  });
}

/**
 * The version the player should show by default. An explicit `is_current`
 * flag always wins (highest-numbered flag if several are set, which should
 * not happen but is tolerated); otherwise the highest version number is
 * treated as current. Empty list → null.
 */
export function currentVersion(versions: readonly Version[]): Version | null {
  if (versions.length === 0) return null;
  const flagged = versions.filter((version) => version.is_current);
  return sortVersions(flagged.length > 0 ? flagged : versions)[0] ?? null;
}

/**
 * Resolve a `?version=` deep-link param to a version.
 *
 * Accepted forms (case-insensitive, trimmed):
 * - null / undefined / "" → the current version (same as omitting the param)
 * - "latest" / "current" → the current version
 * - "3" or "v3" → the version with `version_number === 3`
 *
 * Anything else, or a number no version carries, → null so the caller can
 * ignore the param and show the current version.
 */
export function resolveVersionParam(
  versions: readonly Version[],
  param: string | null | undefined,
): Version | null {
  const normalized = param?.trim().toLowerCase() ?? "";
  if (normalized === "" || normalized === "latest" || normalized === "current") {
    return currentVersion(versions);
  }
  const match = /^v?(\d+)$/.exec(normalized);
  if (!match) return null;
  const wanted = Number.parseInt(match[1]!, 10);
  if (!Number.isSafeInteger(wanted) || wanted < 1) return null;
  return versions.find((version) => version.version_number === wanted) ?? null;
}

/**
 * Badge text for the version switcher, e.g. "V3 · Current" or "V1". The
 * `isCurrent` flag defaults to the version's own `is_current`; callers that
 * resolve currency via {@link currentVersion} (which tolerates missing
 * flags) should pass `version.id === current?.id` explicitly.
 */
export function versionBadgeLabel(version: Version, isCurrent?: boolean): string {
  const current = isCurrent ?? version.is_current;
  return current ? `V${version.version_number} · Current` : `V${version.version_number}`;
}

/**
 * Default pair for A/B compare mode: the two newest versions, newest as
 * `a`. Explicit params override either side (resolved with
 * {@link resolveVersionParam}). Returns null when two distinct versions
 * cannot be resolved — compare mode should stay hidden then.
 */
export function comparePair(
  versions: readonly Version[],
  aParam?: string | null,
  bParam?: string | null,
): { a: Version; b: Version } | null {
  if (aParam != null || bParam != null) {
    const a = resolveVersionParam(versions, aParam ?? null);
    const b = resolveVersionParam(versions, bParam ?? null);
    if (!a || !b || a.id === b.id) return null;
    return { a, b };
  }
  const ordered = sortVersions(versions);
  const a = ordered[0];
  const b = ordered[1];
  if (!a || !b) return null;
  return { a, b };
}
