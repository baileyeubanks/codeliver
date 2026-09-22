import type { StorageAdapter } from "@/lib/storage/contracts";
import { nodeReadableToWebStream } from "@/lib/media/node-readable-web-stream";
import {
  HlsDeliveryError,
  readAndRewritePublishedHlsPlaylist,
  type PublishedHlsPublication,
} from "@/lib/media-pipeline/hls-delivery";

function baseHeaders(vary: string): Record<string, string> {
  return {
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    Vary: vary,
    "X-Content-Type-Options": "nosniff",
  };
}

export function parseHlsSegmentIndex(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : null;
}

export async function publishedHlsPlaylistResponse({
  publication,
  adapter,
  vary,
}: {
  publication: PublishedHlsPublication;
  adapter: StorageAdapter;
  vary: string;
}): Promise<Response> {
  const playlist = await readAndRewritePublishedHlsPlaylist({
    publication,
    adapter,
    segmentRoutePrefix: "segments",
  });
  return new Response(playlist, {
    headers: {
      ...baseHeaders(vary),
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
    },
  });
}

export async function publishedHlsSegmentResponse({
  publication,
  adapter,
  index,
  vary,
}: {
  publication: PublishedHlsPublication;
  adapter: StorageAdapter;
  index: number;
  vary: string;
}): Promise<Response> {
  const segment = publication.segments[index];
  if (!segment) throw new HlsDeliveryError("HLS_PUBLICATION_INVALID");
  if (adapter.kind !== segment.provider) {
    throw new HlsDeliveryError("HLS_RECEIPT_DRIFT");
  }
  let stream;
  try {
    stream = await adapter.openStoredObjectReadStream(
      segment.objectKey,
      undefined,
      {
        size: segment.size,
        providerVersionId: segment.providerVersionId,
      },
    );
  } catch {
    throw new HlsDeliveryError("HLS_RECEIPT_DRIFT");
  }
  return new Response(nodeReadableToWebStream(stream), {
    headers: {
      ...baseHeaders(vary),
      "Content-Type": "video/mp2t",
      "Content-Length": String(segment.size),
    },
  });
}
