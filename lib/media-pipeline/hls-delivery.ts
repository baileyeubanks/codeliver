import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

import type { StorageAdapter } from "../storage/contracts";

export const MAX_HLS_PLAYLIST_BYTES = 128 * 1024;
const MAX_HLS_SEGMENTS = 4_096;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const STORAGE_PROVIDERS = new Set([
  "local",
  "ccnas",
  "google-drive",
  "object-store",
]);

export interface PublishedHlsArtifactReceipt {
  kind: "hls_playlist" | "hls_segment" | "hls_manifest";
  objectKey: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  provider: string;
  providerVersionId: string;
}

export interface PublishedHlsPublication {
  assetId: string;
  versionId: string;
  playlist: PublishedHlsArtifactReceipt;
  segments: PublishedHlsArtifactReceipt[];
  manifest: PublishedHlsArtifactReceipt;
}

interface PublishedHlsSelectionInput {
  assetId: string;
  assetMetadata: unknown;
  versionId: string;
  versionAssetId: string;
}

interface HlsStorageReader {
  kind: StorageAdapter["kind"] | string;
  openStoredObjectReadStream: StorageAdapter["openStoredObjectReadStream"];
}

export class HlsDeliveryError extends Error {
  readonly code: "HLS_PUBLICATION_INVALID" | "HLS_PLAYLIST_INVALID" | "HLS_RECEIPT_DRIFT";

  constructor(code: HlsDeliveryError["code"]) {
    super("Published HLS media is unavailable");
    this.name = "HlsDeliveryError";
    this.code = code;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeObjectKey(value: string): boolean {
  if (
    !value ||
    value.length > 2_048 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== "..");
}

function safeArtifactFilename(
  value: string,
  kind: PublishedHlsArtifactReceipt["kind"],
): boolean {
  if (
    !value ||
    value.length > 256 ||
    CONTROL_CHARACTERS.test(value) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    return false;
  }
  if (kind === "hls_playlist") return value.endsWith(".m3u8");
  if (kind === "hls_manifest") return value.endsWith(".json");
  return value.endsWith(".ts");
}

function normalizeArtifact(
  value: unknown,
  kind: PublishedHlsArtifactReceipt["kind"],
): PublishedHlsArtifactReceipt | null {
  const artifact = record(value);
  if (!artifact || artifact.kind !== kind) return null;
  const objectKey = artifact.objectKey;
  const filename = artifact.filename;
  const contentType = artifact.contentType;
  const size = artifact.size;
  const sha256 = artifact.sha256;
  const provider = artifact.provider;
  const providerVersionId = artifact.providerVersionId;
  const expectedContentType =
    kind === "hls_playlist"
      ? "application/vnd.apple.mpegurl"
      : kind === "hls_segment"
        ? "video/mp2t"
        : "application/json";
  if (
    typeof objectKey !== "string" ||
    !safeObjectKey(objectKey) ||
    typeof filename !== "string" ||
    !safeArtifactFilename(filename, kind) ||
    typeof contentType !== "string" ||
    contentType !== expectedContentType ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    (kind === "hls_playlist" && size > MAX_HLS_PLAYLIST_BYTES) ||
    typeof sha256 !== "string" ||
    !SHA256_PATTERN.test(sha256) ||
    typeof provider !== "string" ||
    !STORAGE_PROVIDERS.has(provider) ||
    typeof providerVersionId !== "string" ||
    !providerVersionId ||
    providerVersionId.length > 1_024 ||
    CONTROL_CHARACTERS.test(providerVersionId)
  ) {
    return null;
  }
  return {
    kind,
    objectKey,
    filename,
    contentType,
    size,
    sha256,
    provider,
    providerVersionId,
  };
}

export function selectPublishedHlsPublication({
  assetId,
  assetMetadata,
  versionId,
  versionAssetId,
}: PublishedHlsSelectionInput): PublishedHlsPublication | null {
  if (
    !UUID_PATTERN.test(assetId) ||
    !UUID_PATTERN.test(versionId) ||
    versionAssetId !== assetId
  ) {
    return null;
  }
  const metadata = record(assetMetadata);
  const pipeline = record(metadata?.media_pipeline);
  const versions = record(pipeline?.versions);
  const publication = record(versions?.[versionId]);
  if (
    pipeline?.schemaVersion !== 1 ||
    !publication ||
    publication.schemaVersion !== 1 ||
    publication.pipelineVersion !== "co-deliver-media-pipeline/v1" ||
    publication.status !== "published" ||
    publication.versionId !== versionId
  ) {
    return null;
  }

  const artifacts = record(publication.artifacts);
  const hls = record(artifacts?.hls);
  const playlist = normalizeArtifact(hls?.playlist, "hls_playlist");
  const manifest = normalizeArtifact(hls?.manifest, "hls_manifest");
  if (!playlist || !manifest || !Array.isArray(hls?.segments)) return null;
  if (hls.segments.length < 1 || hls.segments.length > MAX_HLS_SEGMENTS) {
    return null;
  }
  const segments: PublishedHlsArtifactReceipt[] = [];
  for (const value of hls.segments) {
    const segment = normalizeArtifact(value, "hls_segment");
    if (!segment) return null;
    segments.push(segment);
  }
  const all = [playlist, manifest, ...segments];
  if (
    all.some((artifact) => artifact.provider !== playlist.provider) ||
    new Set(all.map((artifact) => artifact.objectKey)).size !== all.length ||
    new Set(segments.map((segment) => segment.filename)).size !== segments.length
  ) {
    return null;
  }
  return { assetId, versionId, playlist, segments, manifest };
}

function normalizeSegmentRoutePrefix(value: string): string {
  if (
    !value ||
    value.length > 1_024 ||
    value.startsWith("//") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    CONTROL_CHARACTERS.test(value) ||
    !/^\/?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value)
  ) {
    throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
  }
  return value;
}

async function readExactPlaylist(
  publication: PublishedHlsPublication,
  adapter: HlsStorageReader,
): Promise<string> {
  const receipt = publication.playlist;
  if (adapter.kind !== receipt.provider) {
    throw new HlsDeliveryError("HLS_RECEIPT_DRIFT");
  }

  let stream: Readable | null = null;
  try {
    stream = await adapter.openStoredObjectReadStream(
      receipt.objectKey,
      undefined,
      { size: receipt.size, providerVersionId: receipt.providerVersionId },
    );
    const chunks: Buffer[] = [];
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of stream) {
      const buffer =
        typeof chunk === "string"
          ? Buffer.from(chunk)
          : Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk as Uint8Array);
      size += buffer.length;
      if (size > receipt.size || size > MAX_HLS_PLAYLIST_BYTES) {
        throw new HlsDeliveryError("HLS_RECEIPT_DRIFT");
      }
      chunks.push(buffer);
      hash.update(buffer);
    }
    if (size !== receipt.size || hash.digest("hex") !== receipt.sha256) {
      throw new HlsDeliveryError("HLS_RECEIPT_DRIFT");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof HlsDeliveryError) throw error;
    throw new HlsDeliveryError("HLS_RECEIPT_DRIFT");
  } finally {
    if (stream && !stream.destroyed) stream.destroy();
  }
}

