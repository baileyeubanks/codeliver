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

function statusPayload(session: UploadSession) {
  const ready =
    session.state === "committed" &&
    session.scan?.verdict === "clean" &&
    session.catalog.state === "attached" &&
    Boolean(session.assetId && session.versionId && session.receipt);
  return {
    state: session.state,
    retryable: retryable(session),
    originalReady: ready,
    message:
      session.state === "verifying"
        ? "Security scan is running against the retained verified upload."
        : ready
          ? "Security scan passed and the upload is ready."
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
      await ensureCatalogAsset(orchestrator, current, user.id);
      const attached = (await orchestrator.getSession(uploadId, user.id)) ?? current;
      return apiJson(statusPayload(attached), { status: 200, headers: NO_STORE });
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
        if (result.state === "committed") {
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
      await ensureCatalogAsset(orchestrator, session, user.id);
      session = (await orchestrator.getSession(uploadId, user.id)) ?? session;
    }
    return apiJson(statusPayload(session), { status: 200, headers: NO_STORE });
  } catch (error) {
    return jsonUploadError(error, NO_STORE);
  }
}
