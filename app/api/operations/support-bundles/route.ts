import { NextRequest, NextResponse } from "next/server";
import { createSupportBundle } from "@/lib/operations/support-bundle";
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
    const result = createSupportBundle(
      authorized.authority,
      authorized.input,
      operationsLedger,
      new Date(),
    );
    emitOperationObservation(result.observation);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
