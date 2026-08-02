import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createInquiryFingerprint,
  isSameOriginPublicIntake,
  parsePublicInquiryReceipt,
  parsePublicInquiryRequest,
  PreProjectValidationError,
  PUBLIC_INQUIRY_REQUEST_MAX_BYTES,
  trustedPublicIntakeEdgeAddress,
} from "@/lib/crm/preproject";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders },
  });
}

function submissionError(error: unknown) {
  if (!(error instanceof PreProjectValidationError)) {
    return json({ error: "The inquiry could not be accepted" }, 400);
  }
  if (error.code === "automated_submission") {
    return json({ error: "The inquiry could not be accepted" }, 400);
  }
  if (
    error.code === "fingerprint_authority_unavailable" ||
    error.code === "untrusted_edge_address"
  ) {
    return json(
      {
        error: "Inquiry intake is temporarily unavailable",
        code: "INTAKE_AUTHORITY_UNAVAILABLE",
      },
      503,
    );
  }
  return json(
    {
      error: error.message,
      code: error.code,
      ...(error.field ? { field: error.field } : {}),
    },
    400,
  );
}

function persistenceError(error: { code?: string; message?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (text.includes("public_inquiry_rate_limited")) {
    return json(
      { error: "Too many inquiry attempts. Please try again later.", code: "INTAKE_RATE_LIMITED" },
      429,
      { "Retry-After": "900" },
    );
  }
  if (text.includes("public_inquiry_idempotency_conflict")) {
    return json(
      { error: "This inquiry request key is already bound to different content", code: "INTAKE_CONFLICT" },
      409,
    );
  }
  if (text.includes("attachment_claim_not_found")) {
    return json(
      {
        error: "One or more attachments expired or could not be verified. Upload them again.",
        code: "INTAKE_ATTACHMENT_UNAVAILABLE",
      },
      409,
    );
  }
  if (text.includes("attachment_claim_conflict")) {
    return json(
      {
        error: "This inquiry request is already bound to a different attachment set",
        code: "INTAKE_ATTACHMENT_CONFLICT",
      },
      409,
    );
  }
  if (text.includes("attachment_claim_too_large")) {
    return json(
      { error: "The combined attachments exceed this inquiry form's limit" },
      413,
    );
  }
  if (text.includes("invalid_attachment_claim")) {
    return json(
      { error: "The attachment claim is invalid", code: "INTAKE_ATTACHMENT_INVALID" },
      400,
    );
  }
  if (text.includes("public_intake_form_not_found")) {
    return json({ error: "This inquiry form is not available", code: "INTAKE_FORM_UNAVAILABLE" }, 404);
  }
  if (text.includes("invalid_public_inquiry")) {
    return json({ error: "The inquiry could not be accepted", code: "INTAKE_INVALID" }, 400);
  }
  return json(
    { error: "Inquiry intake is temporarily unavailable", code: "INTAKE_UNAVAILABLE" },
    503,
  );
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Inquiry requests must use application/json" }, 415);
  }
  if (!isSameOriginPublicIntake(request)) {
    return json({ error: "Inquiry origin is not allowed", code: "INTAKE_ORIGIN_FORBIDDEN" }, 403);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > PUBLIC_INQUIRY_REQUEST_MAX_BYTES
  ) {
    return json({ error: "Inquiry request is too large" }, 413);
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > PUBLIC_INQUIRY_REQUEST_MAX_BYTES) {
    return json({ error: "Inquiry request is too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Inquiry request must be valid JSON" }, 400);
  }

  let inquiryRequest;
  let fingerprint;
  try {
    inquiryRequest = parsePublicInquiryRequest(body);
    const edgeAddress = trustedPublicIntakeEdgeAddress(request);
    if (!edgeAddress) {
      throw new PreProjectValidationError(
        "untrusted_edge_address",
        "Trusted edge address is unavailable",
      );
    }
    fingerprint = createInquiryFingerprint({
      secret: process.env.INTAKE_FINGERPRINT_HMAC_SECRET ?? "",
      edgeAddress,
    });
  } catch (error) {
    return submissionError(error);
  }

  if (getSupabaseDataSchema() !== "co_production") {
    return json(
      { error: "Inquiry intake requires the isolated Co-VideoPro authority", code: "INTAKE_AUTHORITY_UNAVAILABLE" },
      503,
    );
  }

  const requestId = randomUUID();
  const { data, error } = await getSupabase().rpc("submit_public_inquiry", {
    p_form_key: inquiryRequest.inquiry.formKey,
    p_idempotency_key: inquiryRequest.inquiry.idempotencyKey,
    p_request_id: requestId,
    p_request_fingerprint: fingerprint,
    p_payload: inquiryRequest.inquiry,
    p_attachment_claim: inquiryRequest.attachmentClaim,
  });
  if (error) return persistenceError(error);

  const receipt = parsePublicInquiryReceipt(data);
  if (!receipt) {
    return json(
      { error: "Inquiry intake returned no durable receipt", code: "INTAKE_RECEIPT_MISSING" },
      503,
    );
  }

  return json(
    {
      status: receipt.status,
      requestId: receipt.requestId,
      attachmentCount: receipt.attachmentCount,
    },
    202,
  );
}
