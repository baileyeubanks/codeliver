/**
 * P26 Asset Library — shared types for the pure library logic.
 * No DOM, no React, no store imports: everything here is unit-testable data.
 */

export const LIBRARY_FORMAT_KEYS = [
  "master",
  "web",
  "vertical",
  "square",
  "captioned",
  "clean",
  "audio_only",
  "thumbnail",
  "transcript",
] as const;

export type LibraryFormatKey = (typeof LIBRARY_FORMAT_KEYS)[number];

export interface LibraryFormatAvailable {
  format: LibraryFormatKey;
  available: true;
  /** Real file backing this format — the only honest download source. */
  href: string;
  size_bytes: number;
  /** Recorded once with `node:crypto` SHA-256 over the real file. */
  sha256: string;
  resolution?: string | null;
}

export interface LibraryFormatMissing {
  format: LibraryFormatKey;
  available: false;
  /** Truthful reason shown in the matrix, e.g. "Not produced for this asset". */
  reason: string;
}

export type LibraryFormatEntry = LibraryFormatAvailable | LibraryFormatMissing;

export type LibraryRightsKind = "paid_until" | "internal_only" | "unlimited";

export interface LibraryRights {
  kind: LibraryRightsKind;
  /** Human label rendered on the badge, e.g. "Paid usage until 2027-07". */
  label: string;
  /** ISO date when paid usage lapses; null when not time-boxed. */
  expires_at: string | null;
}

/** Curated metadata the library layers on top of a workspace asset. */
export interface LibraryAssetMeta {
  asset_id: string;
  campaign: string;
  platforms: string[];
  /** Deliverable type: "hero film", "speaker cut", "podcast episode", … */
  format: string;
  orientation: "landscape" | "portrait" | "square";
  product: string;
  talent: string[];
  tags: string[];
  rights: LibraryRights;
  /** Truthful master-file facts; null when no real file backs the asset. */
  resolution: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  formats: LibraryFormatEntry[];
}

export interface LibraryPackage {
  id: string;
  title: string;
  campaign: string;
  description: string;
  asset_ids: string[];
}

/** Flat record the query engine matches against. */
export interface LibrarySearchRecord {
  id: string;
  title: string;
  tags: string[];
  campaign: string;
  platforms: string[];
  format: string;
  orientation: string;
  product: string;
  talent: string[];
  rights_kind: LibraryRightsKind | "unknown";
  created_at: string;
  is_favorite: boolean;
}

export interface LibraryFacetFilters {
  campaign?: string;
  platform?: string;
  format?: string;
  orientation?: string;
  rights?: string;
  product?: string;
  talent?: string;
  /** ISO date (YYYY-MM-DD) bounds on created_at, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  favoritesOnly?: boolean;
}

export interface LibraryQuery {
  /** Free-text tokens (all must match, case-insensitive). */
  textTokens: string[];
  facets: LibraryFacetFilters;
}
