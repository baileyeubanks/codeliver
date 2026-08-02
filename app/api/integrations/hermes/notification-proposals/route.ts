import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveHostSurface } from "@/lib/auth/host-surface";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  HERMES_ORCHESTRATION_MAX_BYTES,
  HermesOrchestrationValidationError,
  InMemoryHermesNonceRegistry,
  parseHermesOrchestrationRequest,
  verifyHermesOrchestrationAttestation,
} from "@/lib/integrations/hermes-orchestration";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS });
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function row(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function productionAdminHost(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const requestHost = request.headers.get("host") ?? new URL(request.url).host;
  return resolveHostSurface(requestHost) === "admin";
}

function databaseError(error: { code?: string; message?: string } | null) {
  const message = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    message.includes("hermes_attestation_replay") ||
    message.includes("hermes_idempotency_conflict")
  ) {
    return json(
      {
        error: "This Hermes proposal conflicts with an existing signed request",
        code: "HERMES_PROPOSAL_CONFLICT",
      },
      409,
    );
  }
  if (
    message.includes("hermes_key") ||
    message.includes("hermes_forbidden") ||
    message.includes("permission")
  ) {
    return json(
      { error: "Hermes is not authorized", code: "HERMES_NOT_AUTHORIZED" },
      403,
    );
  }
  if (message.includes("invalid_hermes") || message.includes("hermes_invalid")) {
    return json(
      { error: "Hermes proposal failed server validation", code: "HERMES_PROPOSAL_INVALID" },
      400,
    );
  }
  return json(
    {
      error: "Hermes orchestration authority is temporarily unavailable",
      code: "HERMES_AUTHORITY_UNAVAILABLE",
    },
    503,
  );
}

export async function POST(request: Request) {
  if (!productionAdminHost(request)) {
    return json(
      { error: "Hermes ingress is restricted to the admin surface", code: "HOST_FORBIDDEN" },
      403,
    );
  }
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return json({ error: "Hermes proposals must use application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > HERMES_ORCHESTRATION_MAX_BYTES
  ) {
    return json({ error: "Hermes proposal is too large", code: "HERMES_PROPOSAL_TOO_LARGE" }, 413);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > HERMES_ORCHESTRATION_MAX_BYTES) {
    return json({ error: "Hermes proposal is too large", code: "HERMES_PROPOSAL_TOO_LARGE" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "Hermes proposal must be valid JSON", code: "INVALID_JSON" }, 400);
  }

  let parsed;
  try {
    parsed = parseHermesOrchestrationRequest(body);
  } catch (error) {
    if (error instanceof HermesOrchestrationValidationError) {
      return json(
        {
          error: error.message,
          code: error.code,
          ...(error.field ? { field: error.field } : {}),
        },
        400,
      );
    }
    throw error;
  }

  if (getSupabaseDataSchema() !== "co_production") {
    return json(
      {
        error: "Hermes requires the isolated Co-VideoPro authority",
        code: "HERMES_AUTHORITY_UNAVAILABLE",
      },
      503,
    );
  }

  const supabase = getSupabase();
  const keyResult = await supabase.rpc("get_active_hermes_signing_key", {
    p_key_id: parsed.attestation.keyId,
  });
  if (keyResult.error) return databaseError(keyResult.error);
  const key = row(keyResult.data);
  if (!key || typeof key.public_key_pem !== "string") {
    return json(
      { error: "Hermes is not authorized", code: "HERMES_NOT_AUTHORIZED" },
      403,
    );
  }

  let verified;
  try {
    // Durable replay protection is claimed atomically by the database RPC below.
    verified = verifyHermesOrchestrationAttestation({
      request: parsed,
      publicKey: key.public_key_pem,
      nonceRegistry: new InMemoryHermesNonceRegistry(),
    });
  } catch (error) {
    if (error instanceof HermesOrchestrationValidationError) {
      return json(
        {
          error: "Hermes attestation is invalid",
          code: error.code,
          ...(error.field ? { field: error.field } : {}),
        },
        403,
      );
    }
    throw error;
  }

  const result = await supabase.rpc("record_hermes_orchestration_proposal", {
    p_key_id: parsed.attestation.keyId,
    p_nonce_hash: sha256(parsed.attestation.nonce),
    p_signature_hash: sha256(parsed.attestation.signature),
    p_attestation_issued_at: parsed.attestation.issuedAt,
    p_attestation_expires_at: parsed.attestation.expiresAt,
    p_payload_hash: verified.payloadHash,
    p_payload: parsed.payload,
  });
  if (result.error) return databaseError(result.error);

  const receipt = row(result.data);
  if (
    !receipt ||
    typeof receipt.proposal_id !== "string" ||
    typeof receipt.status !== "string"
  ) {
    return json(
      {
        error: "Hermes proposal returned no durable receipt",
        code: "HERMES_RECEIPT_MISSING",
      },
      503,
    );
  }

  const replayed = receipt.replayed === true;
  return json(
    {
      proposalId: receipt.proposal_id,
      status: receipt.status,
      replayed,
      payloadHash: verified.payloadHash,
      humanApprovalRequired: true,
      deliveryState: "not_dispatched",
    },
    replayed ? 200 : 201,
  );
}
