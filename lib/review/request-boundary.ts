import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const MAX_REVIEW_MUTATION_BYTES = 2_048;
const MAX_REVIEW_MUTATION_EDGE_BYTES = 64 * 1_024;
const TRUSTED_CLIENT_IP_HEADERS = new Set([
  "cf-connecting-ip",
  "x-real-ip",
]);

export const REVIEW_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

type ReviewRequestBoundary =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 413 | 415;
      code:
        | "REVIEW_ORIGIN_FORBIDDEN"
        | "REVIEW_REQUEST_TOO_LARGE"
        | "REVIEW_JSON_REQUIRED";
    };

function reviewBodyLimit(maxBytes: number): number {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_REVIEW_MUTATION_EDGE_BYTES
  ) {
    throw new Error("Review JSON byte limit is invalid");
  }
  return maxBytes;
}

function exactOrigin(request: Request): boolean {
  const supplied = request.headers.get("origin")?.trim();
  if (!supplied || supplied === "null") return false;
  try {
    const parsed = new URL(supplied);
    return (
      supplied === parsed.origin &&
      parsed.origin === new URL(request.url).origin
    );
  } catch {
    return false;
  }
}

function fetchMetadataAllowsSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  return !site || site === "same-origin";
}

export function validateReviewMutationRequest(
  request: Request,
  {
    maxBytes = MAX_REVIEW_MUTATION_BYTES,
  }: {
    maxBytes?: number;
  } = {},
): ReviewRequestBoundary {
  const bodyLimit = reviewBodyLimit(maxBytes);
  if (!exactOrigin(request) || !fetchMetadataAllowsSameOrigin(request)) {
    return {
      ok: false,
      status: 403,
      code: "REVIEW_ORIGIN_FORBIDDEN",
    };
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      status: 415,
      code: "REVIEW_JSON_REQUIRED",
    };
  }

  const rawLength = request.headers.get("content-length")?.trim();
  if (rawLength) {
    const length = Number(rawLength);
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > bodyLimit
    ) {
      return {
        ok: false,
        status: 413,
        code: "REVIEW_REQUEST_TOO_LARGE",
      };
    }
  }

  return { ok: true };
}

export function validateReviewReadRequest(
  request: Request,
): ReviewRequestBoundary {
  const suppliedOrigin = request.headers.get("origin");
  if (
    (suppliedOrigin !== null && !exactOrigin(request)) ||
    !fetchMetadataAllowsSameOrigin(request)
  ) {
    return {
      ok: false,
      status: 403,
      code: "REVIEW_ORIGIN_FORBIDDEN",
    };
  }
  return { ok: true };
}

function decodeSigningKey(value: string | undefined): Buffer {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(
      "CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY is required",
    );
  }
  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY must encode exactly 32 bytes",
    );
  }
  return key;
}

export function isSupportedReviewAdmissionTrustedIpHeader(
  value: string | undefined,
): boolean {
  return TRUSTED_CLIENT_IP_HEADERS.has(value?.trim().toLowerCase() ?? "");
}

export function reviewAdmissionNetworkBucket(
  request: Request,
  {
    trustedHeader = process.env
      .CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER,
    keyValue = process.env.CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY,
  }: {
    trustedHeader?: string;
    keyValue?: string;
  } = {},
): string {
  const header = trustedHeader?.trim().toLowerCase();
  if (!header || !isSupportedReviewAdmissionTrustedIpHeader(header)) {
    throw new Error(
      "Review admission requires a configured trusted ingress client-IP header",
    );
  }
  const address = request.headers.get(header)?.trim();
  if (!address || !isIP(address)) {
    throw new Error("Review admission client address is unavailable");
  }
  return createHmac("sha256", decodeSigningKey(keyValue))
    .update(`review-admission-network:v1:${address}`, "utf8")
    .digest("hex");
}

export async function readReviewJsonObject(
  request: Request,
  {
    maxBytes = MAX_REVIEW_MUTATION_BYTES,
  }: {
    maxBytes?: number;
  } = {},
): Promise<
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false;
      status: 400 | 413;
      code: "REVIEW_JSON_INVALID" | "REVIEW_REQUEST_TOO_LARGE";
    }
> {
  const bodyLimit = reviewBodyLimit(maxBytes);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > bodyLimit) {
        try {
          await reader.cancel();
        } catch {
          // The size decision is already final; cancellation is best effort.
        }
        return {
          ok: false,
          status: 413,
          code: "REVIEW_REQUEST_TOO_LARGE",
        };
      }
      chunks.push(value);
    }
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { ok: true, value: value as Record<string, unknown> };
    }
  } catch {
    // The shared invalid response below intentionally hides parser detail.
  }
  return {
    ok: false,
    status: 400,
    code: "REVIEW_JSON_INVALID",
  };
}
