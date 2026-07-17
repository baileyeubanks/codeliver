import { constants, createReadStream } from "node:fs";
import {
  access,
  link,
  open,
  realpath,
  statfs,
  unlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import type { Readable } from "node:stream";

import type {
  CommitMultipartInput,
  MultipartAppendInput,
  MultipartCommitReconciliation,
  MultipartHandle,
  MultipartInspection,
  MultipartPartReceipt,
  MultipartReconciliation,
  StorageAdapter,
  StorageCapability,
  StorageDiagnosticCheck,
  StorageReadiness,
  StoredObjectReceipt,
} from "./contracts";
import type { StorageRuntimeConfig } from "./config";
import { syncDurableDirectory } from "./durable-files.ts";
import { StorageError, isStorageError } from "./errors.ts";
import { assertSafeObjectKey } from "./object-key.ts";
import { assertSafeRegularFile, ensureSafeDirectoryTree, resolveExistingRoot, resolvePathInsideRoot } from "./path-safety.ts";

const UPLOAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSha256(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new StorageError("STORAGE_CHECKSUM", `${label} must be a SHA-256 hex digest`);
  }
  return normalized;
}

export class FilesystemStorageAdapter implements StorageAdapter {
  readonly capabilities: StorageCapability[] = [
    "multipart-ingest",
    "atomic-placement",
    "capacity-reporting",
    "server-checksum",
    "object-versioning",
  ];
  readonly external: boolean;
  readonly label: string;
  readonly kind: "local" | "ccnas";
  private readonly config: StorageRuntimeConfig;
  private canonicalRootPromise: Promise<string> | null = null;

  constructor(
    kind: "local" | "ccnas",
    config: StorageRuntimeConfig
  ) {
    this.kind = kind;
    this.config = config;
    this.external = kind === "ccnas";
    this.label = kind === "local" ? "Local demo storage" : "CCNAS storage";
  }

  private configuredRoot(): string {
    if (!this.config.filesystemRoot) {
      throw new StorageError(
        "STORAGE_NOT_CONFIGURED",
        `${this.label} requires an explicit absolute root`
      );
    }
    return this.config.filesystemRoot;
  }

  private canonicalRoot(): Promise<string> {
    this.canonicalRootPromise ??= resolveExistingRoot(this.configuredRoot());
    return this.canonicalRootPromise;
  }

  async diagnose(): Promise<StorageReadiness> {
    const observedAt = new Date().toISOString();
    const checks: StorageDiagnosticCheck[] = this.config.issues.map((message, index) => ({
      key: `configuration-${index + 1}`,
      status: "fail" as const,
      message,
    }));
    let canonicalRoot: string | null = null;
    let readable = false;
    let writable = false;
    let capacity: StorageReadiness["capacity"] = null;

    if (!this.config.filesystemRoot) {
      checks.push({
        key: "filesystem-root",
        status: "fail",
        message: `${this.label} root is not configured`,
      });
    } else {
      try {
        canonicalRoot = await this.canonicalRoot();
        checks.push({
          key: "filesystem-root",
          status: "pass",
          message: "Configured storage root exists and is a directory",
        });
        await access(canonicalRoot, constants.R_OK);
        readable = true;
        await access(canonicalRoot, constants.W_OK);
        writable = true;
        checks.push({
          key: "filesystem-access",
          status: "pass",
          message: "Storage root is readable and writable by this process",
        });

        const stats = await statfs(canonicalRoot, { bigint: true });
        const totalBytes = stats.blocks * stats.bsize;
        const availableBytes = stats.bavail * stats.bsize;
        capacity = {
          totalBytes: totalBytes.toString(),
          availableBytes: availableBytes.toString(),
          usedBytes: (totalBytes - stats.bfree * stats.bsize).toString(),
          reservedBytes: this.config.reservedBytes.toString(),
          observedAt,
        };
        checks.push({
          key: "filesystem-capacity",
          status: availableBytes > this.config.reservedBytes ? "pass" : "fail",
          message:
            availableBytes > this.config.reservedBytes
              ? "Storage capacity is above the configured reserve"
              : "Storage capacity is at or below the configured reserve",
        });
      } catch {
        this.canonicalRootPromise = null;
        checks.push({
          key: "filesystem-access",
          status: "fail",
          message: "Configured storage root is unavailable to this process",
        });
      }
    }

    checks.push({
      key: "write-authority",
      status: this.config.writeEnabled ? "pass" : "fail",
      message: this.config.writeEnabled
        ? "Explicit storage write authority is enabled"
        : "CODELIVER_STORAGE_WRITE_ENABLED is not enabled",
    });

    const availableBytes = capacity?.availableBytes;
    const aboveReserve =
      availableBytes !== null &&
      availableBytes !== undefined &&
      BigInt(availableBytes) > this.config.reservedBytes;
    return {
      provider: this.kind,
      label: this.label,
      configured: Boolean(this.config.filesystemRoot) && this.config.issues.length === 0,
      external: this.external,
      writeEnabled: this.config.writeEnabled,
      readyForWrites:
        Boolean(canonicalRoot) &&
        readable &&
        writable &&
        aboveReserve &&
        this.config.writeEnabled &&
        this.config.issues.length === 0,
      capabilities: [...this.capabilities],
      checks,
      capacity,
      observedAt,
    };
  }