function isSafeAllowedTag(line: string): boolean {
  return (
    /^#EXT-X-VERSION:[0-9]+$/.test(line) ||
    /^#EXT-X-TARGETDURATION:[0-9]+$/.test(line) ||
    /^#EXT-X-MEDIA-SEQUENCE:[0-9]+$/.test(line) ||
    /^#EXT-X-DISCONTINUITY-SEQUENCE:[0-9]+$/.test(line) ||
    line === "#EXT-X-INDEPENDENT-SEGMENTS" ||
    line === "#EXT-X-DISCONTINUITY"
  );
}

function rewritePlaylist(
  playlist: string,
  publication: PublishedHlsPublication,
  segmentRoutePrefix: string,
): string {
  if (playlist.includes("\r") && !playlist.includes("\r\n")) {
    throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
  }
  const lines = playlist.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "#EXTM3U") {
    throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
  }
  const filenameToOrdinal = new Map(
    publication.segments.map((segment, ordinal) => [segment.filename, ordinal]),
  );
  const seen = new Set<string>();
  const output = ["#EXTM3U"];
  let pendingSegment = false;
  let vodTags = 0;
  let endTags = 0;
  let targetDurationTags = 0;
  let ended = false;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (
      line !== line.trim() ||
      CONTROL_CHARACTERS.test(line) ||
      /[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(line) ||
      /(^|["'=,])\/\//.test(line)
    ) {
      throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
    }
    if (ended) throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");

    if (line.startsWith("#")) {
      if (/\bURI\s*=/i.test(line) || pendingSegment) {
        throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
      }
      if (line === "#EXT-X-PLAYLIST-TYPE:VOD") {
        vodTags += 1;
      } else if (line === "#EXT-X-ENDLIST") {
        endTags += 1;
        ended = true;
      } else if (/^#EXTINF:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?,$/.test(line)) {
        pendingSegment = true;
      } else if (/^#EXT-X-TARGETDURATION:[0-9]+$/.test(line)) {
        targetDurationTags += 1;
      } else if (!isSafeAllowedTag(line)) {
        throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
      }
      output.push(line);
      continue;
    }

    if (
      !pendingSegment ||
      line.includes("/") ||
      line.includes("\\") ||
      line.includes("?") ||
      line.includes("#") ||
      line.includes(":") ||
      line === "." ||
      line === ".." ||
      seen.has(line)
    ) {
      throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
    }
    const ordinal = filenameToOrdinal.get(line);
    if (ordinal === undefined) {
      throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
    }
    seen.add(line);
    pendingSegment = false;
    output.push(`${segmentRoutePrefix}/${ordinal}`);
  }

  if (
    pendingSegment ||
    vodTags !== 1 ||
    endTags !== 1 ||
    targetDurationTags !== 1 ||
    seen.size !== publication.segments.length
  ) {
    throw new HlsDeliveryError("HLS_PLAYLIST_INVALID");
  }
  return `${output.join("\n")}\n`;
}

export async function readAndRewritePublishedHlsPlaylist({
  publication,
  adapter,
  segmentRoutePrefix,
}: {
  publication: PublishedHlsPublication;
  adapter: HlsStorageReader;
  segmentRoutePrefix: string;
}): Promise<string> {
  const safePrefix = normalizeSegmentRoutePrefix(segmentRoutePrefix);
  const playlist = await readExactPlaylist(publication, adapter);
  return rewritePlaylist(playlist, publication, safePrefix);
}
