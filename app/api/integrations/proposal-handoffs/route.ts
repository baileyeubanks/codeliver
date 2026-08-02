import { NextResponse } from "next/server";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  parseProposalHandoffRequest,
  PROPOSAL_HANDOFF_MAX_BYTES,
  ProposalHandoffValidationError,
  proposalHandoffCanonicalPayload,
  proposalHandoffReceiverProof,
  verifyProposalHandoffAttestation,
} from "@/lib/integrations/proposal-handoff";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

function jsonError(
  error: string,
  status: number,
  details?: { code?: string; field?: string; retryable?: boolean },
) {
  return NextResponse.json(
    {
      error,
      ...(details?.code ? { code: details.code } : {}),
      ...(details?.field ? { field: details.field } : {}),
      ...(details?.retryable !== undefined
        ? { retryable: details.retryable }
        : {}),
    },
    { status },
  );
}

function requestValidationStatus(code: string) {
  if (
    code === "activation_schema_required" ||
    code === "proposal_request_receipt_required" ||
    code === "production_origin_required" ||
    code === "production_authorization_required"
  ) {
    return 422;
  }
  if (
    code === "production_authorization_not_authorized" ||
    code === "production_authorization_gate_not_complete" ||
    code === "invalid_production_authorization_gates" ||
    code === "duplicate_production_authorization_gate" ||
    code === "acceptance_gate_not_satisfied" ||
    code === "production_authorization_binding_mismatch"
  ) {
    return 409;
  }
  return 400;
}

