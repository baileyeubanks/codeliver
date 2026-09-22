import { constants } from "node:fs";
import type { BigIntStats } from "node:fs";
import { link, lstat, open, readdir, rename, statfs, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { syncDurableDirectory } from "./durable-files.ts";
import { StorageError } from "./errors.ts";
import { assertSafeObjectKey } from "./object-key.ts";
import { ensureSafeDirectoryTree, resolveExistingRoot, resolvePathInsideRoot } from "./path-safety.ts";

const BUFFER_BYTES = 1024 * 1024;
const SEALED_MODE = 0o400;
const MAX_MANIFEST_BYTES = 16 * 1024;
const RESERVATION_PREFIX = ".ccnas-cache-reservation-";
const SHARED_FILLS = new Map<string, Promise<CcnasCacheReceipt>>();

export interface CcnasCacheInput {
  objectKey: string;
  sourcePath: string;
  size: number;
  sha256: string;
}

export interface CcnasCacheReceipt {
  path: string;
  providerVersionId: string;
  status: BigIntStats;
}

export interface CcnasCacheCapacity {
  availableBytes: bigint;
  usedBytes: bigint;
  outstandingReservationBytes: bigint;
  reservedBytes: bigint;
  maxBytes: bigint;
}

interface CacheManifest {
  version: 1;
  objectKeyDigest: string;
  size: number;
  sha256: string;
  providerVersionId: string;
  identity: Record<"dev" | "ino" | "size" | "mode" | "mtimeNs" | "ctimeNs" | "nlink", string>;
}

function normalizeSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new StorageError("STORAGE_CHECKSUM", "CCNAS cache checksum is invalid");
  }
  return normalized;
}

function assertSafeSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new StorageError("STORAGE_CHECKSUM", "CCNAS cache size is invalid");
  }
}

function hasWriteBits(status: BigIntStats): boolean {
  return (status.mode & BigInt(0o222)) !== 0n;
}

function objectKeyDigest(objectKey: string): string {
  return createHash("sha256").update(objectKey).digest("hex");
}

function manifestIdentity(status: BigIntStats): CacheManifest["identity"] {
  return {
    dev: status.dev.toString(), ino: status.ino.toString(), size: status.size.toString(),
    mode: status.mode.toString(), mtimeNs: status.mtimeNs.toString(), ctimeNs: status.ctimeNs.toString(),
    nlink: status.nlink.toString(),
  };
}

function identitiesMatch(manifest: CacheManifest["identity"], status: BigIntStats): boolean {
  return JSON.stringify(manifest) === JSON.stringify(manifestIdentity(status));
}

export function ccnasContentVersionId(input: { objectKey: string; size: number; sha256: string }): string {
  const objectKey = assertSafeObjectKey(input.objectKey);
  assertSafeSize(input.size);
  const sha256 = normalizeSha256(input.sha256);
  return `ccnas-v1:${createHash("sha256").update(objectKey).update("\0").update(String(input.size)).update("\0").update(sha256).digest("hex")}`;
}

export class CcnasReadCache {
  private readonly root: string;
  private readonly reservedBytes: bigint;
  private readonly maxBytes: bigint;
  private canonicalRootPromise: Promise<string> | null = null;

  constructor(root: string, reservedBytes: bigint, maxBytes: bigint) {
    this.root = root;
    this.reservedBytes = reservedBytes;
    this.maxBytes = maxBytes;
  }

