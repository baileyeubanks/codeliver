/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { assertSafeObjectKey } from "../storage/object-key.ts";

export type PipelineExportArtifact =
  | "source"
  | "hls_manifest"
  | "pipeline_manifest"
  | "thumbnail"
  | "waveform"
  | "captions";

export interface PublishedExportArtifact {
  artifact: PipelineExportArtifact;
  objectKey: string;
  filename: string;
  contentType: string;
  size: number | null;
  sha256: string | null;
}

export type PublishedExportSelection =
  | { ok: true; publication: Record<string, unknown>; artifact: PublishedExportArtifact }
  | { ok: false; code: string; message: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function contentType(filename: string): string {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json",
    ".m3u8": "application/vnd.apple.mpegurl",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".png": "image/png",
    ".vtt": "text/vtt",
  };
  return types[extension] ?? "application/octet-stream";
}

function normalizeArtifact(
  artifact: PipelineExportArtifact,
  value: unknown,
  fallbackFilename: string
): PublishedExportArtifact | null {
  const candidate = record(value);
  if (!candidate) return null;
  const objectKey = stringValue(candidate.objectKey);
  if (!objectKey) return null;
  try {
    assertSafeObjectKey(objectKey);
  } catch {
    return null;
  }
  const filename = stringValue(candidate.filename) ?? fallbackFilename;
  return {
    artifact,
    objectKey,
    filename,
    contentType: stringValue(candidate.contentType) ?? contentType(filename),
    size: numberValue(candidate.size),
    sha256: stringValue(candidate.sha256),
  };
}

export function selectPublishedExport(
  metadata: unknown,
  versionId: string,
  artifact: PipelineExportArtifact
): PublishedExportSelection {
  const root = record(metadata);
  const pipeline = record(root?.media_pipeline);
  const versions = record(pipeline?.versions);
  const publication = record(versions?.[versionId]);
  if (!publication || publication.status !== "published" || publication.versionId !== versionId) {
    return {
      ok: false,
      code: "PIPELINE_NOT_PUBLISHED",
      message: "The requested version has no published media pipeline artifact.",
    };
  }

  const artifacts = record(publication.artifacts);
  const hls = record(artifacts?.hls);
  const captions = record(artifacts?.captions);
  const selected =
    artifact === "source"
      ? normalizeArtifact("source", publication.source, "source")
      : artifact === "hls_manifest"
        ? normalizeArtifact("hls_manifest", hls?.manifest, "hls-manifest.json")
        : artifact === "pipeline_manifest"
          ? normalizeArtifact("pipeline_manifest", artifacts?.pipelineManifest, "pipeline-manifest.json")
          : artifact === "thumbnail"
            ? normalizeArtifact("thumbnail", artifacts?.thumbnail, "poster.jpg")
            : artifact === "waveform"
              ? normalizeArtifact("waveform", artifacts?.waveform, "waveform.png")
              : normalizeArtifact("captions", captions?.content, "captions.vtt");
  if (!selected) {
    return {
      ok: false,
      code: "PIPELINE_ARTIFACT_UNAVAILABLE",
      message: "The requested published artifact is unavailable.",
    };
  }

  return { ok: true, publication, artifact: selected };
}
