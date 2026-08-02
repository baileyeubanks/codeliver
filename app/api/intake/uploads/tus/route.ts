import { NextResponse } from "next/server";

import {
  hashPublicInquiryUploadCapability,
  parsePublicInquiryUploadAuthority,
  parsePublicInquiryUploadIntent,
} from "@/lib/crm/intake-upload";
import { PUBLIC_INQUIRY_UPLOAD_MAX_BYTES } from "@/lib/crm/intake-upload-shared";
import { getSupabase } from "@/lib/supabase";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";
import { parseUploadMetadata, TUS_VERSION } from "@/lib/tus/protocol";
import {
  assertPublicIntakeUploadRequest,
  jsonPublicIntakeUploadError,
  publicIntakeRequestFingerprint,
  publicIntakeTusHeaders,
  publicIntakeUploadCapability,
  PublicIntakeUploadRouteError,
  throwOnPublicIntakeRpcError,
} from "@/app/api/intake/uploads/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseUploadLength(value: string | null): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    throw new PublicIntakeUploadRouteError(
      400,
      "INTAKE_UPLOAD_LENGTH_INVALID",
      "Upload-Length must be a positive integer",
    );
  }
  const parsed = BigInt(value);
  if (
    parsed > BigInt(Number.MAX_SAFE_INTEGER) ||
    parsed > BigInt(PUBLIC_INQUIRY_UPLOAD_MAX_BYTES)
  ) {
    throw new PublicIntakeUploadRouteError(
      413,
      "INTAKE_UPLOAD_LIMIT",
      "This file exceeds the intake attachment limit",
    );
  }
  return Number(parsed);
}

function assertAuthorityMatchesIntent(
  authority: NonNullable<ReturnType<typeof parsePublicInquiryUploadAuthority>>,
  intent: ReturnType<typeof parsePublicInquiryUploadIntent>,
) {
  if (
    authority.formKey !== intent.formKey ||
    authority.filename !== intent.filename ||
    authority.mimeType !== intent.mimeType ||
    authority.size !== intent.size ||
    authority.expectedSha256 !== intent.expectedSha256
  ) {
    throw new PublicIntakeUploadRouteError(
      409,
      "INTAKE_UPLOAD_CONFLICT",
      "Upload metadata conflicts with the durable intake record",
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: publicIntakeTusHeaders() });
}

export async function POST(request: Request) {
  const responseHeaders = publicIntakeTusHeaders();
  try {
    assertPublicIntakeUploadRequest(request);
    if (request.headers.get("tus-resumable") !== TUS_VERSION) {
      throw new PublicIntakeUploadRouteError(
        412,
        "INTAKE_UPLOAD_TUS_VERSION",
        "Unsupported tus version",
      );
    }

    const size = parseUploadLength(request.headers.get("upload-length"));
    const metadata = parseUploadMetadata(request.headers.get("upload-metadata"));
    const capability = publicIntakeUploadCapability(request);
    const intent = parsePublicInquiryUploadIntent({
      formKey: metadata.formKey,
      idempotencyKey: metadata.idempotencyKey,
      capabilityToken: capability.token,
      filename: metadata.filename,
      mimeType: metadata.filetype,
      size,
      expectedSha256: metadata.sha256,
    });
    const capabilityHash = hashPublicInquiryUploadCapability(intent.capabilityToken);
    const { data: beginData, error: beginError } = await getSupabase().rpc(
      "begin_public_inquiry_upload",
      {
        p_form_key: intent.formKey,
        p_idempotency_key: intent.idempotencyKey,
        p_request_fingerprint: publicIntakeRequestFingerprint(request),
        p_batch_capability_hash: capabilityHash,
        p_filename: intent.filename,
        p_mime_type: intent.mimeType,
        p_size_bytes: intent.size,
        p_expected_sha256: intent.expectedSha256,
      },
    );
    throwOnPublicIntakeRpcError(beginError);
    const reserved = parsePublicInquiryUploadAuthority(beginData);
    if (!reserved) {
      throw new PublicIntakeUploadRouteError(
        503,
        "INTAKE_UPLOAD_RECEIPT_MISSING",
        "Upload authority returned no durable receipt",
        "15",
      );
    }
    assertAuthorityMatchesIntent(reserved, intent);

    const orchestrator = createDefaultUploadOrchestrator();
    let session;
    let resumed = reserved.replayed;
    if (reserved.uploadSessionId) {
      session = await orchestrator.recoverPublicIntakeSession(
        reserved.uploadSessionId,
        capabilityHash,
      );
      if (!session) {
        throw new PublicIntakeUploadRouteError(
          503,
          "INTAKE_UPLOAD_SESSION_UNAVAILABLE",
          "The durable upload session is unavailable",
          "15",
        );
      }
      resumed = true;
    } else {
      const created = await orchestrator.createPublicIntakeSession({
        formKey: intent.formKey,
        capabilityHash,
        idempotencyKey: intent.idempotencyKey,
        filename: intent.filename,
        mimeType: intent.mimeType,
        size: intent.size,
        expectedSha256: intent.expectedSha256,
      });
      session = created.session;
      resumed = resumed || created.resumed;
    }

    if (
      session.filename !== intent.filename ||
      session.mimeType !== intent.mimeType ||
      session.size !== intent.size ||
      session.expectedSha256 !== intent.expectedSha256
    ) {
      throw new PublicIntakeUploadRouteError(
        409,
        "INTAKE_UPLOAD_CONFLICT",
        "Upload session conflicts with the durable intake record",
      );
    }

    const { data: bindData, error: bindError } = await getSupabase().rpc(
      "bind_public_inquiry_upload_session",
      {
        p_authority_id: reserved.authorityId,
        p_batch_capability_hash: capabilityHash,
        p_upload_session_id: session.id,
      },
    );
    throwOnPublicIntakeRpcError(bindError);
    const bound = parsePublicInquiryUploadAuthority(bindData);
    if (!bound || bound.uploadSessionId !== session.id) {
      throw new PublicIntakeUploadRouteError(
        503,
        "INTAKE_UPLOAD_RECEIPT_MISSING",
        "Upload binding returned no durable receipt",
        "15",
      );
    }

    return new NextResponse(null, {
      status: 201,
      headers: publicIntakeTusHeaders({
        Location: `/api/intake/uploads/tus/${session.id}`,
        "Upload-Attachment-Id": bound.authorityId,
        "Upload-Offset": String(session.offset),
        "Upload-State": bound.state,
        "X-Upload-Resumed": String(resumed),
      }),
    });
  } catch (error) {
    return jsonPublicIntakeUploadError(error, responseHeaders);
  }
}
