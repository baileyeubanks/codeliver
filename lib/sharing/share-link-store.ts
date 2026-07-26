/**
 * Share links 2.0 (P22) — demo persistence for review-link settings and view
 * receipts.
 *
 * LOCAL PREVIEW ONLY. Records live in this browser's localStorage; they are
 * not shared across devices, not authoritative, and the password fingerprint
 * is demo-grade (see share-link-settings.ts). The demo workspace store
 * (lib/demo/workspace-store.ts) is owned by another lane, so P22 settings
 * persist here until the integration pass wires them together.
 */

import {
  DEFAULT_SHARE_LINK_SETTINGS,
  normalizeShareLinkSettings,
  validateShareLinkSettings,
  type ShareLinkSettingsInput,
  type ShareLinkValidationResult,
  type StoredShareLinkSettings,
} from "@/lib/sharing/share-link-settings";
import {
  appendShareViewReceipt,
  createShareViewReceipt,
  type ShareViewReceipt,
} from "@/lib/sharing/share-view-receipts";

export const SHARE_LINK_STORE_STORAGE_KEY = "co-videopro.share-links.v1";

export interface ShareLinkRecord {
  settings: StoredShareLinkSettings;
  /** Newest first, capped by appendShareViewReceipt. */
  receipts: ShareViewReceipt[];
}

interface ShareLinkStoreShape {
  version: 1;
  links: Record<string, ShareLinkRecord>;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeReceipts(raw: unknown): ShareViewReceipt[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is ShareViewReceipt =>
      Boolean(entry) &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as ShareViewReceipt).id === "string" &&
      typeof (entry as ShareViewReceipt).viewer_label === "string" &&
      typeof (entry as ShareViewReceipt).viewed_at === "string",
  );
}

function readStore(): ShareLinkStoreShape {
  if (!isBrowser()) return { version: 1, links: {} };
  try {
    const raw = window.localStorage.getItem(SHARE_LINK_STORE_STORAGE_KEY);
    if (!raw) return { version: 1, links: {} };
    const parsed = JSON.parse(raw) as Partial<ShareLinkStoreShape> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.links !== "object" || !parsed.links) {
      return { version: 1, links: {} };
    }
    const links: Record<string, ShareLinkRecord> = {};
    for (const [token, record] of Object.entries(parsed.links)) {
      if (!record || typeof record !== "object") continue;
      const settings = normalizeShareLinkSettings((record as ShareLinkRecord).settings);
      if (!settings) continue;
      links[token] = {
        settings,
        receipts: normalizeReceipts((record as ShareLinkRecord).receipts),
      };
    }
    return { version: 1, links };
  } catch {
    return { version: 1, links: {} };
  }
}

function writeStore(store: ShareLinkStoreShape): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SHARE_LINK_STORE_STORAGE_KEY, JSON.stringify(store));
}

/** Settings + receipts for one share token; null when nothing was saved. */
export function readShareLinkRecord(token: string): ShareLinkRecord | null {
  if (!token) return null;
  return readStore().links[token] ?? null;
}

/**
 * Settings for one share token, falling back to the open-link defaults so a
 * freshly seeded demo link still renders honestly in the dialog and gate.
 */
export function readShareLinkSettings(token: string): StoredShareLinkSettings {
  return readShareLinkRecord(token)?.settings ?? { ...DEFAULT_SHARE_LINK_SETTINGS };
}

/** Validate then persist; receipts already recorded for the token survive. */
export function saveShareLinkSettings(
  token: string,
  input: ShareLinkSettingsInput,
  now: Date = new Date(),
): ShareLinkValidationResult {
  const result = validateShareLinkSettings(input, now);
  if (!result.ok || !token) return result;
  const store = readStore();
  const existing = store.links[token];
  store.links[token] = {
    settings: result.settings,
    receipts: existing?.receipts ?? [],
  };
  writeStore(store);
  return result;
}

/**
 * Record one view of a link. Creates a default-settings record when none
 * exists so receipts still land for links that were never configured.
 * No-op outside the browser; returns the receipt (or null) so callers can
 * render truthfully.
 */
export function recordShareLinkView(
  token: string,
  viewerLabel: string,
  now: Date = new Date(),
): ShareViewReceipt | null {
  if (!isBrowser() || !token) return null;
  const store = readStore();
  const existing = store.links[token] ?? {
    settings: { ...DEFAULT_SHARE_LINK_SETTINGS },
    receipts: [],
  };
  const receipt = createShareViewReceipt({
    viewerLabel,
    now,
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `receipt-${now.getTime()}-${existing.receipts.length}`,
  });
  store.links[token] = {
    settings: existing.settings,
    receipts: appendShareViewReceipt(existing.receipts, receipt),
  };
  writeStore(store);
  return receipt;
}

/** Remove one link's record (settings + receipts). */
export function clearShareLinkRecord(token: string): void {
  if (!isBrowser()) return;
  const store = readStore();
  if (!(token in store.links)) return;
  delete store.links[token];
  writeStore(store);
}
