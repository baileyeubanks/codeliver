import { NextResponse } from "next/server";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import {
  CRM_MUTATION_MAX_BYTES,
  normalizeCrmUuid,
  parseInquiryQualificationReceipt,
  parseInquiryQualificationMutation,
  PreProjectValidationError,
} from "@/lib/crm/preproject";
import { getSupabaseDataSchema } from "@/lib/data-authority";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function databaseError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("crm_version_conflict")) {
    return json({ error: "The inquiry changed elsewhere. Reload before qualifying it." }, 409);
  }
  if (message.includes("crm_idempotency_conflict")) {
    return json({ error: "This request ID is already bound to different content" }, 409);
  }
  if (message.includes("crm_not_found")) return json({ error: "Inquiry not found" }, 404);
  if (message.includes("crm_forbidden")) return json({ error: "Forbidden" }, 403);
  if (message.includes("crm_invalid_transition") || message.includes("invalid_crm")) {
    return json({ error: "The inquiry cannot be qualified from its current state" }, 400);
  }
  return json({ error: "CRM authority is temporarily unavailable" }, 503);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "CRM authority is temporarily unavailable" }, 503);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Request must use application/json" }, 415);
  }

  let inquiryId: string;
  try {
    inquiryId = normalizeCrmUuid((await params).id, "inquiry_id");
  } catch {
    return json({ error: "Inquiry not found" }, 404);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > CRM_MUTATION_MAX_BYTES) {
    return json({ error: "Qualification request is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > CRM_MUTATION_MAX_BYTES) {
    return json({ error: "Qualification request is too large" }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }
  let mutation;
  try {
    mutation = parseInquiryQualificationMutation(body);
  } catch (error) {
    if (error instanceof PreProjectValidationError) {
      return json(
        { error: error.message, code: error.code, ...(error.field ? { field: error.field } : {}) },
        400,
      );
    }
    return json({ error: "Qualification request is invalid" }, 400);
  }

  const { data, error } = await supabase.rpc("qualify_inquiry", {
    p_inquiry_id: inquiryId,
    p_expected_version: mutation.expectedVersion,
    p_request_id: mutation.requestId,
    p_qualification: mutation,
  });
  if (error) return databaseError(error);
  const receipt = parseInquiryQualificationReceipt(data);
  if (!receipt) {
    return json({ error: "Qualification returned no durable receipt" }, 503);
  }
  return json(receipt, receipt.replayed ? 200 : 201);
}