  private async requireWriteReady(): Promise<string> {
    const readiness = await this.diagnose();
    if (!readiness.readyForWrites) {
      const reasons = readiness.checks
        .filter((check) => check.status === "fail")
        .map((check) => check.message)
        .join("; ");
      throw new StorageError(
        "STORAGE_NOT_READY",
        reasons || `${this.label} is not ready for writes`,
        true
      );
    }
    return this.canonicalRoot();
  }

  private assertHandle(handle: MultipartHandle): void {
    if (
      handle.provider !== this.kind ||
      !UPLOAD_ID_PATTERN.test(handle.uploadId) ||
      handle.opaqueId !== `${handle.uploadId}.part`
    ) {
      throw new StorageError("STORAGE_PATH_INVALID", "Multipart handle is invalid");
    }
  }

  private async stagingPath(handle: MultipartHandle): Promise<string> {
    this.assertHandle(handle);
    const root = await this.canonicalRoot();
    return resolvePathInsideRoot(
      root,
      `.codeliver-ingest/staging/${handle.opaqueId}`
    );
  }

  async beginMultipart(uploadId: string): Promise<MultipartHandle> {
    if (!UPLOAD_ID_PATTERN.test(uploadId)) {
      throw new StorageError("STORAGE_PATH_INVALID", "Upload id is invalid");
    }
    const root = await this.requireWriteReady();
    await ensureSafeDirectoryTree(root, ".codeliver-ingest/staging");
    const handle: MultipartHandle = {
      provider: this.kind,
      uploadId,
      opaqueId: `${uploadId}.part`,
    };
    const file = await open(await this.stagingPath(handle), "wx", 0o600);
    await file.close();
    return handle;
  }

  async appendMultipart(input: MultipartAppendInput): Promise<MultipartPartReceipt> {
    await this.requireWriteReady();
    const path = await this.stagingPath(input.handle);
    await assertSafeRegularFile(path);
    const file = await open(path, "r+");
    let bytesWritten = 0;
    const hash = createHash("sha256");

    try {
      const status = await file.stat();
      if (status.size !== input.offset) {
        throw new StorageError(
          "STORAGE_OFFSET",
          `Offset mismatch: expected ${status.size}, got ${input.offset}`,
          true
        );
      }

      for await (const chunk of input.chunks) {
        const buffer = Buffer.from(chunk);
        if (bytesWritten + buffer.length > input.maxBytes) {
          throw new StorageError("STORAGE_CAPACITY", "Upload part exceeds the chunk limit");
        }
        if (input.offset + bytesWritten + buffer.length > input.expectedSize) {
          throw new StorageError("STORAGE_CAPACITY", "Upload would exceed its declared size");
        }

        hash.update(buffer);
        let chunkOffset = 0;
        while (chunkOffset < buffer.length) {
          const result = await file.write(
            buffer,
            chunkOffset,
            buffer.length - chunkOffset,
            input.offset + bytesWritten + chunkOffset
          );
          if (result.bytesWritten <= 0) {
            throw new StorageError("STORAGE_NOT_READY", "Storage write made no progress", true);
          }
          chunkOffset += result.bytesWritten;
        }
        bytesWritten += buffer.length;
      }

      const sha256 = hash.digest("hex");
      if (
        input.expectedPartSha256 &&
        sha256 !== normalizeSha256(input.expectedPartSha256, "Part checksum")
      ) {
        throw new StorageError("STORAGE_CHECKSUM", "Upload part checksum did not match");
      }
      await file.sync();
      return {
        offset: input.offset + bytesWritten,
        bytesWritten,
        sha256,
      };
    } catch (error) {
      await file.truncate(input.offset).catch(() => undefined);
      await file.sync().catch(() => undefined);
      if (isStorageError(error)) throw error;
      throw new StorageError(
        "STORAGE_NOT_READY",
        "Upload part write failed at the configured provider",
        true
      );
    } finally {
      await file.close();
    }
  }

  async inspectMultipart(handle: MultipartHandle): Promise<MultipartInspection> {
    const path = await this.stagingPath(handle);
    return this.inspectRegularFile(path);
  }

  private async inspectRegularFile(path: string): Promise<MultipartInspection> {
    await assertSafeRegularFile(path);
    const status = await open(path, "r");
    const hash = createHash("sha256");
    try {
      const fileStatus = await status.stat();
      for await (const chunk of status.createReadStream({ autoClose: false })) {
        hash.update(chunk);
      }
      return { size: fileStatus.size, sha256: hash.digest("hex") };
    } finally {
      await status.close();
    }
  }

