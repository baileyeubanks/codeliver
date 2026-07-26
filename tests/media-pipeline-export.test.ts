import assert from "node:assert/strict";
import test from "node:test";

import { selectPublishedExport } from "../lib/media-pipeline/export.ts";

const versionId = "177139fe-bffd-4f2b-8ff3-8c4be1e70861";

const metadata = {
  media_pipeline: {
    schemaVersion: 1,
    currentVersionId: versionId,
    versions: {
      [versionId]: {
        schemaVersion: 1,
        status: "published",
        versionId,
        source: {
          objectKey: "sources/v1/master.mp4",
          filename: "master.mp4",
          size: 12,
          sha256: "a".repeat(64),
        },
        artifacts: {
          hls: {
            manifest: {
              objectKey: "derivatives/v1/hls-manifest.json",
              filename: "hls-manifest.json",
              contentType: "application/json",
              size: 9,
              sha256: "b".repeat(64),
            },
          },
          thumbnail: {
            objectKey: "derivatives/v1/poster.jpg",
            filename: "poster.jpg",
            contentType: "image/jpeg",
            size: 8,
            sha256: "c".repeat(64),
          },
          waveform: {
            objectKey: "derivatives/v1/waveform.png",
            filename: "waveform.png",
            contentType: "image/png",
            size: 7,
            sha256: "d".repeat(64),
          },
          captions: {
            content: {
              objectKey: "derivatives/v1/captions.vtt",
              filename: "captions.vtt",
              contentType: "text/vtt",
              size: 6,
              sha256: "e".repeat(64),
            },
          },
          pipelineManifest: {
            objectKey: "derivatives/v1/pipeline-manifest.json",
            filename: "pipeline-manifest.json",
            contentType: "application/json",
            size: 5,
            sha256: "f".repeat(64),
          },
        },
      },
    },
  },
};

test("exports resolve only the explicitly published version and supported derivative", () => {
  const selected = selectPublishedExport(metadata, versionId, "captions");
  assert.equal(selected.ok, true);
  if (!selected.ok) return;
  assert.equal(selected.artifact.objectKey, "derivatives/v1/captions.vtt");
  assert.equal(selected.artifact.contentType, "text/vtt");

  const manifest = selectPublishedExport(metadata, versionId, "pipeline_manifest");
  assert.equal(manifest.ok, true);
  if (!manifest.ok) return;
  assert.equal(manifest.artifact.objectKey, "derivatives/v1/pipeline-manifest.json");
  assert.equal(manifest.artifact.contentType, "application/json");
});

test("exports reject unpublished versions and invalid object keys", () => {
  const missing = selectPublishedExport(metadata, "8ba06f34-779b-420f-a8a3-918c479056a8", "source");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "PIPELINE_NOT_PUBLISHED");

  const tampered = structuredClone(metadata);
  tampered.media_pipeline.versions[versionId].artifacts.waveform.objectKey = "../outside.png";
  const invalid = selectPublishedExport(tampered, versionId, "waveform");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.code, "PIPELINE_ARTIFACT_UNAVAILABLE");

  const unsafeManifest = structuredClone(metadata);
  unsafeManifest.media_pipeline.versions[versionId].artifacts.pipelineManifest.objectKey =
    "../pipeline-manifest.json";
  const invalidManifest = selectPublishedExport(unsafeManifest, versionId, "pipeline_manifest");
  assert.equal(invalidManifest.ok, false);
  if (!invalidManifest.ok) assert.equal(invalidManifest.code, "PIPELINE_ARTIFACT_UNAVAILABLE");
});
