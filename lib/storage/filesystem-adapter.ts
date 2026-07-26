import { constants } from "node:fs";
import type { BigIntStats } from "node:fs";
import {
  access,
  link,
  open,
  realpath,
  statfs,
  unlink,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
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
  StoredObjectReadExpectation,
  StoredObjectReadRange,
  StoredObjectReceipt,
} from "./contracts";
import type { StorageRuntimeConfig } from "./config";
import { syncDurableDirectory } from "./durable-files.ts";
import { StorageError, isStorageError } from "./errors.ts";
import { assertSafeObjectKey } from "./object-key.ts";
import { assertSafeRegularFile, ensureSafeDirectoryTree, resolveExistingRoot, resolvePathInsideRoot } from "./path-safety.ts";

const UPLOAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMITTED_FILE_MODE = 0o400;
const FILE_HASH_BUFFER_BYTES = 1024 * 1024;

function normalizeSha256(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new StorageError("STORAGE_CHECKSUM", `${label} must be a SHA-256 hex digest`);
  }
  return normalized;
}

function filesystemProviderVersionId(status: {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}): string {
  const identity = [
    status.dev,
    status.ino,
    status.size,
    status.mtimeNs,
    status.ctimeNs,
  ].join(":");
  return `fs-v1:${createHash("sha256").update(identity).digest("hex")}`;
}

function hasWriteBits(status: BigIntStats): boolean {
  return (status.mode & BigInt(0o222)) !== 0n;
}

function isFilesystemCapacityError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOSPC" || code === "EDQUOT";
}

function hasStableFileIdentity(before: BigIntStats, after: BigIntStats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mode === after.mode &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs &&
    before.nlink === after.nlink
  );
}

