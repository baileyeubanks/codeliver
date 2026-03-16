/**
 * Stale Link & Upload Cleanup Worker
 *
 * 1. Expires review links past their expires_at date
 * 2. Cleans up stale incomplete tus uploads
 * 3. Logs cleanup actions
 *
 * Can be called from an API endpoint or cron job.
 */

import { getSupabase } from "@/lib/supabase";
import { cleanStaleUploads } from "@/lib/tus/store";

export interface CleanupResult {
  expiredLinks: number;
  staleUploads: number;
  timestamp: string;
}

/**
 * Run all cleanup tasks.
 */
export async function runCleanup(): Promise<CleanupResult> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  // 1. Expire stale review links
  let expiredLinks = 0;
  const { data: staleLinks, error } = await supabase
    .from("review_invites")
    .select("id, asset_id, reviewer_name, expires_at")
    .lt("expires_at", now)
    .eq("active", true);

  if (!error && staleLinks && staleLinks.length > 0) {
    const { error: updateError } = await supabase
      .from("review_invites")
      .update({ active: false })
      .in(
        "id",
        staleLinks.map((l) => l.id)
      );

    if (!updateError) {
      expiredLinks = staleLinks.length;

      // Log expiration
      const logEntries = staleLinks.map((link) => ({
        asset_id: link.asset_id,
        action: "link_expired",
        actor_name: "system",
        details: {
          invite_id: link.id,
          reviewer_name: link.reviewer_name,
          expired_at: link.expires_at,
        },
      }));
      await supabase.from("activity_log").insert(logEntries);
    }
  }

  // 2. Clean stale tus uploads (older than 24 hours)
  let staleUploads = 0;
  try {
    staleUploads = cleanStaleUploads(24 * 60 * 60 * 1000);
  } catch (err) {
    console.error("[cleanup] Stale upload cleanup error:", err);
  }

  const result: CleanupResult = {
    expiredLinks,
    staleUploads,
    timestamp: now,
  };

  console.log(
    `[cleanup] Done: ${expiredLinks} links expired, ${staleUploads} uploads cleaned`
  );

  return result;
}
