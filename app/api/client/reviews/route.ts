import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";
import {
  buildClientReviewInbox,
  CLIENT_REVIEW_INBOX_LIMIT,
} from "@/lib/client-review-inbox";
import { getSupabase } from "@/lib/supabase";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function normalizedEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (resolveTrustedSurfaceRole(user) !== "client") {
    return json({ error: "Forbidden" }, 403);
  }

  const email = normalizedEmail(user.email);
  const confirmedAt = user.email_confirmed_at ?? user.confirmed_at;
  if (!email || !confirmedAt) {
    return json({ error: "Verified client email required" }, 403);
  }

  const client = getSupabase();
  const claim = await client
    .from("review_invites")
    .update({ reviewer_user_id: user.id })
    .is("reviewer_user_id", null)
    .eq("reviewer_email", email);

  if (claim.error) {
    return json({ error: "Client reviews are temporarily unavailable" }, 503);
  }

  const { data, error } = await client
    .from("review_invites")
    .select(
      "id, asset_id, version_id, reviewer_name, reviewer_email, reviewer_user_id, permissions, expires_at, active, view_count, max_views, created_at, token, token_ciphertext, assets(id, title, status, projects(id, name))",
    )
    .eq("reviewer_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(CLIENT_REVIEW_INBOX_LIMIT);

  if (error) {
    return json({ error: "Client reviews are temporarily unavailable" }, 503);
  }

  try {
    return json(buildClientReviewInbox(data ?? [], email));
  } catch {
    return json({ error: "Client reviews are temporarily unavailable" }, 503);
  }
}