function hasPostUnlinkFileIdentity(
  before: BigIntStats,
  after: BigIntStats
): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mode === after.mode &&
    before.mtimeNs === after.mtimeNs &&
    before.nlink === 2n &&
    after.nlink === 1n
  );
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

  private async requirePlacementCapacity(
    root: string,
    size: number
  ): Promise<void> {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "Immutable placement size is invalid"
      );
    }
    let availableBytes: bigint;
    try {
      const stats = await statfs(root, { bigint: true });
      availableBytes = stats.bavail * stats.bsize;
    } catch {
      throw new StorageError(
        "STORAGE_NOT_READY",
        "Storage capacity could not be verified before immutable placement",
        true
      );
    }
    const requiredBytes = this.config.reservedBytes + BigInt(size);
    if (availableBytes < requiredBytes) {
      throw new StorageError(
        "STORAGE_CAPACITY",
        "Storage cannot retain its reserve while creating the immutable placement",
        true
      );
    }
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
    const file = await open(
      path,
      constants.O_RDWR | constants.O_NOFOLLOW
    );
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

  private async hashStableFileHandle(
    file: FileHandle,
    options: { requireImmutable: boolean }
  ): Promise<MultipartInspection & { status: BigIntStats }> {
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "Storage object is not a regular file"
      );
    }
    if (options.requireImmutable && hasWriteBits(before)) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "Stored object identity is writable and not immutable"
      );
    }
    const size = Number(before.size);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "Storage object size is invalid"
      );
    }

    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(FILE_HASH_BUFFER_BYTES);
    let position = 0;
    while (position < size) {
      const length = Math.min(buffer.length, size - position);
      const { bytesRead } = await file.read(buffer, 0, length, position);
      if (bytesRead <= 0) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Storage object changed during checksum verification"
        );
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }

    const after = await file.stat({ bigint: true });
    if (
      !hasStableFileIdentity(before, after) ||
      (options.requireImmutable && hasWriteBits(after))
    ) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "Storage object identity changed during checksum verification"
      );
    }
    return { size, sha256: hash.digest("hex"), status: after };
  }

  private async copyExactFileBytes(
    source: FileHandle,
    destination: FileHandle,
    size: number
  ): Promise<void> {
    const buffer = Buffer.allocUnsafe(FILE_HASH_BUFFER_BYTES);
    let position = 0;
    while (position < size) {
      const length = Math.min(buffer.length, size - position);
      const { bytesRead } = await source.read(
        buffer,
        0,
        length,
        position
      );
      if (bytesRead <= 0) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Multipart object changed while creating its immutable placement"
        );
      }
      let bytesWritten = 0;
      while (bytesWritten < bytesRead) {
        const result = await destination.write(
          buffer,
          bytesWritten,
          bytesRead - bytesWritten,
          position + bytesWritten
        );
        if (result.bytesWritten <= 0) {
          throw new StorageError(
            "STORAGE_NOT_READY",
            "Immutable placement write made no progress",
            true
          );
        }
        bytesWritten += result.bytesWritten;
      }
      position += bytesRead;
    }
    await destination.truncate(size);
    await destination.sync();
  }

  private async sealCommittedFileHandle(file: FileHandle): Promise<BigIntStats> {
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "Stored object is not a regular file"
      );
    }
    if (hasWriteBits(before)) {
      await file.chmod(COMMITTED_FILE_MODE);
      await file.sync();
    }
    const sealed = hasWriteBits(before)
      ? await file.stat({ bigint: true })
      : before;
    if (!sealed.isFile() || hasWriteBits(sealed)) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "Stored object could not be sealed read-only"
      );
    }
    return sealed;
  }

  private async validateCommittedFileHandle(
    file: FileHandle,
    input: {
      size: number;
      sha256: string;
    }
  ): Promise<BigIntStats> {
    const inspection = await this.hashStableFileHandle(file, {
      requireImmutable: true,
    });
    if (
      inspection.size !== input.size ||
      inspection.sha256 !== input.sha256
    ) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "Committed object does not match its durable placement intent"
      );
    }
    return inspection.status;
  }

  private committedReceipt(
    status: BigIntStats,
    input: {
      objectKey: string;
      size: number;
      sha256: string;
    }
  ): StoredObjectReceipt {
    return {
      provider: this.kind,
      objectKey: input.objectKey,
      size: input.size,
      sha256: input.sha256,
      providerVersionId: filesystemProviderVersionId(status),
      committedAt: new Date(Number(status.mtimeMs)).toISOString(),
    };
  }

  private async inspectRegularFile(path: string): Promise<MultipartInspection> {
    await assertSafeRegularFile(path);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const { size, sha256 } = await this.hashStableFileHandle(file, {
        requireImmutable: false,
      });
      return { size, sha256 };
    } finally {
      await file.close();
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
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const status = await file.stat({ bigint: true });
      if (!status.isFile()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "Multipart object is not a regular file"
        );
      }
      const observedOffset = Number(status.size);
      if (!Number.isSafeInteger(observedOffset) || observedOffset < 0) {
        throw new StorageError(
          "STORAGE_OFFSET",
          "Staged multipart size is outside the supported range"
        );
      }
      if (observedOffset < committedOffset) {
        throw new StorageError(
          "STORAGE_OFFSET",
          "Staged multipart bytes are behind durable session state"
        );
      }
      if (observedOffset === committedOffset) {
        return {
          action: "unchanged",
          committedOffset,
          observedOffset,
        };
      }

      const writable = await open(
        path,
        constants.O_RDWR | constants.O_NOFOLLOW
      );
      try {
        const writableStatus = await writable.stat({ bigint: true });
        if (
          !writableStatus.isFile() ||
          !hasStableFileIdentity(status, writableStatus)
        ) {
          throw new StorageError(
            "STORAGE_CHECKSUM",
            "Multipart object identity changed during reconciliation"
          );
        }
        await writable.truncate(committedOffset);
        await writable.sync();
        return {
          action: "rolled-back",
          committedOffset,
          observedOffset,
        };
      } finally {
        await writable.close();
      }
    } finally {
      await file.close();
    }
  }

  async openMultipartReadStream(handle: MultipartHandle): Promise<Readable> {
    const path = await this.stagingPath(handle);
    await assertSafeRegularFile(path);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const status = await file.stat({ bigint: true });
      if (!status.isFile()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "Multipart object is not a regular file"
        );
      }
      return file.createReadStream({ autoClose: true, start: 0 });
    } catch (error) {
      await file.close().catch(() => undefined);
      throw error;
    }
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

  private commitPlacementPath(
    root: string,
    objectKey: string,
    handle: MultipartHandle
  ): string {
    this.assertHandle(handle);
    const objectParent = dirname(objectKey);
    const placementName =
      `.codeliver-commit-${handle.uploadId}.tmp`;
    const placementKey =
      objectParent === "."
        ? placementName
        : `${objectParent}/${placementName}`;
    return resolvePathInsideRoot(root, placementKey);
  }

  private async removeCommitPlacement(path: string): Promise<BigIntStats | null> {
    let placement: FileHandle;
    try {
      placement = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    try {
      const before = await placement.stat({ bigint: true });
      if (!before.isFile()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "Commit placement is not a regular file"
        );
      }
      await unlink(path);
      await syncDurableDirectory(dirname(path));
      const after = await placement.stat({ bigint: true });
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.nlink !== after.nlink + 1n
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Commit placement identity changed during recovery"
        );
      }
      return before;
    } finally {
      await placement.close();
    }
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

  async openStoredObjectReadStream(
    objectKey: string,
    range?: StoredObjectReadRange,
    expectation?: StoredObjectReadExpectation
  ): Promise<Readable> {
    if (
      range &&
      (
        !Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.end) ||
        range.start < 0 ||
        range.end < range.start
      )
    ) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "Stored object byte range is invalid"
      );
    }
    const path = await this.storedObjectPath(objectKey);
    await assertSafeRegularFile(path);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const status = await file.stat({ bigint: true });
      if (!status.isFile()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "Stored object is not a regular file"
        );
      }
      if (hasWriteBits(status)) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Stored object identity is writable and not immutable"
        );
      }
      const size = Number(status.size);
      if (!Number.isSafeInteger(size) || size <= 0) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "Stored object size is invalid"
        );
      }
      if (range && (range.start >= size || range.end >= size)) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "Stored object byte range exceeds the object"
        );
      }
      if (
        expectation &&
        (
          expectation.size !== size ||
          expectation.providerVersionId !== filesystemProviderVersionId(status)
        )
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Stored object identity does not match its committed receipt"
        );
      }
      return file.createReadStream({
        autoClose: true,
        ...(range ? { start: range.start, end: range.end } : {}),
      });
    } catch (error) {
      await file.close().catch(() => undefined);
      throw error;
    }
  }

  async reconcileMultipartCommit(
    input: CommitMultipartInput
  ): Promise<MultipartCommitReconciliation> {
    const root = await this.requireWriteReady();
    const objectKey = assertSafeObjectKey(input.objectKey);
    const expectedSha256 = normalizeSha256(input.sha256, "Object checksum");
    await ensureSafeDirectoryTree(root, dirname(objectKey));
    const destinationPath = resolvePathInsideRoot(root, objectKey);
    const stagingPath = await this.stagingPath(input.handle);
    const placementPath = this.commitPlacementPath(
      root,
      objectKey,
      input.handle
    );

    let destination: FileHandle;
    try {
      destination = await open(
        destinationPath,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.removeCommitPlacement(placementPath);
        return { action: "not-committed", receipt: null };
      }
      throw error;
    }

    try {
      let verifiedStatus = await this.validateCommittedFileHandle(
        destination,
        {
          size: input.size,
          sha256: expectedSha256,
        }
      );
      let action: MultipartCommitReconciliation["action"] = "committed";
      const removedPlacement =
        await this.removeCommitPlacement(placementPath);
      if (removedPlacement) {
        verifiedStatus = await this.validateCommittedFileHandle(
          destination,
          {
            size: input.size,
            sha256: expectedSha256,
          }
        );
        action = "staging-cleaned";
      }
      try {
        const staging = await open(
          stagingPath,
          constants.O_RDONLY | constants.O_NOFOLLOW
        );
        try {
          const stagingStatus = await staging.stat({ bigint: true });
          if (!stagingStatus.isFile()) {
            throw new StorageError(
              "STORAGE_PATH_INVALID",
              "Staging object is not a regular file"
            );
          }
          if (
            stagingStatus.dev === verifiedStatus.dev &&
            stagingStatus.ino === verifiedStatus.ino
          ) {
            throw new StorageError(
              "STORAGE_CHECKSUM",
              "Recovered destination aliases staging instead of using a separate inode"
            );
          }
          const stagingInspection = await this.hashStableFileHandle(staging, {
            requireImmutable: false,
          });
          if (
            stagingInspection.size !== input.size ||
            stagingInspection.sha256 !== expectedSha256
          ) {
            throw new StorageError(
              "STORAGE_CHECKSUM",
              "Staging bytes diverged from the recovered committed object"
            );
          }
        } finally {
          await staging.close();
        }
        await unlink(stagingPath);
        await syncDurableDirectory(dirname(stagingPath));
        action = "staging-cleaned";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      await destination.sync();
      const finalStatus = await destination.stat({ bigint: true });
      if (
        !hasStableFileIdentity(verifiedStatus, finalStatus) ||
        hasWriteBits(finalStatus) ||
        finalStatus.nlink !== 1n
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Recovered committed object identity changed during reconciliation"
        );
      }
      await syncDurableDirectory(dirname(destinationPath));
      const receipt = this.committedReceipt(finalStatus, {
        objectKey,
        size: input.size,
        sha256: expectedSha256,
      });
      return { action, receipt };
    } finally {
      await destination.close();
    }
  }

  async commitMultipart(input: CommitMultipartInput): Promise<StoredObjectReceipt> {
    const root = await this.requireWriteReady();
    await this.requirePlacementCapacity(root, input.size);
    const objectKey = assertSafeObjectKey(input.objectKey);
    const expectedSha256 = normalizeSha256(input.sha256, "Object checksum");
    await ensureSafeDirectoryTree(root, dirname(objectKey));
    const stagingPath = await this.stagingPath(input.handle);
    const destinationPath = resolvePathInsideRoot(root, objectKey);
    const placementPath = this.commitPlacementPath(
      root,
      objectKey,
      input.handle
    );
    const staging = await open(
      stagingPath,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    let placement: FileHandle | null = null;
    let destination: FileHandle | null = null;
    let placementCreated = false;
    let placementRemoved = false;
    let destinationLinked = false;
    let stagingRemoved = false;
    try {
      const stagedStatus = await staging.stat({ bigint: true });
      if (
        !stagedStatus.isFile() ||
        stagedStatus.size < 0n ||
        stagedStatus.size > BigInt(Number.MAX_SAFE_INTEGER) ||
        Number(stagedStatus.size) !== input.size
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Multipart object changed before immutable placement"
        );
      }
      const sealedStagingStatus =
        await this.sealCommittedFileHandle(staging);

      placement = await open(
        placementPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_RDWR |
          constants.O_NOFOLLOW,
        0o600
      );
      placementCreated = true;
      await this.copyExactFileBytes(staging, placement, input.size);
      const copiedStagingStatus = await staging.stat({ bigint: true });
      if (!hasStableFileIdentity(sealedStagingStatus, copiedStagingStatus)) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Multipart object identity changed while creating immutable placement"
        );
      }
      await this.sealCommittedFileHandle(placement);
      const verifiedPlacementStatus =
        await this.validateCommittedFileHandle(placement, {
          size: input.size,
          sha256: expectedSha256,
        });

      await link(placementPath, destinationPath);
      destinationLinked = true;

      destination = await open(
        destinationPath,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      const publishedStatus = await destination.stat({ bigint: true });
      if (
        !publishedStatus.isFile() ||
        publishedStatus.dev !== verifiedPlacementStatus.dev ||
        publishedStatus.ino !== verifiedPlacementStatus.ino ||
        hasWriteBits(publishedStatus)
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Immutable destination does not match the sealed placement object"
        );
      }
      await syncDurableDirectory(dirname(destinationPath));

      await unlink(placementPath);
      placementRemoved = true;
      await syncDurableDirectory(dirname(placementPath));
      await destination.sync();
      const placedStatus = await destination.stat({ bigint: true });
      if (
        !hasPostUnlinkFileIdentity(publishedStatus, placedStatus) ||
        hasWriteBits(placedStatus)
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Committed object identity changed during immutable publication"
        );
      }

      await unlink(stagingPath);
      stagingRemoved = true;
      await syncDurableDirectory(dirname(stagingPath));
      await destination.sync();
      const finalStatus = await destination.stat({ bigint: true });
      if (
        !hasStableFileIdentity(placedStatus, finalStatus) ||
        hasWriteBits(finalStatus)
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Committed object identity changed during placement"
        );
      }
      await syncDurableDirectory(dirname(destinationPath));
      return this.committedReceipt(finalStatus, {
        objectKey,
        size: input.size,
        sha256: expectedSha256,
      });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === "EEXIST" &&
        !destinationLinked
      ) {
        throw new StorageError(
          "STORAGE_CONFLICT",
          "Versioned object key already exists; overwrite refused"
        );
      }
      const capacityError = isFilesystemCapacityError(error);
      if (destinationLinked && !stagingRemoved) {
        await unlink(destinationPath).catch(() => undefined);
        await syncDurableDirectory(dirname(destinationPath)).catch(
          () => undefined
        );
      }
      if (capacityError) {
        throw new StorageError(
          "STORAGE_CAPACITY",
          "Storage ran out of capacity while creating immutable placement",
          true
        );
      }
      throw error;
    } finally {
      await destination?.close().catch(() => undefined);
      await placement?.close().catch(() => undefined);
      await staging.close();
      if (placementCreated && !placementRemoved) {
        await unlink(placementPath).catch(() => undefined);
        await syncDurableDirectory(dirname(placementPath)).catch(
          () => undefined
        );
      }
    }
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
