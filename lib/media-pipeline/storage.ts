/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

import type {
  CommitMultipartInput,
  StorageAdapter,
  StoredObjectReceipt,
} from "../storage/contracts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { buildVersionedObjectKey } from "../storage/object-key.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { assertSafeRegularFile } from "../storage/path-safety.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { MediaPipelineError } from "./errors.ts";
import type {
  MediaPipelineJob,
  StoredMediaArtifact,
} from "./types.ts";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".png": "image/png",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
};

export interface FileChecksum {
  size: number;
  sha256: string;
}

export interface PipelineStoredFile {
  artifact: StoredMediaArtifact;
  receipt: StoredObjectReceipt;
}

export interface VersionedMediaArtifactUploadInput {
  tenantScope: string;
  projectId: string;
  versionId: string;
  jobId: string;
  versionNumber: number;
  path: string;
  kind: StoredMediaArtifact["kind"];
  filename?: string;
  generation: number;
  suffix: string;
}

function contentType(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function safeSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MediaPipelineError("PIPELINE_SOURCE_TOO_LARGE", "Pipeline file size is unsafe");
  }
  return value;
}

export async function checksumFile(path: string): Promise<FileChecksum> {
  await assertSafeRegularFile(path);
  const status = await stat(path);
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.from(chunk);
    hash.update(buffer);
    size += buffer.length;
  }
  if (size !== status.size) {
    throw new MediaPipelineError(
      "PIPELINE_SOURCE_CHANGED",
      "Media source changed while its checksum was being calculated",
      true
    );
  }
  return { size: safeSize(size), sha256: hash.digest("hex") };
}

async function commitDerivative(
  adapter: StorageAdapter,
  input: CommitMultipartInput
): Promise<StoredObjectReceipt> {
  const existing = await adapter.reconcileMultipartCommit(input);
  if (existing.receipt) return existing.receipt;

  try {
    return await adapter.commitMultipart(input);
  } catch (error) {
    const recovered = await adapter.reconcileMultipartCommit(input);
    if (recovered.receipt) return recovered.receipt;
    throw error;
  }
}

export async function uploadDerivative(
  adapter: StorageAdapter,
  job: MediaPipelineJob,
  input: {
    path: string;
    kind: StoredMediaArtifact["kind"];
    filename?: string;
    generation: number;
    suffix: string;
  }
): Promise<PipelineStoredFile> {
  return uploadVersionedMediaArtifact(adapter, {
    tenantScope: job.tenantScope,
    projectId: job.projectId,
    versionId: job.versionId,
    jobId: job.id,
    versionNumber: job.source.versionNumber,
    ...input,
  });
}

export async function uploadVersionedMediaArtifact(
  adapter: StorageAdapter,
  input: VersionedMediaArtifactUploadInput
): Promise<PipelineStoredFile> {
  const checksum = await checksumFile(input.path);
  const filename = input.filename ?? basename(input.path);
  const objectKey = buildVersionedObjectKey({
    tenantId: input.tenantScope,
    projectId: input.projectId,
    objectId: [input.versionId, input.jobId, input.kind, input.generation, input.suffix].join(":"),
    version: input.versionNumber,
    filename,
  });
  const handle = await adapter.beginMultipart(randomUUID());
  try {
    // A provider may retain a staging object after an interrupted worker. Start
    // every derivative upload from the durable offset the pipeline owns.
    await adapter.reconcileMultipart(handle, 0);
    const part = await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: createReadStream(input.path) as AsyncIterable<Uint8Array>,
      maxBytes: checksum.size,
      expectedSize: checksum.size,
      expectedPartSha256: checksum.sha256,
    });
    if (part.bytesWritten !== checksum.size || part.offset !== checksum.size) {
      throw new MediaPipelineError("PIPELINE_PUBLISH_FAILED", "Derivative upload did not reach its expected size", true);
    }
    const inspected = await adapter.inspectMultipart(handle);
    if (inspected.size !== checksum.size || inspected.sha256 !== checksum.sha256) {
      throw new MediaPipelineError(
        "PIPELINE_PUBLISH_FAILED",
        "Derivative checksum verification failed before publication",
        true
      );
    }
    const commitInput = {
      handle,
      objectKey,
      size: inspected.size,
      sha256: inspected.sha256,
    };
    // Object keys are deterministic for a job generation. Reconcile before and
    // after commit so an acknowledged placement is not retried as an overwrite
    // conflict when the worker loses the provider response.
    const receipt = await commitDerivative(adapter, commitInput);
    return {
      receipt,
      artifact: {
        kind: input.kind,
        objectKey: receipt.objectKey,
        filename,
        contentType: contentType(filename),
        size: receipt.size,
        sha256: receipt.sha256,
        provider: receipt.provider,
        providerVersionId: receipt.providerVersionId,
      },
    };
  } catch (error) {
    await adapter.abortMultipart(handle).catch(() => undefined);
    throw error;
  }
}

export async function collectSafeFiles(directory: string): Promise<string[]> {
  const root = await lstat(directory);
  if (root.isSymbolicLink() || !root.isDirectory()) {
    throw new MediaPipelineError("PIPELINE_SOURCE_INVALID", "Derivative directory is unsafe");
  }
  const files: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new MediaPipelineError("PIPELINE_SOURCE_INVALID", "Derivative tree contains a symlink");
      }
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (entry.isFile()) {
        await assertSafeRegularFile(path);
        files.push(path);
      }
    }
  }

  await visit(directory);
  return files.sort();
}

export async function writePipelineJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
}

export function relativeArtifactName(directory: string, path: string): string {
  const name = relative(directory, path).replace(/\\/g, "/");
  if (!name || name.startsWith("../") || name.includes("/../")) {
    throw new MediaPipelineError("PIPELINE_SOURCE_INVALID", "Derivative path escapes its workspace");
  }
  return name;
}
