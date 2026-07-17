import { NextResponse } from "next/server";
import { getAssetAccess, PROJECT_ROLE_RANK } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import { getExternalNotificationAdapters } from "@/lib/notifications/adapters";
import {
  recoverOpaqueToken,
  withoutPersistedTokenSecrets,
} from "@/lib/security/opaque-token";
import { executeShareManifest, singleShareResponseBody } from "@/lib/sharing/share-api";
import { parseSingleShareRequest } from "@/lib/sharing/share-manifest";
import {
  deriveShareIntentFromRow,
  revokeShareLink,
  rotateShareLink,
} from "@/lib/sharing/share-service";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

const ROTATION_REQUEST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function responseInit(status: number, body: Record<string, unknown>) {
  const headers = new Headers();
  const retryAfter = body.retry_after_seconds;
  if (typeof retryAfter === "number") headers.set("Retry-After", String(retryAfter));
  const duration = (body.metrics as { duration_ms?: unknown } | undefined)?.duration_ms;
  if (typeof duration === "number") headers.set("Server-Timing", `cco-sharing;dur=${duration}`);
  return { status, headers };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "member");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }
  const canManageShareLinks =
    assetAccess.data.access_rank >= PROJECT_ROLE_RANK.admin;

  const client = getSupabase();
  const { data, error } = await client
    .from("review_invites")
    .select("*")
    .eq("asset_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  let items: Record<string, unknown>[];
  try {
    items = await Promise.all(
      (data ?? []).map(async (invite) => {
        const version = await resolveAssetVersion({
          assetId: id,
          versionId: invite.version_id,
          client,
        });
        const expired = Boolean(
          invite.expires_at && new Date(invite.expires_at).getTime() <= now,
        );
        const viewLimitReached =
          typeof invite.max_views === "number" &&
          typeof invite.view_count === "number" &&
          invite.view_count >= invite.max_views;
        const safeInvite = withoutPersistedTokenSecrets(
          invite as Record<string, unknown>,
        );
        const recoveredCredential = canManageShareLinks
          ? { token: recoverOpaqueToken(invite as Record<string, unknown>) }
          : {};
        delete safeInvite.token;
        delete safeInvite.password_hash;
        if (!canManageShareLinks) {
          delete safeInvite.reviewer_email;
          delete safeInvite.reviewer_name;
          delete safeInvite.watermark_text;
        }
        return {
          ...safeInvite,
          ...recoveredCredential,
          share_intent: deriveShareIntentFromRow(invite),
          authority_status: expired
            ? "revoked_or_expired"
            : viewLimitReached
              ? "view_limit_reached"
              : "active",
          version: version.ok
            ? {
                id: version.version.id,
                version_number: version.version.version_number,
                is_current: version.version.is_current,
              }
            : null,
          version_binding_error: version.ok ? null : version.error,
        };
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Stored share links could not be securely recovered" },
      { status: 503 },
    );
  }

  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = parseSingleShareRequest(body, {
    authenticatedTenantId: user.id,
    assetId: id,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field, mutation_performed: false },
      { status: 400 },
    );
  }

  const execution = await executeShareManifest({
    manifest: parsed.value,
    user,
    client: getSupabase(),
    baseUrl: getBaseUrl(),
    adapters: getExternalNotificationAdapters(),
  });
  const responseBody = singleShareResponseBody(execution.body as Record<string, unknown>);
  return NextResponse.json(responseBody, responseInit(execution.status, responseBody));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "admin");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }
  const { action, id: inviteId, request_id: requestId } = body as Record<string, unknown>;
  if (action !== "rotate") {
    return NextResponse.json({ error: "action must be rotate" }, { status: 400 });
  }
  if (typeof inviteId !== "string" || !inviteId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (typeof requestId !== "string" || !ROTATION_REQUEST_PATTERN.test(requestId)) {
    return NextResponse.json(
      { error: "request_id must be a 16-128 character idempotency key" },
      { status: 400 },
    );
  }

  const result = await rotateShareLink({
    client: getSupabase(),
    assetId,
    inviteId,
    requestId,
    actor: { id: user.id, name: user.email ?? "Co‑ProVideo operator" },
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "admin");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json().catch(() => null);
  const inviteId =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).id
      : null;
  if (typeof inviteId !== "string" || !inviteId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const result = await revokeShareLink({
    client: getSupabase(),
    assetId,
    inviteId,
    actor: { id: user.id, name: user.email ?? "Co‑ProVideo operator" },
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result);
}