  async reconcileMultipart(
    handle: MultipartHandle,
    committedOffset: number
  ): Promise<MultipartReconciliation> {
    if (!Number.isSafeInteger(committedOffset) || committedOffset < 0) {
      throw new StorageError("STORAGE_OFFSET", "Committed multipart offset is invalid");
    }
    await this.requireWriteReady();
    const path = await this.stagingPath(handle);
    await assertSafeRegularFile(path);
    const file = await open(path, "r+");
    try {
      const status = await file.stat();
      if (status.size < committedOffset) {
        throw new StorageError(
          "STORAGE_OFFSET",
          "Staged multipart bytes are behind durable session state"
        );
      }
      if (status.size === committedOffset) {
        return {
          action: "unchanged",
          committedOffset,
          observedOffset: status.size,
        };
      }
      await file.truncate(committedOffset);
      await file.sync();
      return {
        action: "rolled-back",
        committedOffset,
        observedOffset: status.size,
      };
    } finally {
      await file.close();
    }
  }

  async openMultipartReadStream(handle: MultipartHandle): Promise<Readable> {
    const path = await this.stagingPath(handle);
    await assertSafeRegularFile(path);
    return createReadStream(path);
  }

  private async storedObjectPath(objectKey: string): Promise<string> {
    const root = await this.canonicalRoot();
    const canonicalKey = assertSafeObjectKey(objectKey);
    const path = resolvePathInsideRoot(root, canonicalKey);
    const parent = dirname(path);
    const canonicalParent = await realpath(parent);
    if (canonicalParent !== parent) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "Stored object parent resolves through a symlink"
      );
    }
    return path;
  }

  async inspectStoredObject(objectKey: string): Promise<MultipartInspection | null> {
    let path: string;
    try {
      path = await this.storedObjectPath(objectKey);
      return await this.inspectRegularFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async openStoredObjectReadStream(objectKey: string): Promise<Readable> {
    const path = await this.storedObjectPath(objectKey);
    await assertSafeRegularFile(path);
    return createReadStream(path);
  }

  async reconcileMultipartCommit(
    input: CommitMultipartInput
  ): Promise<MultipartCommitReconciliation> {
    const root = await this.requireWriteReady();
    const objectKey = assertSafeObjectKey(input.objectKey);
    const expectedSha256 = normalizeSha256(input.sha256, "Object checksum");
    await ensureSafeDirectoryTree(root, dirname(objectKey));
    const destinationPath = resolvePathInsideRoot(root, objectKey);

    let destination: MultipartInspection;
    try {
      destination = await this.inspectRegularFile(destinationPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { action: "not-committed", receipt: null };
      }
      throw error;
    }
    if (destination.size !== input.size || destination.sha256 !== expectedSha256) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "Recovered object does not match its durable placement intent"
      );
    }

    const stagingPath = await this.stagingPath(input.handle);
    let action: MultipartCommitReconciliation["action"] = "committed";
    try {
      const staging = await this.inspectRegularFile(stagingPath);
      if (staging.size !== input.size || staging.sha256 !== expectedSha256) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Staging bytes diverged from the recovered committed object"
        );
      }
      await unlink(stagingPath);
      await syncDurableDirectory(dirname(stagingPath));
      action = "staging-cleaned";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const status = await open(destinationPath, "r");
    let committedAt: string;
    try {
      committedAt = (await status.stat()).mtime.toISOString();
    } finally {
      await status.close();
    }
    return {
      action,
      receipt: {
        provider: this.kind,
        objectKey,
        size: input.size,
        sha256: expectedSha256,
        providerVersionId: expectedSha256,
        committedAt,
      },
    };
  }

  async commitMultipart(input: CommitMultipartInput): Promise<StoredObjectReceipt> {
    const root = await this.requireWriteReady();
    const objectKey = assertSafeObjectKey(input.objectKey);
    const expectedSha256 = normalizeSha256(input.sha256, "Object checksum");
    const inspection = await this.inspectMultipart(input.handle);
    if (inspection.size !== input.size || inspection.sha256 !== expectedSha256) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "Multipart object changed after verification"
      );
    }

    await ensureSafeDirectoryTree(root, dirname(objectKey));
    const stagingPath = await this.stagingPath(input.handle);
    const destinationPath = resolvePathInsideRoot(root, objectKey);
    try {
      await link(stagingPath, destinationPath);
      await syncDurableDirectory(dirname(destinationPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new StorageError(
          "STORAGE_CONFLICT",
          "Versioned object key already exists; overwrite refused"
        );
      }
      throw error;
    }
    await assertSafeRegularFile(destinationPath);
    await unlink(stagingPath);
    await syncDurableDirectory(dirname(stagingPath));

    return {
      provider: this.kind,
      objectKey,
      size: input.size,
      sha256: expectedSha256,
      providerVersionId: expectedSha256,
      committedAt: new Date().toISOString(),
    };
  }

  async abortMultipart(handle: MultipartHandle): Promise<void> {
    await this.requireWriteReady();
    const path = await this.stagingPath(handle);
    try {
      await assertSafeRegularFile(path);
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