function activationFailure(error: { message?: string; code?: string }) {
  const message = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    message.includes("production_authorization_required") ||
    message.includes("activation_authorization_required") ||
    message.includes("proposal_request_receipt_required") ||
    message.includes("production_origin_required")
  ) {
    return {
      status: 422,
      error: "Production authorization evidence is incomplete",
      code: "production_authorization_required",
      retryable: false,
    } as const;
  }
  if (
    message.includes("production_authorization_binding") ||
    message.includes("activation_authorization_binding") ||
    message.includes("authorization_payload_binding") ||
    message.includes("authorization_handoff_binding") ||
    message.includes("authorization_handoff_origin") ||
    message.includes("proposal_activation_authorization_conflict") ||
    message.includes("production_authorization_gate") ||
    message.includes("activation_gate") ||
    message.includes("acceptance_gate")
  ) {
    return {
      status: 409,
      error: "Production authorization no longer matches this proposal",
      code: "production_authorization_conflict",
      retryable: false,
    } as const;
  }
  if (
    message.includes("stale_or_mismatched_preproject_origin") ||
    message.includes("preproject_origin_version_conflict") ||
    message.includes("stale_or_mismatched_activation_readiness") ||
    message.includes("stale_or_mismatched_activation_crm_origin")
  ) {
    return {
      status: 409,
      error: "The CRM source changed after this proposal was prepared",
      code: "stale_preproject_origin",
      retryable: false,
    } as const;
  }
  if (
    message.includes("idempotency_payload_conflict") ||
    message.includes("proposal_already_activated")
  ) {
    return {
      status: 409,
      error: "This accepted proposal is already bound to a different project payload",
      code: "idempotency_payload_conflict",
      retryable: false,
    } as const;
  }
  if (
    message.includes("integration_binding") ||
    message.includes("permission") ||
    message.includes("forbidden")
  ) {
    return {
      status: 403,
      error: "Proposal integration is not authorized",
      code: "invalid_integration_binding",
      retryable: false,
    } as const;
  }
  if (
    message.includes("invalid_") ||
    message.includes("missing_") ||
    message.includes("incomplete_") ||
    message.includes("proposal_not_accepted")
  ) {
    return {
      status: 400,
      error: "Proposal handoff failed server validation",
      code: "invalid_proposal_handoff",
      retryable: false,
    } as const;
  }
  return {
    status: 503,
    error: "Proposal handoff is temporarily unavailable",
    code: "proposal_activation_unavailable",
    retryable: true,
  } as const;
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > PROPOSAL_HANDOFF_MAX_BYTES) {
    return jsonError("Proposal handoff is too large", 413, {
      code: "handoff_too_large",
      retryable: false,
    });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > PROPOSAL_HANDOFF_MAX_BYTES) {
    return jsonError("Proposal handoff is too large", 413, {
      code: "handoff_too_large",
      retryable: false,
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("Proposal handoff must be valid JSON", 400, {
      code: "invalid_json",
      retryable: false,
    });
  }

  let parsed;
  try {
    parsed = parseProposalHandoffRequest(body);
  } catch (error) {
    if (error instanceof ProposalHandoffValidationError) {
      return jsonError(error.message, requestValidationStatus(error.code), {
        code: error.code,
        field: error.field,
        retryable: false,
      });
    }
    throw error;
  }

  if (getSupabaseDataSchema() !== "co_production") {
    return jsonError(
      "Proposal integration requires the isolated Co-Production authority",
      503,
      { code: "proposal_authority_unavailable", retryable: false },
    );
  }

  const supabase = getSupabase();
  const { data: binding, error: bindingError } = await supabase
    .from("proposal_integration_public_keys")
    .select("source_tenant_id, signing_key_id, public_key_pem")
    .eq("source_tenant_id", parsed.payload.sourceTenantId)
    .eq("signing_key_id", parsed.attestation.keyId)
    .eq("active", true)
    .maybeSingle();

  if (bindingError) {
    return jsonError("Proposal integration authority is temporarily unavailable", 503, {
      code: "proposal_binding_unavailable",
      retryable: true,
    });
  }
  if (!binding || typeof binding.public_key_pem !== "string") {
    return jsonError("Proposal integration is not authorized", 403, {
      code: "invalid_integration_binding",
      retryable: false,
    });
  }

  let payloadHash: `sha256:${string}`;
  try {
    ({ payloadHash } = verifyProposalHandoffAttestation({
      request: parsed,
      publicKey: binding.public_key_pem,
    }));
  } catch (error) {
    if (error instanceof ProposalHandoffValidationError) {
      return jsonError("Proposal integration attestation is invalid", 403, {
        code: error.code,
        field: error.field,
        retryable: false,
      });
    }
    throw error;
  }

  if (parsed.payload.intent === "validate") {
    return NextResponse.json({
      mode: "dry_run",
      status: "validated",
      target: "Co-VideoPro",
      commercialAuthority: "CCO_OS",
      payloadHash,
      idempotencyKey: parsed.payload.idempotencyKey,
      productionModules: parsed.payload.productionModules,
      activationEnabled: process.env.PROPOSAL_HANDOFF_WRITES_ENABLED === "true",
    });
  }

  if (process.env.PROPOSAL_HANDOFF_WRITES_ENABLED !== "true") {
    return jsonError(
      "Proposal handoff validated, but project activation is disabled",
      409,
      { code: "proposal_activation_disabled", retryable: false },
    );
  }

  const canonicalPayload = proposalHandoffCanonicalPayload(parsed.payload);
  let receiverProof: string;
  try {
    receiverProof = proposalHandoffReceiverProof({
      canonicalPayload,
      secret: process.env.PROPOSAL_HANDOFF_RECEIVER_HMAC_SECRET ?? "",
    });
  } catch (error) {
    if (error instanceof ProposalHandoffValidationError) {
      return jsonError(
        "Proposal receiver authority is not configured",
        503,
        { code: "proposal_receiver_unavailable", retryable: false },
      );
    }
    throw error;
  }

  const { data, error } = await supabase.rpc("activate_authorized_proposal_handoff", {
    p_source_tenant_id: parsed.payload.sourceTenantId,
    p_signing_key_id: parsed.attestation.keyId,
    p_schema_version: parsed.schemaVersion,
    p_attestation: parsed.attestation,
    p_canonical_payload: canonicalPayload,
    p_receiver_proof: receiverProof,
  });

  if (error) {
    const failure = activationFailure(error);
    return jsonError(failure.error, failure.status, failure);
  }

  const receipt = Array.isArray(data) ? data[0] : data;
  if (!receipt || typeof receipt !== "object") {
    return jsonError("Project activation returned no durable receipt", 503, {
      code: "missing_activation_receipt",
      retryable: true,
    });
  }

  const replayed = (receipt as { replayed?: unknown }).replayed === true;
  return NextResponse.json(receipt, { status: replayed ? 200 : 201 });
}
