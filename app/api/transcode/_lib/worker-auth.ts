import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

export function authorizedMediaWorker(request: NextRequest): boolean {
  const expected = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  const supplied = request.headers.get("x-codeliver-media-worker-token");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
