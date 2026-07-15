import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { CollaborationProblem } from "@/lib/collaboration/control-plane";

const TRACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function requestTraceId(request: Request) {
  const candidate = request.headers.get("x-request-id");
  return candidate && TRACE_PATTERN.test(candidate) ? candidate : randomUUID();
}

export function problemResponse(problem: CollaborationProblem) {
  return NextResponse.json(
    {
      error: {
        code: problem.code,
        message: problem.message,
        recovery: problem.recovery,
        retryable: problem.retryable,
        ...(problem.expectedSequence === undefined
          ? {}
          : { expectedSequence: problem.expectedSequence }),
      },
      traceId: problem.traceId,
    },
    {
      status: problem.status,
      headers: { "cache-control": "no-store", "x-request-id": problem.traceId },
    },
  );
}

export function authorizationProblemResponse(
  result: { status: number; code: string; message: string; recovery: string },
  traceId: string,
) {
  return NextResponse.json(
    {
      error: {
        code: result.code,
        message: result.message,
        recovery: result.recovery,
        retryable: result.status >= 500,
      },
      traceId,
    },
    {
      status: result.status,
      headers: { "cache-control": "no-store", "x-request-id": traceId },
    },
  );
}