  private async measuredDataAndReservations(
    directory: string,
  ): Promise<{ usedBytes: bigint; outstandingReservationBytes: bigint }> {
    let usedBytes = 0n;
    let outstandingReservationBytes = 0n;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "CCNAS cache capacity cannot be measured through a symlink",
        );
      }
      if (entry.isDirectory()) {
        const nested = await this.measuredDataAndReservations(path);
        usedBytes += nested.usedBytes;
        outstandingReservationBytes += nested.outstandingReservationBytes;
        continue;
      }
      if (!entry.isFile()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "CCNAS cache contains an unsupported filesystem entry",
        );
      }
      if (entry.name.startsWith(RESERVATION_PREFIX)) {
        const match = entry.name.match(
          /^\.ccnas-cache-reservation-([0-9]+)-[0-9a-f-]+$/i,
        );
        if (!match) {
          throw new StorageError(
            "STORAGE_PATH_INVALID",
            "CCNAS cache contains an invalid capacity reservation",
          );
        }
        outstandingReservationBytes += BigInt(match[1]);
        continue;
      }
      if (
        entry.name.endsWith(".ccnas-cache-v1.json") ||
        /^\..+\.[0-9a-f-]+\.tmp$/i.test(entry.name)
      ) {
        continue;
      }
      const status = await lstat(path, { bigint: true });
      if (!status.isFile()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "CCNAS cache capacity entry changed during measurement",
        );
      }
      usedBytes += status.size;
    }
    return { usedBytes, outstandingReservationBytes };
  }

  private async reserveCapacity(root: string, size: number): Promise<() => Promise<void>> {
    const reservationName = `${RESERVATION_PREFIX}${size}-${randomUUID()}`;
    const reservationPath = resolvePathInsideRoot(root, reservationName);
    const reservation = await open(
      reservationPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      SEALED_MODE,
    );
    try {
      await reservation.sync();
    } finally {
      await reservation.close();
    }
    try {
      const measured = await this.measuredDataAndReservations(root);
      const filesystem = await statfs(root, { bigint: true });
      const availableBytes = filesystem.bavail * filesystem.bsize;
      if (
        measured.usedBytes + measured.outstandingReservationBytes >
        this.maxBytes
      ) {
        throw new StorageError(
          "STORAGE_CAPACITY",
          "APFS read cache would exceed its configured maximum",
          true,
        );
      }
      if (
        availableBytes <
        this.reservedBytes + measured.outstandingReservationBytes
      ) {
        throw new StorageError(
          "STORAGE_CAPACITY",
          "APFS read cache cannot retain its configured free-space reserve",
          true,
        );
      }
    } catch (error) {
      await unlink(reservationPath).catch(() => undefined);
      throw error;
    }
    return async () => {
      await unlink(reservationPath);
      await syncDurableDirectory(root);
    };
  }

  private canonicalRoot(): Promise<string> {
    this.canonicalRootPromise ??= (async () => {
      const root = await resolveExistingRoot(this.root);
      const stats = await statfs(root, { bigint: true });
      if (process.platform === "darwin" && stats.type !== 26n) {
        throw new StorageError(
          "STORAGE_NOT_READY",
          "CCNAS read cache must reside on APFS",
          true,
        );
      }
      return root;
    })();
    return this.canonicalRootPromise;
  }

  private async paths(objectKey: string): Promise<{ path: string; manifestPath: string }> {
    const root = await this.canonicalRoot();
    const key = assertSafeObjectKey(objectKey);
    await ensureSafeDirectoryTree(root, dirname(key));
    return {
      path: resolvePathInsideRoot(root, key),
      manifestPath: resolvePathInsideRoot(root, `${dirname(key)}/.${basename(key)}.ccnas-cache-v1.json`),
    };
  }

  async inspectCapacity(): Promise<CcnasCacheCapacity> {
    const root = await this.canonicalRoot();
    const filesystem = await statfs(root, { bigint: true });
    const measured = await this.measuredDataAndReservations(root);
    return {
      availableBytes: filesystem.bavail * filesystem.bsize,
      usedBytes: measured.usedBytes,
      outstandingReservationBytes: measured.outstandingReservationBytes,
      reservedBytes: this.reservedBytes,
      maxBytes: this.maxBytes,
    };
  }

  private async hashFile(file: Awaited<ReturnType<typeof open>>): Promise<{ size: number; sha256: string; status: BigIntStats }> {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new StorageError("STORAGE_PATH_INVALID", "CCNAS cache source is not a safe file");
    }
    const size = Number(before.size);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(BUFFER_BYTES);
    let position = 0;
    while (position < size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, size - position), position);
      if (bytesRead <= 0) throw new StorageError("STORAGE_CHECKSUM", "CCNAS cache source changed while hashing");
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await file.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new StorageError("STORAGE_CHECKSUM", "CCNAS cache source identity changed while hashing");
    }
    return { size, sha256: hash.digest("hex"), status: after };
  }

  private buildManifest(input: CcnasCacheInput, status: BigIntStats): CacheManifest {
    return {
      version: 1,
      objectKeyDigest: objectKeyDigest(input.objectKey),
      size: input.size,
      sha256: input.sha256,
      providerVersionId: ccnasContentVersionId(input),
      identity: manifestIdentity(status),
    };
  }

  private async writeManifestAtomic(manifestPath: string, manifest: CacheManifest): Promise<void> {
    const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
    let file: Awaited<ReturnType<typeof open>> | null = null;
    try {
      file = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
      await file.writeFile(JSON.stringify(manifest));
      await file.sync();
      await file.chmod(SEALED_MODE);
      await file.sync();
      await file.close();
      file = null;
      try {
        const existing = await open(
          manifestPath,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          const status = await existing.stat({ bigint: true });
          if (!status.isFile()) {
            throw new StorageError("STORAGE_PATH_INVALID", "CCNAS cache manifest path is unsafe");
          }
        } finally {
          await existing.close();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(temporaryPath, manifestPath);
    } finally {
      await file?.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
    }
    await syncDurableDirectory(dirname(manifestPath));
  }

  private async readManifest(
    manifestPath: string,
  ): Promise<CacheManifest | null> {
    let file: Awaited<ReturnType<typeof open>>;
    try {
      file = await open(
        manifestPath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new StorageError("STORAGE_PATH_INVALID", "CCNAS cache manifest path is unsafe");
    }
    try {
      const before = await file.stat({ bigint: true });
      if (
        !before.isFile() ||
        before.size <= 0n ||
        before.size > BigInt(MAX_MANIFEST_BYTES)
      ) {
        return null;
      }
      const raw = await file.readFile("utf8");
      const after = await file.stat({ bigint: true });
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs
      ) {
        return null;
      }
      if (hasWriteBits(after)) return null;
      try {
        return JSON.parse(raw) as CacheManifest;
      } catch {
        return null;
      }
    } finally {
      await file.close();
    }
  }

  private async validateExisting(input: CcnasCacheInput, path: string, manifestPath: string): Promise<CcnasCacheReceipt> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      let status = await file.stat({ bigint: true });
      for (let attempt = 0; status.nlink === 2n && attempt < 100; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        status = await file.stat({ bigint: true });
      }
      if (!status.isFile() || hasWriteBits(status) || status.size !== BigInt(input.size) || status.nlink !== 1n) {
        throw new StorageError("STORAGE_CHECKSUM", "CCNAS cache object is not sealed to its receipt");
      }
      let manifest = await this.readManifest(manifestPath);
      const manifestMatches =
        manifest?.version === 1 &&
        manifest.objectKeyDigest === objectKeyDigest(input.objectKey) &&
        manifest.size === input.size &&
        manifest.sha256 === input.sha256 &&
        manifest.providerVersionId === ccnasContentVersionId(input) &&
        identitiesMatch(manifest.identity, status);
      if (!manifestMatches) {
        const inspection = await this.hashFile(file);
        if (inspection.size !== input.size || inspection.sha256 !== input.sha256) {
          throw new StorageError("STORAGE_CHECKSUM", "CCNAS cache checksum does not match its receipt");
        }
        status = inspection.status;
        await this.writeManifestAtomic(manifestPath, this.buildManifest(input, status));
        manifest = await this.readManifest(manifestPath);
      }
      if (!manifest || manifest.version !== 1 || manifest.objectKeyDigest !== objectKeyDigest(input.objectKey) || manifest.size !== input.size || manifest.sha256 !== input.sha256 || manifest.providerVersionId !== ccnasContentVersionId(input) || !identitiesMatch(manifest.identity, status)) {
        throw new StorageError("STORAGE_CHECKSUM", "CCNAS cache identity does not match its receipt");
      }
      return { path, providerVersionId: manifest.providerVersionId, status };
    } finally {
      await file.close();
    }
  }

  private async fill(input: CcnasCacheInput): Promise<CcnasCacheReceipt> {
    const normalized = { ...input, objectKey: assertSafeObjectKey(input.objectKey), sha256: normalizeSha256(input.sha256) };
    assertSafeSize(normalized.size);
    const { path, manifestPath } = await this.paths(normalized.objectKey);
    try {
      return await this.validateExisting(normalized, path, manifestPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const root = await this.canonicalRoot();
    const capacity = await statfs(root, { bigint: true });
    if (capacity.bavail * capacity.bsize < this.reservedBytes + BigInt(normalized.size)) {
      throw new StorageError("STORAGE_CAPACITY", "APFS read cache cannot retain its configured reserve", true);
    }
    const releaseCapacity = await this.reserveCapacity(root, normalized.size);
    const temporaryPath = resolvePathInsideRoot(root, `${dirname(normalized.objectKey)}/.${basename(normalized.objectKey)}.${randomUUID()}.tmp`);
    let source: Awaited<ReturnType<typeof open>> | null = null;
    let temporary: Awaited<ReturnType<typeof open>> | null = null;
    try {
      source = await open(
        normalized.sourcePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const sourceInspection = await this.hashFile(source);
      if (sourceInspection.size !== normalized.size || sourceInspection.sha256 !== normalized.sha256) {
        throw new StorageError("STORAGE_CHECKSUM", "CCNAS source checksum or size does not match its receipt");
      }
      temporary = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
      const buffer = Buffer.allocUnsafe(BUFFER_BYTES);
      let position = 0;
      while (position < normalized.size) {
        const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, normalized.size - position), position);
        if (bytesRead <= 0) throw new StorageError("STORAGE_CHECKSUM", "CCNAS source changed during cache fill");
        let written = 0;
        while (written < bytesRead) {
          const result = await temporary.write(buffer, written, bytesRead - written, position + written);
          if (result.bytesWritten <= 0) throw new StorageError("STORAGE_NOT_READY", "APFS cache write made no progress", true);
          written += result.bytesWritten;
        }
        position += bytesRead;
      }
      await temporary.truncate(normalized.size);
      await temporary.sync();
      await temporary.chmod(SEALED_MODE);
      await temporary.sync();
      const temporaryInspection = await this.hashFile(temporary);
      if (temporaryInspection.size !== normalized.size || temporaryInspection.sha256 !== normalized.sha256 || hasWriteBits(temporaryInspection.status)) {
        throw new StorageError("STORAGE_CHECKSUM", "APFS cache copy failed verification");
      }
      try {
        await link(temporaryPath, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      await temporary.close();
      temporary = null;
      await unlink(temporaryPath);
      await syncDurableDirectory(dirname(path));
      return await this.validateExisting(normalized, path, manifestPath);
    } finally {
      await temporary?.close().catch(() => undefined);
      await source?.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      await releaseCapacity();
    }
  }

  async ensure(input: CcnasCacheInput): Promise<CcnasCacheReceipt> {
    const key = `${this.root}\0${input.objectKey}\0${input.size}\0${input.sha256.toLowerCase()}`;
    const existing = SHARED_FILLS.get(key);
    if (existing) return existing;
    const fill = this.fill(input);
    SHARED_FILLS.set(key, fill);
    try {
      return await fill;
    } finally {
      if (SHARED_FILLS.get(key) === fill) SHARED_FILLS.delete(key);
    }
  }
}
