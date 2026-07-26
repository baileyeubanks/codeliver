import { NextResponse } from "next/server";

import { apiJson } from "@/lib/api/responses";

export const LEGACY_UPLOAD_RETIRED = {
  error:
    "This legacy upload endpoint is retired. Use the canonical resumable upload endpoint.",
  code: "LEGACY_UPLOAD_RETIRED",
  canonicalUploadUrl: "/api/upload/tus",
} as const;

const RETIREMENT_HEADERS = {
  "Cache-Control": "no-store",
  Deprecation: "true",
  Link: '</api/upload/tus>; rel="successor-version"',
};

export function legacyUploadRetiredResponse() {
  return apiJson(LEGACY_UPLOAD_RETIRED, {
    status: 410,
    headers: RETIREMENT_HEADERS,
  });
}

export function legacyUploadRetiredHeadResponse() {
  return new NextResponse(null, {
    status: 410,
    headers: {
      ...RETIREMENT_HEADERS,
      "X-CoDeliver-Error-Code": LEGACY_UPLOAD_RETIRED.code,
    },
  });
}
