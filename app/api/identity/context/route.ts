import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  IDENTITY_BODY_LIMIT_BYTES,
  identityRpcCall,
  normalizeIdentityTeamId,
  parseIdentityMutation,
  type IdentityMutation,
} from "@/lib/identity/authority";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function json(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: NO_STORE_HEADERS,
  });
}

function isConfirmedContext(value: unknown, actorId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actor = (value as { actor?: unknown }).actor;
  return Boolean(
    actor &&
      typeof actor === "object" &&
      !Array.isArray(actor) &&
      (actor as { id?: unknown }).id === actorId,
  );
}

function identityError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("authority_version_conflict")) {
    return json(
      { error: "Settings changed elsewhere. Reload before saving again.", code: "IDENTITY_VERSION_CONFLICT" },
      { status: 409 },
    );
  }
  if (message.includes("identity_assurance_required")) {
    return json(
      { error: "Stronger sign-in verification is required for this change.", code: "IDENTITY_ASSURANCE_REQUIRED" },
      { status: 428 },
    );
  }
  if (message.includes("identity_not_found")) {
    return json({ error: "Identity resource was not found.", code: "IDENTITY_NOT_FOUND" }, { status: 404 });
  }
  if (message.includes("identity_forbidden") || message.includes("cross_tenant")) {
    return json({ error: "Forbidden", code: "IDENTITY_FORBIDDEN" }, { status: 403 });
  }
  if (
    error?.code === "22023" ||
    message.includes("identity_invalid") ||
    message.includes("invalid_identity")
  ) {
    return json({ error: "Identity settings were not accepted.", code: "IDENTITY_INVALID" }, { status: 400 });
  }
  return json(
    { error: "Identity settings are temporarily unavailable.", code: "IDENTITY_UNAVAILABLE" },
    { status: 503 },
  );
}

function teamForMutation(mutation: IdentityMutation) {
  if ("teamId" in mutation) return mutation.teamId;
  if (mutation.action === "preferences.update") return mutation.patch.activeTeamId ?? null;
  return null;
}

export async function GET(request: NextRequest) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const teamId = normalizeIdentityTeamId(request.nextUrl.searchParams.get("team_id"));
  if (teamId === undefined) {
    return json({ error: "team_id is invalid", field: "team_id" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("get_identity_context", {
    p_team_id: teamId,
  });
  if (error) return identityError(error);
  if (!isConfirmedContext(data, user.id)) {
    return json(
      { error: "Account settings could not be confirmed.", code: "IDENTITY_CONTEXT_INVALID" },
      { status: 503 },
    );
  }
  return json({ context: data });
}

export async function PATCH(request: NextRequest) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > IDENTITY_BODY_LIMIT_BYTES) {
    return json({ error: "Identity request is too large" }, { status: 413 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > IDENTITY_BODY_LIMIT_BYTES) {
    return json({ error: "Identity request is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Identity request must be valid JSON" }, { status: 400 });
  }

  const parsed = parseIdentityMutation(body);
  if (!parsed.ok) {
    return json({ error: parsed.error, field: parsed.field }, { status: 400 });
  }

  const call = identityRpcCall(parsed.value);
  const requestId = randomUUID();
  const { data, error } = await supabase.rpc(call.functionName, {
    ...call.args,
    p_request_id: requestId,
  });
  if (error) return identityError(error);
  if (!data) {
    return json(
      { error: "The settings change could not be confirmed.", code: "IDENTITY_MUTATION_UNCONFIRMED" },
      { status: 503 },
    );
  }

  const teamId = teamForMutation(parsed.value);
  const contextResult = await supabase.rpc("get_identity_context", {
    p_team_id: teamId,
  });

  if (contextResult.error || !isConfirmedContext(contextResult.data, user.id)) {
    return json(
      {
        error: "The change may have been applied, but confirmation failed. Reload before editing again.",
        code: "IDENTITY_CONFIRMATION_UNAVAILABLE",
        requestId,
      },
      { status: 503 },
    );
  }

  return json({
    ok: true,
    requestId,
    result: data,
    context: contextResult.data,
  });
}
