import { NextResponse } from "next/server";

import {
  hashPublicInquiryUploadCapability,
  normalizePublicInquiryUploadCapability,
  parsePublicInquiryUploadAuthority,
  type PublicInquiryUploadAuthority,
} from "@/lib/crm/intake-upload";
import { IntakeUploadSignatureError } from "@/lib/crm/intake-upload-signature";
import {
  PUBLIC_INQUIRY_UPLOAD_MAX_BYTES,
} from "@/lib/crm/intake-upload-shared";
import {
  createInquiryFingerprint,
  isSameOriginPublicIntake,
  PreProjectValidationError,
  trustedPublicIntakeEdgeAddress,
} from "@/lib/crm/preproject";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { isStorageError } from "@/lib/storage/errors";
import { getSupabase } from "@/lib/supabase";
import { isUploadOrchestrationError } from "@/lib/tus/errors";
import { tusHeaders } from "@/lib/tus/protocol";

export const INTAKE_UPLOAD_CAPABILITY_HEADER = "x-intake-upload-capability";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PublicIntakeUploadRouteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: string;

  constructor(status: number, code: string, message: string, retryAfter?: string) {
    super(message);
    this.name = "PublicIntakeUploadRouteError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

class PublicIntakeUploadPersistenceError extends Error {
  constructor(readonly detail: string) {
    super("Public intake upload persistence failed");
    this.name = "PublicIntakeUploadPersistenceError";
  }
}

export function publicIntakeTusHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const base = tusHeaders(BigInt(PUBLIC_INQUIRY_UPLOAD_MAX_BYTES));
  return {
    ...base,
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Expose-Headers": `${base["Access-Control-Expose-Headers"]}, Upload-Attachment-Id, Upload-Scan-State, Upload-Original-Ready, Upload-Derivative-State, X-Upload-Resumed`,
    "Access-Control-Allow-Headers": `${base["Access-Control-Allow-Headers"]}, X-Intake-Upload-Capability`,
    ...extra,
  };
}

export function assertPublicIntakeUploadRequest(request: Request) {
  if (!isSameOriginPublicIntake(request)) {
    throw new PublicIntakeUploadRouteError(
      403,
      "INTAKE_UPLOAD_ORIGIN_FORBIDDEN",
      "Upload origin is not allowed",
    );
  }
  if (getSupabaseDataSchema() !== "co_production") {
    throw new PublicIntakeUploadRouteError(
      503,
      "INTAKE_UPLOAD_AUTHORITY_UNAVAILABLE",
      "Intake upload authority is unavailable",
      "15",
    );
  }
}

export function publicIntakeUploadCapability(
  request: Request,
  maskInvalid = false,
): { token: string; hash: `sha256:${string}` } {
  try {
    const token = normalizePublicInquiryUploadCapability(
      request.headers.get(INTAKE_UPLOAD_CAPABILITY_HEADER),
    );
    return { token, hash: hashPublicInquiryUploadCapability(token) };
  } catch (error) {
    if (maskInvalid && error instanceof PreProjectValidationError) {
      throw new PublicIntakeUploadRouteError(
        404,
        "INTAKE_UPLOAD_NOT_FOUND",
        "Upload not found",
      );
    }
    throw error;
  }
}

export function publicIntakeRequestFingerprint(request: Request): string {
  const edgeAddress = trustedPublicIntakeEdgeAddress(request);
  if (!edgeAddress) {
    throw new PublicIntakeUploadRouteError(
      503,
      "INTAKE_UPLOAD_AUTHORITY_UNAVAILABLE",
      "Intake upload authority is unavailable",
      "15",
    );
  }
  return createInquiryFingerprint({
    secret: process.env.INTAKE_FINGERPRINT_HMAC_SECRET ?? "",
    edgeAddress,
  });
}

export function normalizePublicIntakeUploadId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new PublicIntakeUploadRouteError(
      404,
      "INTAKE_UPLOAD_NOT_FOUND",
      "Upload not found",
    );
  }
  return normalized;
}

export function throwOnPublicIntakeRpcError(error: {
  code?: string;
  message?: string;
} | null) {
  if (!error) return;
  throw new PublicIntakeUploadPersistenceError(
    `${error.code ?? ""} ${error.message ?? ""}`.trim().toLowerCase(),
  );
}

export async function readPublicIntakeUploadAuthority(input: {
  uploadSessionId: string;
  capabilityHash: string;
}): Promise<PublicInquiryUploadAuthority> {
  const uploadSessionId = normalizePublicIntakeUploadId(input.uploadSessionId);
  const { data, error } = await getSupabase().rpc(
    "read_public_inquiry_upload_authority",
    {
      p_upload_session_id: uploadSessionId,
      p_batch_capability_hash: input.capabilityHash,
    },
  );
  throwOnPublicIntakeRpcError(error);
  const authority = parsePublicInquiryUploadAuthority(data);
  if (!authority || authority.uploadSessionId !== uploadSessionId) {
    throw new PublicIntakeUploadRouteError(
      503,
      "INTAKE_UPLOAD_RECEIPT_MISSING",
      "Upload authority returned no durable receipt",
      "15",
    );
  }
  return authority;
}

