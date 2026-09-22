import { constants } from "node:fs";
import type { BigIntStats } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rmdir,
  statfs,
  unlink,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
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
import { publishImmutableDirectory } from "./atomic-directory-publication.ts";
import {
  CcnasReadCache,
  ccnasContentVersionId,
  sameOpenedCcnasFile,
} from "./ccnas-read-cache.ts";
import { syncDurableDirectory } from "./durable-files.ts";
import { StorageError, isStorageError } from "./errors.ts";
import { assertSafeObjectKey } from "./object-key.ts";
import { assertSafeRegularFile, ensureSafeDirectoryTree, resolveExistingRoot, resolvePathInsideRoot } from "./path-safety.ts";

const UPLOAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMITTED_FILE_MODE = 0o400;
const FILE_HASH_BUFFER_BYTES = 1024 * 1024;
const VERSION_DIRECTORY_PATTERN = /^v[0-9]{8}$/;
const HASHED_NAMESPACE_PATTERN = /^[0-9a-f]{20}$/;

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
  private readonly ccnasReadCache: CcnasReadCache | null;
  private canonicalRootPromise: Promise<string> | null = null;

  constructor(
    kind: "local" | "ccnas",
    config: StorageRuntimeConfig
  ) {
    this.kind = kind;
    this.config = config;
    this.external = kind === "ccnas";
    this.label = kind === "local" ? "Local demo storage" : "CCNAS storage";
    this.ccnasReadCache =
      kind === "ccnas" && config.ccnasReadCacheRoot
        ? new CcnasReadCache(
            config.ccnasReadCacheRoot,
            config.ccnasReadCacheReservedBytes,
            config.ccnasReadCacheMaxBytes,
          )
        : null;
  }

  private requireCcnasReadCache(): CcnasReadCache {
    if (!this.ccnasReadCache) {
      throw new StorageError(
        "STORAGE_NOT_CONFIGURED",
        "CCNAS requires an explicit APFS read cache",
      );
    }
    return this.ccnasReadCache;
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
    let ccnasCacheReady = this.kind !== "ccnas";
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

    if (this.kind === "ccnas") {
      if (!this.config.ccnasReadCacheRoot) {
        checks.push({
          key: "ccnas-read-cache",
          status: "fail",
          message: "CCNAS APFS read cache is not configured",
        });
      } else {
        try {
          const cacheRoot = await resolveExistingRoot(
            this.config.ccnasReadCacheRoot,
          );
          await access(cacheRoot, constants.R_OK | constants.W_OK);
          const stats = await statfs(cacheRoot, { bigint: true });
          const cacheCapacity = await this.requireCcnasReadCache().inspectCapacity();
          const availableBytes = stats.bavail * stats.bsize;
          ccnasCacheReady =
            availableBytes >
              this.config.ccnasReadCacheReservedBytes +
                cacheCapacity.outstandingReservationBytes &&
            cacheCapacity.usedBytes +
              cacheCapacity.outstandingReservationBytes <=
              cacheCapacity.maxBytes &&
            (process.platform !== "darwin" || stats.type === 26n);
          checks.push({
            key: "ccnas-read-cache",
            status: ccnasCacheReady ? "pass" : "fail",
            message: ccnasCacheReady
              ? "CCNAS APFS read cache is within its configured maximum and above reserve"
              : "CCNAS read cache is not on APFS, exceeds its maximum, or is at/below reserve",
          });
        } catch {
          checks.push({
            key: "ccnas-read-cache",
            status: "fail",
            message: "CCNAS APFS read cache is unavailable to this process",
          });
        }
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
        ccnasCacheReady &&
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
    return this.inspectRegularFile(path, {
      allowCcnasMetadataDrift: this.kind === "ccnas",
    });
  }

  private async hashStableFileHandle(
    file: FileHandle,
    options: { requireImmutable: boolean; allowCcnasMetadataDrift?: boolean }
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
    const stableIdentity = options.allowCcnasMetadataDrift
      ? sameOpenedCcnasFile(before, after)
      : hasStableFileIdentity(before, after);
    if (
      !stableIdentity ||
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

  private async validateCcnasNasFileHandle(
    file: FileHandle,
    input: { size: number; sha256: string },
  ): Promise<BigIntStats> {
    const inspection = await this.hashStableFileHandle(file, {
      requireImmutable: false,
      allowCcnasMetadataDrift: true,
    });
    if (inspection.size !== input.size || inspection.sha256 !== input.sha256) {
      throw new StorageError(
        "STORAGE_CHECKSUM",
        "CCNAS object does not match its authoritative receipt",
      );
    }
    return inspection.status;
  }

  private ccnasCommittedReceipt(
    status: BigIntStats,
    input: { objectKey: string; size: number; sha256: string },
  ): StoredObjectReceipt {
    return {
      provider: "ccnas",
      objectKey: input.objectKey,
      size: input.size,
      sha256: input.sha256,
      providerVersionId: ccnasContentVersionId(input),
      committedAt: new Date(Number(status.mtimeMs)).toISOString(),
    };
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

  private async inspectRegularFile(
    path: string,
    options: { allowCcnasMetadataDrift?: boolean } = {},
  ): Promise<MultipartInspection> {
    await assertSafeRegularFile(path);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const { size, sha256 } = await this.hashStableFileHandle(file, {
        requireImmutable: false,
        allowCcnasMetadataDrift: options.allowCcnasMetadataDrift,
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

  private ccnasPublicationPaths(
    root: string,
    objectKey: string,
    handle: MultipartHandle,
  ): {
    destinationDirectory: string;
    destinationPath: string;
    placementDirectory: string;
    placementPath: string;
  } {
    this.assertHandle(handle);
    const segments = objectKey.split("/");
    if (
      segments.length !== 8 ||
      segments[0] !== "tenants" ||
      !segments[1].startsWith("t-") ||
      !HASHED_NAMESPACE_PATTERN.test(segments[1].slice(2)) ||
      segments[2] !== "projects" ||
      !segments[3].startsWith("p-") ||
      !HASHED_NAMESPACE_PATTERN.test(segments[3].slice(2)) ||
      segments[4] !== "objects" ||
      !segments[5].startsWith("o-") ||
      !HASHED_NAMESPACE_PATTERN.test(segments[5].slice(2)) ||
      !VERSION_DIRECTORY_PATTERN.test(segments[6])
    ) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "CCNAS publication requires an exclusively owned version directory",
      );
    }
    const destinationPath = resolvePathInsideRoot(root, objectKey);
    const destinationDirectory = dirname(destinationPath);
    const placementDirectory = resolvePathInsideRoot(
      root,
      `${dirname(dirname(objectKey))}/.codeliver-commit-${handle.uploadId}.tmp`,
    );
    return {
      destinationDirectory,
      destinationPath,
      placementDirectory,
      placementPath: resolvePathInsideRoot(
        root,
        `${dirname(dirname(objectKey))}/.codeliver-commit-${handle.uploadId}.tmp/${basename(objectKey)}`,
      ),
    };
  }

  private async removeCcnasCommitPlacement(
    placementDirectory: string,
    placementPath: string,
  ): Promise<boolean> {
    try {
      await this.assertSafeCcnasDirectory(placementDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    let placement: FileHandle | null = null;
    try {
      placement = await open(
        placementPath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const status = await placement.stat({ bigint: true });
      if (!status.isFile()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "CCNAS commit placement is not a regular file",
        );
      }
      await unlink(placementPath);
      await syncDurableDirectory(placementDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    } finally {
      await placement?.close().catch(() => undefined);
    }

    try {
      await rmdir(placementDirectory);
      await syncDurableDirectory(dirname(placementDirectory));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private async assertSafeCcnasDirectory(path: string): Promise<void> {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "CCNAS publication contains a symlink or unsafe directory",
      );
    }
    if (await realpath(path) !== path) {
      throw new StorageError(
        "STORAGE_PATH_INVALID",
        "CCNAS publication directory resolves through a symlink",
      );
    }
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
    if (this.kind === "ccnas") {
      if (!expectation?.sha256) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "CCNAS cold-cache reads require an authoritative checksum receipt",
        );
      }
      const canonicalKey = assertSafeObjectKey(objectKey);
      const expectedSha256 = normalizeSha256(
        expectation.sha256,
        "Object checksum",
      );
      const expectedContentVersion = ccnasContentVersionId({
        objectKey: canonicalKey,
        size: expectation.size,
        sha256: expectedSha256,
      });
      const legacyVersion = /^fs-v1:[0-9a-f]{64}$/.test(
        expectation.providerVersionId,
      );
      if (
        expectation.providerVersionId !== expectedContentVersion &&
        !legacyVersion
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "CCNAS receipt identity does not match its key, size, and checksum",
        );
      }
      const sourcePath = await this.storedObjectPath(canonicalKey);
      const cached = await this.requireCcnasReadCache().ensure({
        objectKey: canonicalKey,
        sourcePath,
        size: expectation.size,
        sha256: expectedSha256,
      });
      if (!legacyVersion && cached.providerVersionId !== expectation.providerVersionId) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "CCNAS cache identity does not match its committed receipt",
        );
      }
      const file = await open(
        cached.path,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const status = await file.stat({ bigint: true });
        if (
          !hasStableFileIdentity(cached.status, status) ||
          hasWriteBits(status)
        ) {
          throw new StorageError(
            "STORAGE_CHECKSUM",
            "APFS cache identity changed before playback",
          );
        }
        const size = Number(status.size);
        if (range && (range.start >= size || range.end >= size)) {
          throw new StorageError(
            "STORAGE_PATH_INVALID",
            "Stored object byte range exceeds the object",
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

  private async reconcileCcnasMultipartCommit(
    root: string,
    input: CommitMultipartInput,
    objectKey: string,
    expectedSha256: string,
  ): Promise<MultipartCommitReconciliation> {
    const objectDirectoryKey = dirname(dirname(objectKey));
    await ensureSafeDirectoryTree(root, objectDirectoryKey);
    const {
      destinationDirectory,
      destinationPath,
      placementDirectory,
      placementPath,
    } = this.ccnasPublicationPaths(root, objectKey, input.handle);
    const stagingPath = await this.stagingPath(input.handle);

    try {
      await this.assertSafeCcnasDirectory(destinationDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.removeCcnasCommitPlacement(
          placementDirectory,
          placementPath,
        );
        return { action: "not-committed", receipt: null };
      }
      throw error;
    }
    let destination: FileHandle;
    try {
      destination = await open(
        destinationPath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.removeCcnasCommitPlacement(
          placementDirectory,
          placementPath,
        );
        return { action: "not-committed", receipt: null };
      }
      throw error;
    }

    try {
      let verifiedStatus = await this.validateCcnasNasFileHandle(
        destination,
        { size: input.size, sha256: expectedSha256 },
      );
      let action: MultipartCommitReconciliation["action"] = "committed";
      const removedPlacement = await this.removeCcnasCommitPlacement(
        placementDirectory,
        placementPath,
      );
      if (removedPlacement) {
        verifiedStatus = await this.validateCcnasNasFileHandle(
          destination,
          { size: input.size, sha256: expectedSha256 },
        );
        action = "staging-cleaned";
      }

      const cached = await this.requireCcnasReadCache().ensure({
        objectKey,
        sourcePath: destinationPath,
        size: input.size,
        sha256: expectedSha256,
      });
      if (
        cached.providerVersionId !==
        ccnasContentVersionId({
          objectKey,
          size: input.size,
          sha256: expectedSha256,
        })
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "APFS cache identity diverged from the CCNAS receipt",
        );
      }

      try {
        const staging = await open(
          stagingPath,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          const stagingStatus = await staging.stat({ bigint: true });
          if (!stagingStatus.isFile()) {
            throw new StorageError(
              "STORAGE_PATH_INVALID",
              "Staging object is not a regular file",
            );
          }
          const stagingInspection = await this.hashStableFileHandle(staging, {
            requireImmutable: false,
            allowCcnasMetadataDrift: true,
          });
          if (
            stagingInspection.size !== input.size ||
            stagingInspection.sha256 !== expectedSha256
          ) {
            throw new StorageError(
              "STORAGE_CHECKSUM",
              "Staging bytes diverged from the recovered committed object",
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
        !sameOpenedCcnasFile(verifiedStatus, finalStatus) ||
        finalStatus.nlink !== 1n
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Recovered CCNAS object identity changed during reconciliation",
        );
      }
      await syncDurableDirectory(dirname(destinationPath));
      return {
        action,
        receipt: this.ccnasCommittedReceipt(finalStatus, {
          objectKey,
          size: input.size,
          sha256: expectedSha256,
        }),
      };
    } finally {
      await destination.close();
    }
  }

  async reconcileMultipartCommit(
    input: CommitMultipartInput
  ): Promise<MultipartCommitReconciliation> {
    const root = await this.requireWriteReady();
    const objectKey = assertSafeObjectKey(input.objectKey);
    const expectedSha256 = normalizeSha256(input.sha256, "Object checksum");
    if (this.kind === "ccnas") {
      return this.reconcileCcnasMultipartCommit(
        root,
        input,
        objectKey,
        expectedSha256,
      );
    }
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

  private async commitCcnasMultipart(
    root: string,
    input: CommitMultipartInput,
    objectKey: string,
    expectedSha256: string,
  ): Promise<StoredObjectReceipt> {
    const objectDirectoryKey = dirname(dirname(objectKey));
    await ensureSafeDirectoryTree(root, objectDirectoryKey);
    const {
      destinationDirectory,
      destinationPath,
      placementDirectory,
      placementPath,
    } = this.ccnasPublicationPaths(root, objectKey, input.handle);
    const stagingPath = await this.stagingPath(input.handle);
    const staging = await open(
      stagingPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let placement: FileHandle | null = null;
    let destination: FileHandle | null = null;
    let placementDirectoryCreated = false;
    let published = false;
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
          "Multipart object changed before immutable CCNAS placement",
        );
      }
      // SMB mode and timestamps are advisory. The placement and APFS cache
      // remain bound to the caller's authoritative size and SHA-256.
      const stableStagingStatus = stagedStatus;

      try {
        await mkdir(placementDirectory, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new StorageError(
            "STORAGE_CONFLICT",
            "CCNAS commit placement already exists; reconcile before retry",
            true,
          );
        }
        throw error;
      }
      placementDirectoryCreated = true;
      await this.assertSafeCcnasDirectory(placementDirectory);
      placement = await open(
        placementPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_RDWR |
          constants.O_NOFOLLOW,
        0o600,
      );
      await this.copyExactFileBytes(staging, placement, input.size);
      const copiedStagingStatus = await staging.stat({ bigint: true });
      if (!sameOpenedCcnasFile(stableStagingStatus, copiedStagingStatus)) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Multipart object identity changed while creating CCNAS placement",
        );
      }
      const verifiedPlacementStatus =
        await this.validateCcnasNasFileHandle(placement, {
          size: input.size,
          sha256: expectedSha256,
        });
      await syncDurableDirectory(placementDirectory);
      await placement.close();
      placement = null;

      await publishImmutableDirectory(
        placementDirectory,
        destinationDirectory,
      );
      published = true;
      await this.assertSafeCcnasDirectory(destinationDirectory);

      destination = await open(
        destinationPath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const publishedStatus = await destination.stat({ bigint: true });
      if (
        !publishedStatus.isFile() ||
        publishedStatus.dev !== verifiedPlacementStatus.dev ||
        publishedStatus.ino !== verifiedPlacementStatus.ino
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "CCNAS destination does not match the sealed placement object",
        );
      }
      const verifiedNasStatus = await this.validateCcnasNasFileHandle(
        destination,
        { size: input.size, sha256: expectedSha256 },
      );
      if (
        verifiedNasStatus.dev !== publishedStatus.dev ||
        verifiedNasStatus.ino !== publishedStatus.ino
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "CCNAS destination identity changed during checksum verification",
        );
      }
      const cached = await this.requireCcnasReadCache().ensure({
        objectKey,
        sourcePath: destinationPath,
        size: input.size,
        sha256: expectedSha256,
      });
      if (
        cached.providerVersionId !==
        ccnasContentVersionId({
          objectKey,
          size: input.size,
          sha256: expectedSha256,
        })
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "APFS cache identity diverged from the CCNAS receipt",
        );
      }
      await destination.sync();
      await unlink(stagingPath);
      await syncDurableDirectory(dirname(stagingPath));

      const finalStatus = await destination.stat({ bigint: true });
      if (
        !sameOpenedCcnasFile(publishedStatus, finalStatus) ||
        finalStatus.nlink !== 1n
      ) {
        throw new StorageError(
          "STORAGE_CHECKSUM",
          "Committed CCNAS object identity changed during publication",
        );
      }
      await syncDurableDirectory(dirname(destinationPath));
      return this.ccnasCommittedReceipt(finalStatus, {
        objectKey,
        size: input.size,
        sha256: expectedSha256,
      });
    } catch (error) {
      if (isFilesystemCapacityError(error)) {
        throw new StorageError(
          "STORAGE_CAPACITY",
          "Storage ran out of capacity while creating immutable CCNAS placement",
          true,
        );
      }
      throw error;
    } finally {
      await destination?.close().catch(() => undefined);
      await placement?.close().catch(() => undefined);
      await staging.close();
      if (placementDirectoryCreated && !published) {
        await this.removeCcnasCommitPlacement(
          placementDirectory,
          placementPath,
        ).catch(() => undefined);
      }
    }
  }

  async commitMultipart(input: CommitMultipartInput): Promise<StoredObjectReceipt> {
    const root = await this.requireWriteReady();
    await this.requirePlacementCapacity(root, input.size);
    const objectKey = assertSafeObjectKey(input.objectKey);
    const expectedSha256 = normalizeSha256(input.sha256, "Object checksum");
    if (this.kind === "ccnas") {
      return this.commitCcnasMultipart(
        root,
        input,
        objectKey,
        expectedSha256,
      );
    }
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
