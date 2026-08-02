import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { readStorageConfig } from "@/lib/storage/config";
import { createMalwareScanHook } from "@/lib/storage/malware";
import { buildUploadWorkflowReadiness } from "@/lib/storage/release-readiness";
import { createStorageRuntime } from "@/lib/storage/runtime";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runtime = createStorageRuntime();
  const config = readStorageConfig();
  const uploadDiagnostics = config.filesystemRoot
    ? await createDefaultUploadOrchestrator().diagnostics(user.id)
    : null;
  const readiness =
    uploadDiagnostics?.storage ?? (await runtime.adapter.diagnose());
  const scanner = createMalwareScanHook(config.malwarePolicy).readiness!;
  const workflow =
    uploadDiagnostics?.workflow ??
    buildUploadWorkflowReadiness({
      storage: readiness,
      scanner,
      derivativeHooksConfigured: false,
    });
  return NextResponse.json(
    {
      status: readiness.readyForWrites ? "ready" : "blocked",
      provider: readiness.provider,
      label: readiness.label,
      configured: readiness.configured,
      external: readiness.external,
      writeEnabled: readiness.writeEnabled,
      readyForWrites: readiness.readyForWrites,
      capabilities: readiness.capabilities,
      checks: readiness.checks,
      capacity: readiness.capacity,
      quarantineRequired: config.malwarePolicy === "required",
      workflow,
      sessionControl: uploadDiagnostics
        ? {
            ...uploadDiagnostics.sessionControl,
            error: uploadDiagnostics.sessionControl.ready
              ? null
              : "Upload session control is unavailable",
          }
        : null,
      limits: {
        maxUploadBytes: config.maxUploadBytes.toString(),
        maxChunkBytes: config.maxChunkBytes.toString(),
        tenantQuotaBytes: config.tenantQuotaBytes.toString(),
        maxConcurrentUploads: config.maxConcurrentUploads,
        malwareScanTimeoutMs: config.malwareScanTimeoutMs,
        derivativeHookTimeoutMs: config.derivativeHookTimeoutMs,
      },
      observedAt: readiness.observedAt,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
