import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  publicInquiryUploadStorageEvidence,
  parsePublicInquiryUploadAuthority,
  type PublicInquiryUploadAuthority,
  type PublicInquiryUploadState,
} from "@/lib/crm/intake-upload";
import { validateIntakeUploadSignature } from "@/lib/crm/intake-upload-signature";
import { PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES } from "@/lib/crm/intake-upload-shared";
import { getSupabase } from "@/lib/supabase";
import { UploadOrchestrationError } from "@/lib/tus/errors";
import { requestBodyChunks } from "@/lib/tus/http";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";
import { parseUploadChecksum, TUS_VERSION } from "@/lib/tus/protocol";
import type { UploadSession } from "@/lib/tus/session";
import {
  assertPublicIntakeUploadRequest,
  headPublicIntakeUploadError,
  jsonPublicIntakeUploadError,
  normalizePublicIntakeUploadId,
  publicIntakeTusHeaders,
  publicIntakeUploadCapability,
  PublicIntakeUploadRouteError,
  readPublicIntakeUploadAuthority,
  throwOnPublicIntakeRpcError,
} from "@/app/api/intake/uploads/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ uploadId: string }> };

function assertTusVersion(request: Request) {
  if (request.headers.get("tus-resumable") !== TUS_VERSION) {
    throw new PublicIntakeUploadRouteError(
      412,
      "INTAKE_UPLOAD_TUS_VERSION",
      "Unsupported tus version",
    );
  }
}

function authorityStateForSession(session: UploadSession): PublicInquiryUploadState {
  if (session.state === "aborted") return "cancelled";
  return session.state;
}

function assertSessionMatchesAuthority(
  session: UploadSession,
  authority: PublicInquiryUploadAuthority,
  capabilityHash: string,
) {
  const formKeyHash = createHash("sha256").update(authority.formKey).digest("hex");
  if (
    session.scopeKind !== "public-intake" ||
    session.intakeCapabilityHash !== capabilityHash ||
    session.intakeFormKeyHash !== formKeyHash ||
    session.filename !== authority.filename ||
    session.mimeType !== authority.mimeType ||
    session.size !== authority.size ||
    session.expectedSha256 !== authority.expectedSha256
  ) {
    throw new PublicIntakeUploadRouteError(
      404,
      "INTAKE_UPLOAD_NOT_FOUND",
      "Upload not found",
    );
  }
}

async function reconcileAuthority(
  authority: PublicInquiryUploadAuthority,
  session: UploadSession,
  capabilityHash: string,
): Promise<PublicInquiryUploadAuthority> {
  if (authority.state === "bound" || authority.state === "cancelled") return authority;
  if (session.offset < authority.uploadOffset) {
    throw new UploadOrchestrationError(
      "UPLOAD_STATE",
      "Durable upload bytes are behind the intake authority",
    );
  }
  const storageReceiptHash = publicInquiryUploadStorageEvidence({
    provider: session.receipt?.provider ?? session.provider,
    objectKey: session.receipt?.objectKey ?? session.objectKey,
    size: session.receipt?.size ?? session.size,
    sha256: session.receipt?.sha256 ?? session.computedSha256,
    committedAt: session.receipt?.committedAt ?? null,
  });
  const { data, error } = await getSupabase().rpc(
    "record_public_inquiry_upload_progress",
    {
      p_authority_id: authority.authorityId,
      p_batch_capability_hash: capabilityHash,
      p_expected_offset: authority.uploadOffset,
      p_next_offset: session.offset,
      p_upload_state: authorityStateForSession(session),
      p_computed_sha256: session.computedSha256,
      p_sniffed_mime_type: session.offset > 0 ? authority.mimeType : null,
      p_scan_verdict: session.scan?.verdict ?? null,
      p_storage_receipt_hash: storageReceiptHash,
    },
  );
  throwOnPublicIntakeRpcError(error);
  const reconciled = parsePublicInquiryUploadAuthority(data);
  if (!reconciled || reconciled.uploadSessionId !== session.id) {
    throw new PublicIntakeUploadRouteError(
      503,
      "INTAKE_UPLOAD_RECEIPT_MISSING",
      "Upload progress returned no durable receipt",
      "15",
    );
  }
  return reconciled;
}

function sessionHeaders(
  authority: PublicInquiryUploadAuthority,
  session: UploadSession,
): Record<string, string> {
  return publicIntakeTusHeaders({
    "Upload-Attachment-Id": authority.authorityId,
    "Upload-Offset": String(authority.uploadOffset),
    "Upload-Length": String(authority.size),
    "Upload-State": authority.state,
    "Upload-Scan-State": session.scan?.verdict ?? "pending",
    "Upload-Original-Ready": "false",
    "Upload-Derivative-State": "blocked",
    ...(session.computedSha256 ? { "Upload-SHA256": session.computedSha256 } : {}),
  });
}

function parseOffset(value: string | null): number {
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new PublicIntakeUploadRouteError(
      400,
      "INTAKE_UPLOAD_OFFSET_INVALID",
      "Upload-Offset must be a non-negative integer",
    );
  }
  const offset = Number(value);
  if (!Number.isSafeInteger(offset)) {
    throw new PublicIntakeUploadRouteError(
      400,
      "INTAKE_UPLOAD_OFFSET_INVALID",
      "Upload-Offset exceeds the safe integer range",
    );
  }
  return offset;
}

