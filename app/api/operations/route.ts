import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createOperationalAssessment } from "@/lib/operations/assessment";
import {
  OPERATIONS_LIMITS,
  OperationsError,
  parseEnvelope,
} from "@/lib/operations/contracts";
import { collectDiagnostics, readLocalRuntimeSnapshot } from "@/lib/operations/diagnostics";
import { operationsLedger } from "@/lib/operations/idempotency";
import { planRecovery, readRecoverySnapshot } from "@/lib/operations/recovery";
import { resolveOperationsAuthority } from "@/lib/operations/authorization";
import { evaluateSlos } from "@/lib/operations/slo";
import { createSupportBundle } from "@/lib/operations/support-bundle";

export const dynamic = "force-dynamic";

async function boundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > OPERATIONS_LIMITS.maximumRequestBytes) {
    throw new OperationsError("LIMIT_EXCEEDED", "Operations request exceeds its byte bound.", 413);
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > OPERATIONS_LIMITS.maximumRequestBytes) {
    throw new OperationsError("LIMIT_EXCEEDED", "Operations request exceeds its byte bound.", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OperationsError("INVALID_REQUEST", "Operations request must be valid JSON.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const input = await boundedJson(request);
    const envelope = parseEnvelope(input);
    const authority = await resolveOperationsAuthority(user.id, envelope.tenantId);
    if (!authority) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const operation = (input as Record<string, unknown>).operation;
    const now = new Date();
    const runtimeSnapshot = readLocalRuntimeSnapshot(authority.tenantId, now);
    const recoverySnapshot = readRecoverySnapshot(authority.tenantId, now);
    const result = operation === "assessment.create"
      ? createOperationalAssessment(authority, input, runtimeSnapshot, recoverySnapshot, operationsLedger, now)
      : operation === "slo.evaluate"
        ? evaluateSlos(authority, input, operationsLedger, now)
        : operation === "diagnostics.read"
          ? collectDiagnostics(authority, input, runtimeSnapshot, operationsLedger, now)
          : operation === "support_bundle.create"
            ? createSupportBundle(authority, input, operationsLedger, now)
            : operation === "recovery.plan"
              ? planRecovery(authority, input, recoverySnapshot, operationsLedger, now)
              : (() => { throw new OperationsError("INVALID_REQUEST", "Unknown operations action."); })();
    return NextResponse.json(result, { status: operation === "recovery.plan" ? 201 : 200 });
  } catch (error) {
    if (error instanceof OperationsError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          guidance: error.code === "UNSAFE_RECOVERY"
            ? "Request a dry-run plan; recovery execution is unavailable."
            : "Correct the request without weakening tenant, permission, or version binding.",
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Operations assessment failed closed." },
      { status: 500 },
    );
  }
}
