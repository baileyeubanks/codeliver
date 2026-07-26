/**
 * Share links 2.0 (P22) — pure access decision for a review link.
 *
 * Kept separate from the React gate (components/sharing/ShareLinkAccessGate)
 * so the block/admit logic is node:test covered without a DOM.
 */

import {
  isShareLinkExpired,
  type StoredShareLinkSettings,
} from "./share-link-settings.ts";

export type ShareLinkAccessState = "expired" | "password" | "admitted";

export function resolveShareLinkAccess(
  settings: Pick<
    StoredShareLinkSettings,
    "expires_at" | "has_password" | "password_hash"
  > | null,
  { unlocked = false, now = new Date() }: { unlocked?: boolean; now?: Date } = {},
): ShareLinkAccessState {
  // Expiry wins over the password prompt — no point gating a dead link.
  if (settings && isShareLinkExpired(settings, now)) return "expired";
  // A tampered record (password on, hash missing) still lands here and the
  // gate fails closed — no attempt can verify against a missing hash.
  if (settings?.has_password && !unlocked) return "password";
  return "admitted";
}
