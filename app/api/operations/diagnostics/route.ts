import { NextRequest, NextResponse } from "next/server";
import { collectDiagnostics, readLocalRuntimeSnapshot } from "@/lib/operations/diagnostics";
import { operationsLedger } from "@/lib/operations/idempotency";
import {
  authorizeOperationsRequest,
  emitOperationObservation,
  operationsErrorResponse,
} from "@/lib/operations/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorized = await authorizeOperationsRequest(request);
  if (!authorized.ok) return authorized.response;

  try {
    const now = new Date();
    const result = collectDiagnostics(
      authorized.authority,
      authorized.input,
      readLocalRuntimeSnapshot(authorized.authority.tenantId, now),
      operationsLedger,
      now,
    );
    emitOperationObservation(result.observation);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