function mappedError(error: unknown): PublicIntakeUploadRouteError {
  if (error instanceof PublicIntakeUploadRouteError) return error;
  if (error instanceof IntakeUploadSignatureError) {
    return new PublicIntakeUploadRouteError(
      415,
      "INTAKE_UPLOAD_TYPE_MISMATCH",
      error.message,
    );
  }
  if (error instanceof PreProjectValidationError) {
    if (
      error.code === "fingerprint_authority_unavailable" ||
      error.code === "untrusted_edge_address"
    ) {
      return new PublicIntakeUploadRouteError(
        503,
        "INTAKE_UPLOAD_AUTHORITY_UNAVAILABLE",
        "Intake upload authority is unavailable",
        "15",
      );
    }
    return new PublicIntakeUploadRouteError(400, error.code, error.message);
  }
  if (error instanceof PublicIntakeUploadPersistenceError) {
    const text = error.detail;
    if (
      text.includes("public_upload_not_found") ||
      text.includes("public_intake_form_not_found")
    ) {
      return new PublicIntakeUploadRouteError(
        404,
        "INTAKE_UPLOAD_NOT_FOUND",
        "Upload not found",
      );
    }
    if (text.includes("public_upload_rate_limited")) {
      return new PublicIntakeUploadRouteError(
        429,
        "INTAKE_UPLOAD_RATE_LIMITED",
        "Too many uploads. Try again later.",
        "900",
      );
    }
    if (
      text.includes("public_upload_too_large") ||
      text.includes("public_upload_batch_limit")
    ) {
      return new PublicIntakeUploadRouteError(
        413,
        "INTAKE_UPLOAD_LIMIT",
        "This upload exceeds the intake attachment limit",
      );
    }
    if (
      text.includes("public_upload_conflict") ||
      text.includes("public_upload_checksum_mismatch")
    ) {
      return new PublicIntakeUploadRouteError(
        409,
        "INTAKE_UPLOAD_CONFLICT",
        "Upload state conflicts with the durable intake record",
      );
    }
    if (text.includes("invalid_public_upload")) {
      return new PublicIntakeUploadRouteError(
        400,
        "INTAKE_UPLOAD_INVALID",
        "Upload request is invalid",
      );
    }
    return new PublicIntakeUploadRouteError(
      503,
      "INTAKE_UPLOAD_UNAVAILABLE",
      "Intake upload is temporarily unavailable",
      "15",
    );
  }
  if (isUploadOrchestrationError(error)) {
    switch (error.code) {
      case "UPLOAD_NOT_FOUND":
      case "UPLOAD_FORBIDDEN":
        return new PublicIntakeUploadRouteError(
          404,
          "INTAKE_UPLOAD_NOT_FOUND",
          "Upload not found",
        );
      case "UPLOAD_INVALID":
        return new PublicIntakeUploadRouteError(400, "INTAKE_UPLOAD_INVALID", error.message);
      case "UPLOAD_CHECKSUM":
        return new PublicIntakeUploadRouteError(422, "INTAKE_UPLOAD_CHECKSUM", error.message);
      case "UPLOAD_CONFLICT":
      case "UPLOAD_OFFSET":
      case "UPLOAD_STATE":
        return new PublicIntakeUploadRouteError(409, "INTAKE_UPLOAD_CONFLICT", error.message);
      case "UPLOAD_QUOTA":
        return new PublicIntakeUploadRouteError(
          429,
          "INTAKE_UPLOAD_LIMIT",
          error.message,
          "60",
        );
      case "UPLOAD_BUSY":
        return new PublicIntakeUploadRouteError(423, "INTAKE_UPLOAD_BUSY", error.message, "2");
      case "UPLOAD_BACKPRESSURE":
        return new PublicIntakeUploadRouteError(
          503,
          "INTAKE_UPLOAD_UNAVAILABLE",
          error.message,
          "15",
        );
    }
  }
  if (isStorageError(error)) {
    if (error.code === "STORAGE_CAPACITY" && error.message.includes("chunk limit")) {
      return new PublicIntakeUploadRouteError(
        413,
        "INTAKE_UPLOAD_CHUNK_LIMIT",
        "Upload part exceeds the 8 MB chunk limit",
      );
    }
    if (error.code === "STORAGE_CHECKSUM") {
      return new PublicIntakeUploadRouteError(422, "INTAKE_UPLOAD_CHECKSUM", error.message);
    }
    if (error.code === "STORAGE_CONFLICT" || error.code === "STORAGE_OFFSET") {
      return new PublicIntakeUploadRouteError(409, "INTAKE_UPLOAD_CONFLICT", error.message);
    }
    if (error.code === "STORAGE_CAPACITY") {
      return new PublicIntakeUploadRouteError(
        507,
        "INTAKE_UPLOAD_CAPACITY",
        "Upload storage capacity is unavailable",
        "60",
      );
    }
    return new PublicIntakeUploadRouteError(
      503,
      "INTAKE_UPLOAD_UNAVAILABLE",
      "Intake upload storage is unavailable",
      "15",
    );
  }
  return new PublicIntakeUploadRouteError(
    503,
    "INTAKE_UPLOAD_UNAVAILABLE",
    "Intake upload is temporarily unavailable",
    "15",
  );
}

export function jsonPublicIntakeUploadError(
  error: unknown,
  headers: Record<string, string>,
): NextResponse {
  const mapped = mappedError(error);
  return NextResponse.json(
    { error: mapped.message, code: mapped.code },
    {
      status: mapped.status,
      headers: {
        ...headers,
        ...(mapped.retryAfter ? { "Retry-After": mapped.retryAfter } : {}),
      },
    },
  );
}

export function headPublicIntakeUploadError(
  error: unknown,
  headers: Record<string, string>,
): NextResponse {
  const mapped = mappedError(error);
  return new NextResponse(null, {
    status: mapped.status,
    headers: {
      ...headers,
      ...(mapped.retryAfter ? { "Retry-After": mapped.retryAfter } : {}),
    },
  });
}
