import { NextResponse } from "next/server";

import { getReviewInviteByToken } from "@/lib/review-invites";
import {
  createReviewAccessGrant,
  REVIEW_PASSWORD_MAX_LENGTH,
  verifyReviewPassword,
} from "@/lib/security/review-password";
import {
  extractClientAddress,
  hashViewerAddress,
} from "@/lib/sharing/share-analytics";
import { getSupabase } from "@/lib/supabase";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 8;
const MAX_REQUEST_BYTES = 2_048;

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

async function recentFailedAttempts(inviteId: string, viewerHash: string | null) {
  let query = getSupabase()
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("action", "review_password_attempt")
    .gte("created_at", new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString())
    .contains("details", {
      review_invite_id: inviteId,
      outcome: "failed",
    });

  if (viewerHash) {
    query = query.contains("details", { viewer_address_hash: viewerHash });
  }

  const result = await query;
  if (result.error) throw new Error("Review password rate limit is unavailable");
  return result.count ?? 0;
}

async function recordAttempt({
  inviteId,
  assetId,
  projectId,
  viewerHash,
  outcome,
}: {
  inviteId: string;
  assetId: string;
  projectId: string | null;
  viewerHash: string | null;
  outcome: "failed" | "succeeded";
}) {
  const { error } = await getSupabase().from("activity_log").insert({
    project_id: projectId,
    asset_id: assetId,
    actor_id: null,
    actor_name: "External reviewer",
    action: "review_password_attempt",
    details: {
      review_invite_id: inviteId,
      viewer_address_hash: viewerHash,
      outcome,
    },
  });
  if (error) throw new Error("Review password audit is unavailable");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return noStore({ error: "Request is too large" }, { status: 413 });
  }

  const { token } = await params;
  const inviteLookup = await getReviewInviteByToken(token);
  if (!inviteLookup.ok) {
    return noStore({ error: "Review authorization failed" }, { status: 401 });
  }

  const { invite } = inviteLookup;
  if (!invite.password_hash) {
    return noStore({ unlocked: true, password_required: false });
  }

  const body = await request.json().catch(() => null);
  const password =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).password
      : null;
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > REVIEW_PASSWORD_MAX_LENGTH
  ) {
    return noStore({ error: "Password is required" }, { status: 400 });
  }

  let viewerHash: string | null;
  try {
    viewerHash = hashViewerAddress({
      address: extractClientAddress(request),
      inviteId: invite.id,
    });
    const attempts = await recentFailedAttempts(invite.id, viewerHash);
    if (attempts >= ATTEMPT_LIMIT) {
      const response = noStore(
        { error: "Too many password attempts. Try again later." },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(ATTEMPT_WINDOW_MS / 1000));
      return response;
    }
  } catch {
    return noStore(
      { error: "Review access is temporarily unavailable" },
      { status: 503 },
    );
  }

  const matches = await verifyReviewPassword(password, invite.password_hash).catch(
    () => false,
  );
  try {
    await recordAttempt({
      inviteId: invite.id,
      assetId: invite.asset_id,
      projectId: invite.assets?.projects?.id ?? null,
      viewerHash,
      outcome: matches ? "succeeded" : "failed",
    });
  } catch {
    return noStore(
      { error: "Review access is temporarily unavailable" },
      { status: 503 },
    );
  }

  if (!matches) {
    return noStore({ error: "Password is incorrect" }, { status: 401 });
  }

  try {
    const grant = createReviewAccessGrant({
      token,
      inviteId: invite.id,
      passwordHash: invite.password_hash,
      inviteExpiresAt: invite.expires_at,
    });
    const response = noStore({ unlocked: true, password_required: true });
    response.cookies.set(grant.name, grant.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: grant.maxAge,
    });
    return response;
  } catch {
    return noStore(
      { error: "Review access is temporarily unavailable" },
      { status: 503 },
    );
  }
}
