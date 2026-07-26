/**
 * Deliverables tracker logic for the project workspace (P24).
 *
 * A project owes two kinds of deliverables: the media working its way through
 * review (assets) and the export packages on the delivery record
 * (Deliverable). Rows merge both honestly — no invented due dates, review
 * links only where a real source asset can be identified.
 */

import { formatDateShort } from "./dates.ts";

/* -------------------------------------------------------------------------- */
/* Structural types (duck-typed so both demo seeds and API rows fit)          */
/* -------------------------------------------------------------------------- */

export interface DeliverableRecordLike {
  id: string;
  project_id: string;
  name: string;
  spec: {
    resolution: string;
    codec: string;
    aspect: string;
    captions: boolean;
  };
  source_version_id: string | null;
  status: string;
  delivered_at: string | null;
}

export interface AssetLike {
  id: string;
  project_id: string;
  title: string;
  file_type?: string;
  duration_seconds?: number | null;
  status: string;
}

export type DeliverableRowKind = "export" | "media";

export interface DeliverableRow {
  id: string;
  kind: DeliverableRowKind;
  name: string;
  format: string;
  durationSeconds: number | null;
  statusKey: string;
  statusLabel: string;
  timeline: string;
  /** Asset id the review link should point at; null = no link shown. */
  reviewAssetId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Status language                                                            */
/* -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<string, string> = {
  specced: "Specced",
  encoding: "Encoding",
  qc: "In QC",
  ready: "Ready",
  delivered: "Delivered",
  expired: "Expired",
  draft: "Working on it",
  in_review: "In review",
  needs_changes: "Changes requested",
  approved: "Approved",
  final: "Final",
};

/** Stable rollup order: record statuses first, then media statuses. */
const STATUS_ORDER = [
  "delivered",
  "ready",
  "qc",
  "encoding",
  "specced",
  "expired",
  "approved",
  "final",
  "in_review",
  "needs_changes",
  "draft",
];

export function deliverableStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

/* -------------------------------------------------------------------------- */
/* Review-link resolution                                                     */
/* -------------------------------------------------------------------------- */

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

/**
 * Match a deliverable to the asset it was exported from. Requires at least
 * two shared name tokens (e.g. "ica" + "roadshow") so unrelated exports never
 * get a plausible-but-wrong review link. Version-id tokens break ties.
 */
export function findReviewAssetId(
  deliverable: Pick<DeliverableRecordLike, "name" | "source_version_id" | "project_id">,
  assets: readonly Pick<AssetLike, "id" | "project_id" | "title">[],
): string | null {
  const nameTokens = tokens(deliverable.name);
  const versionTokens = tokens(deliverable.source_version_id ?? "");
  let best: { id: string; score: number; tiebreak: number } | null = null;

  for (const asset of assets) {
    if (asset.project_id !== deliverable.project_id) continue;
    const assetTokens = tokens(asset.title);
    let score = 0;
    let tiebreak = 0;
    for (const token of nameTokens) if (assetTokens.has(token)) score += 1;
    for (const token of versionTokens) if (assetTokens.has(token)) tiebreak += 1;
    if (score < 2) continue;
    if (!best || score > best.score || (score === best.score && tiebreak > best.tiebreak)) {
      best = { id: asset.id, score, tiebreak };
    }
  }
  return best?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Rows + rollups                                                             */
/* -------------------------------------------------------------------------- */

function formatSpec(spec: DeliverableRecordLike["spec"]): string {
  const parts = [spec.aspect, spec.resolution, spec.codec];
  if (spec.captions) parts.push("captioned");
  return parts.filter(Boolean).join(" · ");
}

function mediaFormat(asset: AssetLike): string {
  const kind = asset.file_type ?? "video";
  return kind === "video" ? "Video" : kind === "audio" ? "Audio" : kind === "image" ? "Image" : "Document";
}

export function buildDeliverableRows(input: {
  deliverables: readonly DeliverableRecordLike[];
  assets: readonly AssetLike[];
}): DeliverableRow[] {
  const exportRows: DeliverableRow[] = input.deliverables.map((deliverable) => ({
    id: deliverable.id,
    kind: "export",
    name: deliverable.name,
    format: formatSpec(deliverable.spec),
    durationSeconds: null,
    statusKey: deliverable.status,
    statusLabel: deliverableStatusLabel(deliverable.status),
    timeline: deliverable.delivered_at
      ? `Delivered ${formatDateShort(deliverable.delivered_at)}`
      : "Not scheduled",
    reviewAssetId: findReviewAssetId(deliverable, input.assets),
  }));

  const mediaRows: DeliverableRow[] = input.assets.map((asset) => ({
    id: asset.id,
    kind: "media",
    name: asset.title,
    format: mediaFormat(asset),
    durationSeconds: asset.duration_seconds ?? null,
    statusKey: asset.status,
    statusLabel: deliverableStatusLabel(asset.status),
    timeline: asset.status === "approved" || asset.status === "final" ? "Approved" : "Not scheduled",
    reviewAssetId: asset.id,
  }));

  return [...exportRows, ...mediaRows];
}

export interface DeliverableRollupEntry {
  statusKey: string;
  label: string;
  count: number;
}

export function rollupDeliverableRows(rows: readonly DeliverableRow[]): {
  total: number;
  counts: DeliverableRollupEntry[];
} {
  const tally = new Map<string, number>();
  for (const row of rows) tally.set(row.statusKey, (tally.get(row.statusKey) ?? 0) + 1);

  const ordered = STATUS_ORDER.filter((key) => tally.has(key)).map((key) => ({
    statusKey: key,
    label: deliverableStatusLabel(key),
    count: tally.get(key) ?? 0,
  }));
  const unordered = [...tally.keys()]
    .filter((key) => !STATUS_ORDER.includes(key))
    .sort()
    .map((key) => ({ statusKey: key, label: deliverableStatusLabel(key), count: tally.get(key) ?? 0 }));

  return { total: rows.length, counts: [...ordered, ...unordered] };
}
