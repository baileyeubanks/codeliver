/**
 * Share links 2.0 (P22) — view receipts.
 *
 * A receipt is one recorded view of a review link: who (a free-form viewer
 * label) and when. Demo receipts live in the browser's localStorage via
 * share-link-store.ts and are labeled "local preview" wherever they render;
 * nothing here claims server-side analytics authority.
 */

export interface ShareViewReceipt {
  id: string;
  viewer_label: string;
  /** ISO 8601 instant of the view. */
  viewed_at: string;
}

/** Newest-first lists are capped so demo storage stays bounded. */
export const SHARE_VIEW_RECEIPT_LIMIT = 25;
export const SHARE_VIEW_SUMMARY_LATEST = 5;

export function createShareViewReceipt({
  viewerLabel,
  now = new Date(),
  id,
}: {
  viewerLabel: string;
  now?: Date;
  id: string;
}): ShareViewReceipt {
  const trimmed = viewerLabel.trim();
  return {
    id,
    viewer_label: trimmed || "Anonymous viewer",
    viewed_at: now.toISOString(),
  };
}

/** Prepend a receipt, keeping the list newest-first and within the cap. */
export function appendShareViewReceipt(
  receipts: ShareViewReceipt[],
  receipt: ShareViewReceipt,
  limit: number = SHARE_VIEW_RECEIPT_LIMIT,
): ShareViewReceipt[] {
  return [receipt, ...receipts].slice(0, Math.max(1, limit));
}

export interface ShareViewSummary {
  count: number;
  /** Up to SHARE_VIEW_SUMMARY_LATEST most recent receipts, newest first. */
  latest: ShareViewReceipt[];
  lastViewedAt: string | null;
}

export function summarizeShareViewReceipts(
  receipts: ShareViewReceipt[],
  latestLimit: number = SHARE_VIEW_SUMMARY_LATEST,
): ShareViewSummary {
  return {
    count: receipts.length,
    latest: receipts.slice(0, Math.max(0, latestLimit)),
    lastViewedAt: receipts[0]?.viewed_at ?? null,
  };
}