function assertChunkLength(request: Request) {
  const value = request.headers.get("content-length");
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    throw new PublicIntakeUploadRouteError(
      411,
      "INTAKE_UPLOAD_LENGTH_REQUIRED",
      "Content-Length is required for upload parts",
    );
  }
  if (BigInt(value) > BigInt(PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES)) {
    throw new PublicIntakeUploadRouteError(
      413,
      "INTAKE_UPLOAD_CHUNK_LIMIT",
      "Upload part exceeds the 8 MB chunk limit",
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: publicIntakeTusHeaders() });
}

export async function HEAD(request: Request, { params }: RouteParams) {
  const responseHeaders = publicIntakeTusHeaders();
  try {
    assertPublicIntakeUploadRequest(request);
    assertTusVersion(request);
    const uploadId = normalizePublicIntakeUploadId((await params).uploadId);
    const capability = publicIntakeUploadCapability(request, true);
    let authority = await readPublicIntakeUploadAuthority({
      uploadSessionId: uploadId,
      capabilityHash: capability.hash,
    });
    const orchestrator = createDefaultUploadOrchestrator();
    const session = await orchestrator.recoverPublicIntakeSession(
      uploadId,
      capability.hash,
    );
    if (!session) {
      throw new PublicIntakeUploadRouteError(
        404,
        "INTAKE_UPLOAD_NOT_FOUND",
        "Upload not found",
      );
    }
    assertSessionMatchesAuthority(session, authority, capability.hash);
    authority = await reconcileAuthority(authority, session, capability.hash);
    return new NextResponse(null, {
      status: 200,
      headers: sessionHeaders(authority, session),
    });
  } catch (error) {
    return headPublicIntakeUploadError(error, responseHeaders);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const responseHeaders = publicIntakeTusHeaders();
  try {
    assertPublicIntakeUploadRequest(request);
    assertTusVersion(request);
    if (
      request.headers.get("content-type")?.trim().toLowerCase() !==
      "application/offset+octet-stream"
    ) {
      throw new PublicIntakeUploadRouteError(
        415,
        "INTAKE_UPLOAD_CONTENT_TYPE",
        "Content-Type must be application/offset+octet-stream",
      );
    }
    assertChunkLength(request);
    const offset = parseOffset(request.headers.get("upload-offset"));
    const uploadId = normalizePublicIntakeUploadId((await params).uploadId);
    const capability = publicIntakeUploadCapability(request, true);
    const authority = await readPublicIntakeUploadAuthority({
      uploadSessionId: uploadId,
      capabilityHash: capability.hash,
    });
    if (authority.state !== "receiving" || authority.uploadOffset !== offset) {
      throw new UploadOrchestrationError(
        "UPLOAD_OFFSET",
        `Offset mismatch: expected ${authority.uploadOffset}, got ${offset}`,
      );
    }

    const orchestrator = createDefaultUploadOrchestrator();
    const session = await orchestrator.getPublicIntakeSession(
      uploadId,
      capability.hash,
    );
    if (!session) {
      throw new PublicIntakeUploadRouteError(
        404,
        "INTAKE_UPLOAD_NOT_FOUND",
        "Upload not found",
      );
    }
    assertSessionMatchesAuthority(session, authority, capability.hash);
    if (session.offset !== offset) {
      throw new UploadOrchestrationError(
        "UPLOAD_OFFSET",
        `Offset mismatch: expected ${session.offset}, got ${offset}`,
      );
    }

    const chunks = validateIntakeUploadSignature(
      requestBodyChunks(request),
      authority.mimeType,
      offset,
    );
    const result = await orchestrator.appendPublicIntakePart({
      uploadId,
      capabilityHash: capability.hash,
      offset,
      chunks,
      maxChunkBytes: PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES,
      expectedPartSha256: parseUploadChecksum(
        request.headers.get("upload-checksum"),
      ),
    });
    const reconciled = await reconcileAuthority(
      authority,
      result.session,
      capability.hash,
    );
    return new NextResponse(null, {
      status: 204,
      headers: sessionHeaders(reconciled, result.session),
    });
  } catch (error) {
    return jsonPublicIntakeUploadError(error, responseHeaders);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const responseHeaders = publicIntakeTusHeaders();
  try {
    assertPublicIntakeUploadRequest(request);
    assertTusVersion(request);
    const uploadId = normalizePublicIntakeUploadId((await params).uploadId);
    const capability = publicIntakeUploadCapability(request, true);
    const authority = await readPublicIntakeUploadAuthority({
      uploadSessionId: uploadId,
      capabilityHash: capability.hash,
    });
    const { error } = await getSupabase().rpc("cancel_public_inquiry_upload", {
      p_authority_id: authority.authorityId,
      p_batch_capability_hash: capability.hash,
    });
    throwOnPublicIntakeRpcError(error);

    const orchestrator = createDefaultUploadOrchestrator();
    const session = await orchestrator.getPublicIntakeSession(
      uploadId,
      capability.hash,
    );
    if (session && !["committed", "quarantined", "aborted"].includes(session.state)) {
      await orchestrator.abortPublicIntake(uploadId, capability.hash).catch(() => {
        console.error("[public-intake-upload] Staging cleanup requires recovery");
      });
    }
    return new NextResponse(null, { status: 204, headers: responseHeaders });
  } catch (error) {
    return jsonPublicIntakeUploadError(error, responseHeaders);
  }
}
