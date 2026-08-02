import { extname } from "node:path";

import { NextResponse } from "next/server";

import {
  getAuthorizedReviewInvite,
  reviewInviteErrorPayload,
} from "@/lib/review-invites";
import { hasValidReviewViewGrant } from "@/lib/security/review-view-grant";
import { usesAtomicShareLinkViewClaims } from "@/lib/sharing/share-claims";
import { assertSafeWebhookUrl } from "@/lib/security/webhook-delivery";
import { streamTrustedMediaPath } from "@/lib/storage/media-response";
import { sanitizeMediaFilename } from "@/lib/storage/safe-media-path";
import { resolveAssetVersion } from "@/lib/versions";

const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;
const LOCAL_STREAM_PATH = "/api/media/stream";

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie, Range");
  return response;
}

function localMediaPath(reference: string) {
  if (!reference.startsWith("/") || reference.startsWith("//")) return null;
  const url = new URL(reference, "https://co-videopro.invalid");
  if (url.pathname !== LOCAL_STREAM_PATH) return null;
  return url.searchParams.get("path");
}

function downloadFilename(title: string, reference: string) {
  let extension = "";
  try {
    const path = reference.startsWith("/")
      ? new URL(reference, "https://co-videopro.invalid").searchParams.get("path") ?? reference
      : new URL(reference).pathname;
    extension = extname(path).slice(0, 16);
  } catch {
    extension = "";
  }

  const normalizedTitle = title.trim() || "review-media";
  const name =
    extension && !normalizedTitle.toLowerCase().endsWith(extension.toLowerCase())
      ? `${normalizedTitle}${extension}`
      : normalizedTitle;
  return sanitizeMediaFilename(name);
}

async function proxyExternalMedia({
  request,
  reference,
  download,
  filename,
}: {
  request: Request;
  reference: string;
  download: boolean;
  filename: string;
}) {
  let safeUrl: string;
  try {
    safeUrl = await assertSafeWebhookUrl(reference);
  } catch {
    return noStore({ error: "Review media is unavailable" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_CONNECT_TIMEOUT_MS);
  let upstream: Response;
  try {
    const range = request.headers.get("range");
    upstream = await fetch(safeUrl, {
      method: "GET",
      headers: range ? { Range: range } : undefined,
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    return noStore({ error: "Review media is unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (upstream.status === 416) {
    return new Response(null, {
      status: 416,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Range": upstream.headers.get("content-range") ?? "bytes */*",
        Vary: "Cookie, Range",
      },
    });
  }
  if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
    return noStore({ error: "Review media is unavailable" }, { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie, Range",
  });
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const inviteLookup = await getAuthorizedReviewInvite(request, token);
  if (!inviteLookup.ok) {
    return noStore(
      reviewInviteErrorPayload(inviteLookup),
      { status: inviteLookup.status },
    );
  }

  const { invite } = inviteLookup;
  if (
    usesAtomicShareLinkViewClaims() &&
    typeof invite.max_views === "number"
  ) {
    let hasViewGrant = false;
    try {
      hasViewGrant = hasValidReviewViewGrant(request, {
        token,
        inviteId: invite.id,
      });
    } catch {
      return noStore(
        { error: "Review access is temporarily unavailable" },
        { status: 503 },
      );
    }
    if (!hasViewGrant) {
      return noStore(
        { error: "Open the review link before using this resource" },
        { status: 401 },
      );
    }
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  if (download && invite.download_enabled !== true) {
    return noStore({ error: "Downloads are not enabled for this review link" }, { status: 403 });
  }
  if (invite.watermark_enabled === true) {
    return noStore(
      {
        error: "Watermarked review media is not ready",
        watermark_required: true,
        delivery_ready: false,
      },
      { status: 503 },
    );
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });
  if (!versionLookup.ok || !versionLookup.version.file_url) {
    return noStore({ error: "Review media is unavailable" }, { status: 404 });
  }

  const reference = versionLookup.version.file_url;
  const filename = downloadFilename(invite.assets?.title ?? "review-media", reference);
  const requestedPath = localMediaPath(reference);
  if (requestedPath) {
    return streamTrustedMediaPath({
      request,
      requestedPath,
      download,
      downloadName: filename,
    });
  }
  if (reference.startsWith("/")) {
    return noStore({ error: "Review media is unavailable" }, { status: 503 });
  }

  return proxyExternalMedia({ request, reference, download, filename });
}
