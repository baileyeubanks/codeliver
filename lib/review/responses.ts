import { NextResponse } from "next/server";

import { REVIEW_RESPONSE_HEADERS } from "@/lib/review/request-boundary";

export function reviewJson(
  body: Record<string, unknown>,
  init: ResponseInit = {},
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...REVIEW_RESPONSE_HEADERS,
      ...init.headers,
    },
  });
}

export function reviewError(
  error: string,
  code: string,
  status: number,
  headers?: HeadersInit,
) {
  return reviewJson(
    { error, code },
    {
      status,
      headers,
    },
  );
}

export function reviewBackendUnavailable(headers?: HeadersInit) {
  return reviewError(
    "Review service is unavailable",
    "REVIEW_SERVICE_UNAVAILABLE",
    503,
    headers,
  );
}
