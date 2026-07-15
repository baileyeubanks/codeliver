import { NextRequest, NextResponse } from "next/server";
import { planRecovery, readRecoverySnapshot } from "@/lib/operations/recovery";
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
    const result = planRecovery(
      authorized.authority,
      authorized.input,
      readRecoverySnapshot(authorized.authority.tenantId, now),
      operationsLedger,
      now,
    );
    emitOperationObservation(result.observation);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
