/**
 * P26 Asset Library — pure query engine: parse, match, combine.
 *
 * Text search accepts bare words plus `key:value` facet tokens, e.g.
 *   roadshow campaign:"ICA Roadshow" platform:linkedin after:2026-07-01 fav:true
 * Facet keys: campaign, platform, format, orientation, rights, product,
 * talent, after, before, fav.
 */

import type {
  LibraryAssetMeta,
  LibraryFacetFilters,
  LibraryQuery,
  LibrarySearchRecord,
} from "./types";

const FACET_TOKEN = /^([a-z]+):(.+)$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Split on whitespace, keeping "double quoted" phrases and key:"quoted" pairs intact. */
export function tokenizeQueryText(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /([a-z]+:"[^"]*")|"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    const token = match[1] ?? (match[2] !== undefined ? `"${match[2]}"` : match[3]);
    if (token.trim().length > 0) tokens.push(token);
  }
  return tokens;
}

/** Parse raw search text into free-text tokens + structured facets. */
export function parseLibraryQuery(input: string): LibraryQuery {
  const textTokens: string[] = [];
  const facets: LibraryFacetFilters = {};

  for (const rawToken of tokenizeQueryText(input)) {
    const token = unquote(rawToken);
    if (token.length === 0) continue;
    const facetMatch = !rawToken.startsWith('"') ? FACET_TOKEN.exec(token) : null;
    if (!facetMatch) {
      textTokens.push(token.toLowerCase());
      continue;
    }
    const [, key, rawValue] = facetMatch;
    const value = unquote(rawValue);
    if (value.length === 0) {
      textTokens.push(token.toLowerCase());
      continue;
    }
    switch (key) {
      case "campaign":
        facets.campaign = value;
        break;
      case "platform":
        facets.platform = value;
        break;
      case "format":
        facets.format = value;
        break;
      case "orientation":
        facets.orientation = value;
        break;
      case "rights":
        facets.rights = value;
        break;
      case "product":
        facets.product = value;
        break;
      case "talent":
        facets.talent = value;
        break;
      case "after":
        facets.dateFrom = value;
        break;
      case "before":
        facets.dateTo = value;
        break;
      case "fav":
      case "favorite":
        facets.favoritesOnly = value === "true" || value === "yes" || value === "1";
        break;
      default:
        // Unknown key — treat the whole token as free text, honestly.
        textTokens.push(token.toLowerCase());
    }
  }

  return { textTokens, facets };
}

/** Rail facets win over text-parsed facets for the same key. */
export function mergeFacets(
  parsed: LibraryFacetFilters,
  rail: LibraryFacetFilters,
): LibraryFacetFilters {
  const merged: LibraryFacetFilters = { ...parsed };
  for (const [key, value] of Object.entries(rail)) {
    if (value === undefined || value === "" || value === false) {
      if (key === "favoritesOnly" && value === false) merged.favoritesOnly = undefined;
      continue;
    }
    (merged as Record<string, unknown>)[key] = value;
  }
  if (rail.favoritesOnly === undefined && parsed.favoritesOnly === undefined) {
    delete merged.favoritesOnly;
  }
  return merged;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function textHaystack(record: LibrarySearchRecord): string {
  return normalize(
    [record.title, record.campaign, record.product, record.format, ...record.tags, ...record.talent].join(" "),
  );
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** Every text token and every active facet must match (AND semantics). */
export function matchesLibraryQuery(record: LibrarySearchRecord, query: LibraryQuery): boolean {
  const haystack = textHaystack(record);
  for (const token of query.textTokens) {
    if (!haystack.includes(token)) return false;
  }

  const { facets } = query;
  if (facets.campaign && normalize(record.campaign) !== normalize(facets.campaign)) return false;
  if (facets.format && normalize(record.format) !== normalize(facets.format)) return false;
  if (facets.orientation && normalize(record.orientation) !== normalize(facets.orientation)) {
    return false;
  }
  if (facets.product && normalize(record.product) !== normalize(facets.product)) return false;
  if (facets.rights && record.rights_kind !== normalize(facets.rights)) return false;
  if (
    facets.platform &&
    !record.platforms.some((platform) => normalize(platform) === normalize(facets.platform!))
  ) {
    return false;
  }
  if (
    facets.talent &&
    !record.talent.some((name) => normalize(name).includes(normalize(facets.talent!)))
  ) {
    return false;
  }
  if (facets.dateFrom && dateOnly(record.created_at) < facets.dateFrom) return false;
  if (facets.dateTo && dateOnly(record.created_at) > facets.dateTo) return false;
  if (facets.favoritesOnly && !record.is_favorite) return false;
  return true;
}

/** AND-combine text + all facets over the record set. */
export function filterLibraryAssets(
  records: LibrarySearchRecord[],
  query: LibraryQuery,
): LibrarySearchRecord[] {
  return records.filter((record) => matchesLibraryQuery(record, query));
}

/** Join a workspace asset with its curated metadata into a search record. */
export function toLibrarySearchRecord(
  asset: { id: string; title: string; created_at: string },
  meta: LibraryAssetMeta | undefined,
  isFavorite: boolean,
): LibrarySearchRecord {
  return {
    id: asset.id,
    title: asset.title,
    tags: meta?.tags ?? [],
    campaign: meta?.campaign ?? "",
    platforms: meta?.platforms ?? [],
    format: meta?.format ?? "",
    orientation: meta?.orientation ?? "",
    product: meta?.product ?? "",
    talent: meta?.talent ?? [],
    rights_kind: meta?.rights.kind ?? "unknown",
    created_at: asset.created_at,
    is_favorite: isFavorite,
  };
}

/** Distinct sorted values for one facet key — drives the filter rail options. */
export function facetValues(
  records: LibrarySearchRecord[],
  key: "campaign" | "platform" | "format" | "orientation" | "product" | "talent",
): string[] {
  const values = new Set<string>();
  for (const record of records) {
    if (key === "platform") {
      for (const platform of record.platforms) if (platform) values.add(platform);
    } else if (key === "talent") {
      for (const name of record.talent) if (name) values.add(name);
    } else {
      const value = record[key];
      if (value) values.add(value);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}
