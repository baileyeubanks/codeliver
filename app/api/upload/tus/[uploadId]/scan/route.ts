import { setTimeout as delay } from "node:timers/promises";

import { NextRequest } from "next/server";

import { apiJson } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { readStorageConfig } from "@/lib/storage/config";
import { afterResponse } from "@/lib/runtime/after-response";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";
import type { UploadSession } from "@/lib/tus/session";
import {
  assertUploadStorageConfigured,
  ensureCatalogAsset,
  jsonUploadError,
} from "@/app/api/upload/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 960;

type RouteParams = { params: Promise<{ uploadId: string }> };

const NO_STORE = { "Cache-Control": "no-store" };
const STATUS_WAIT_MS = 20_000;
const STATUS_POLL_MS = 1_000;

function retryable(session: UploadSession): boolean {
  return (
    ["quarantined", "verifying"].includes(session.state) &&
    session.scan?.verdict === "error" &&
    session.scan.engine === "scanner-timeout"
  );
}

function catalogAttached(session: UploadSession): boolean {
  return (
    session.catalog.state === "attached" &&
    Boolean(session.assetId && session.versionId)
  );
}

function uploadBusy(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "UPLOAD_BUSY"
  );
}

async function attachCatalogForStatus(
  orchestrator: ReturnType<typeof createDefaultUploadOrchestrator>,
  session: UploadSession,
  userId: string,
): Promise<{ session: UploadSession; busy: boolean }> {
  if (catalogAttached(session)) {
    if (session.derivatives?.state === "ready") return { session, busy: false };
    try {
      return {
        session: await orchestrator.retryDerivatives(session.id, userId),
        busy: false,
      };
    } catch (error) {
      if (!uploadBusy(error)) throw error;
      return {
        session: (await orchestrator.getSession(session.id, userId)) ?? session,
        busy: true,
      };
    }
  }
  try {
    await ensureCatalogAsset(orchestrator, session, userId);
  } catch (error) {
    if (!uploadBusy(error)) throw error;
    return {
      session: (await orchestrator.getSession(session.id, userId)) ?? session,
      busy: true,
    };
  }
  return {
    session: (await orchestrator.getSession(session.id, userId)) ?? session,
    busy: false,
  };
}

function statusPayload(session: UploadSession) {
  const ready =
    session.state === "committed" &&
    session.scan?.verdict === "clean" &&
    session.catalog.state === "attached" &&
    Boolean(session.assetId && session.versionId && session.receipt);
  const processing =
    session.state === "verifying" ||
    (session.state === "committed" && session.scan?.verdict === "clean" && !ready);
  return {
    state: session.state,
    retryable: retryable(session),
    originalReady: ready,
    processing,
    message:
      session.state === "verifying"
        ? session.scan?.verdict === "clean"
          ? "Saving verified media to durable storage."
          : "Security scan is running against the retained verified upload."
        : ready
          ? "Security scan passed and the upload is ready."
          : processing
            ? "Verified media is saved and finalizing its catalog record."
          : retryable(session)
            ? "Security scan timed out. The verified upload remains quarantined and can be scanned again."
            : session.state === "rejected"
              ? "Security scan rejected this file. It remains unavailable for review."
              : "The upload remains quarantined and unavailable for review.",
    ...(ready
      ? {
          asset: { id: session.assetId },
          version: {
            id: session.versionId,
            number: session.version,
          },
        }
      : {}),
  };
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    if (!user) {
      return apiJson({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
    }
    assertUploadStorageConfigured(readStorageConfig());
    const { uploadId } = await params;
    const orchestrator = createDefaultUploadOrchestrator();
    const current = await orchestrator.getSession(uploadId, user.id);
    if (!current) {
      return apiJson({ error: "Upload not found", code: "UPLOAD_NOT_FOUND" }, { status: 404, headers: NO_STORE });
    }
    if (current.state === "committed") {
      const attached = await attachCatalogForStatus(orchestrator, current, user.id);
      return apiJson(statusPayload(attached.session), {
        status: attached.busy ? 202 : 200,
        headers: NO_STORE,
      });
    }
    const deferred =
      current.state === "verifying" &&
      current.offset === current.size &&
      current.scan === null &&
      current.finalizationDeferred === true &&
      current.receipt === null &&
      current.objectKey === null;
    const verifying = current.state === "verifying";
    const timeoutRetry =
      verifying &&
      current.scan?.verdict === "error" &&
      current.scan.engine === "scanner-timeout";
    const session = verifying
      ? current
      : await orchestrator.beginMalwareScanRetry(uploadId, user.id);

    // Persisted `verifying` is the restart boundary. Next's response lifecycle
    // keeps the full scan outside the client request while graceful shutdown
    // waits for the callback; a later POST safely resumes after a hard restart.
    afterResponse(async () => {
      try {
        const result = deferred
          ? await orchestrator.resumeDeferredFinalization(uploadId, user.id)
          : timeoutRetry
            ? await orchestrator.resumeMalwareScanRetry(uploadId, user.id)
            : verifying
              ? await orchestrator.recoverSession(uploadId, user.id)
              : await orchestrator.resumeMalwareScanRetry(uploadId, user.id);
        if (!result) return;
        if (result.state === "committed" && !catalogAttached(result)) {
          await ensureCatalogAsset(orchestrator, result, user.id);
        }
      } catch (error: unknown) {
        console.error(
          "[upload] Response-lifecycle security scan failed closed:",
          error instanceof Error ? error.message : "unknown error",
        );
      }
    });

    return apiJson(statusPayload(session), { status: 202, headers: NO_STORE });
  } catch (error) {
    return jsonUploadError(error, NO_STORE);
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    if (!user) {
      return apiJson({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
    }
    assertUploadStorageConfigured(readStorageConfig());
    const { uploadId } = await params;
    const orchestrator = createDefaultUploadOrchestrator();
    const deadline = Date.now() + STATUS_WAIT_MS;
    let session = await orchestrator.getSession(uploadId, user.id);
    if (!session) {
      return apiJson({ error: "Upload not found", code: "UPLOAD_NOT_FOUND" }, { status: 404, headers: NO_STORE });
    }
    while (session.state === "verifying" && Date.now() < deadline) {
      await delay(STATUS_POLL_MS);
      session = (await orchestrator.getSession(uploadId, user.id)) ?? session;
    }
    if (session.state === "committed") {
      const attached = await attachCatalogForStatus(orchestrator, session, user.id);
      return apiJson(statusPayload(attached.session), {
        status: attached.busy ? 202 : 200,
        headers: NO_STORE,
      });
    }
    return apiJson(statusPayload(session), { status: 200, headers: NO_STORE });
  } catch (error) {
    return jsonUploadError(error, NO_STORE);
  }
}
