import { NextResponse } from "next/server";

export const API_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export function apiJson(
  body: Record<string, unknown>,
  init: ResponseInit = {},
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...API_NO_STORE_HEADERS,
      ...init.headers,
    },
  });
}

export function apiError(
  error: string,
  code: string,
  status: number,
  headers?: HeadersInit,
) {
  return apiJson(
    { error, code },
    {
      status,
      headers,
    },
  );
}

export function backendUnavailable() {
  return apiError(
    "Backend service is unavailable",
    "BACKEND_UNAVAILABLE",
    503,
  );
}
