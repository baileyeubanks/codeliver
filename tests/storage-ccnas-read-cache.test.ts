import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  statfsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import {
  CcnasReadCache,
  ccnasContentVersionId,
} from "../lib/storage/ccnas-read-cache.ts";

const TEST_CACHE_MAX_BYTES = 1024n * 1024n;

function fixture() {
  const sourceRoot = mkdtempSync(join(tmpdir(), "codeliver-ccnas-source-"));
  const cacheRoot = mkdtempSync(join(tmpdir(), "codeliver-ccnas-cache-"));
  const objectKey =
    "tenants/t-aaaaaaaaaaaaaaaaaaaa/projects/p-bbbbbbbbbbbbbbbbbbbb/objects/o-cccccccccccccccccccc/v00000001/master.mov";
  const sourcePath = join(sourceRoot, objectKey);
  const payload = Buffer.from("verified-ccnas-payload");
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, payload);
  return {
    sourceRoot,
    cacheRoot,
    objectKey,
    sourcePath,
    payload,
    sha256: createHash("sha256").update(payload).digest("hex"),
  };
}

test("CCNAS cache cold fill hashes the NAS source and publishes sealed APFS bytes", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  try {
    const receipt = await cache.ensure({
      objectKey: value.objectKey,
      sourcePath: value.sourcePath,
      size: value.payload.length,
      sha256: value.sha256,
    });
    assert.equal(readFileSync(receipt.path, "utf8"), value.payload.toString());
    assert.equal(receipt.providerVersionId, ccnasContentVersionId({
      objectKey: value.objectKey,
      size: value.payload.length,
      sha256: value.sha256,
    }));
    assert.equal(receipt.status.mode & 0o222n, 0n);
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache coalesces concurrent cold fills without replacing the winner", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  const input = {
    objectKey: value.objectKey,
    sourcePath: value.sourcePath,
    size: value.payload.length,
    sha256: value.sha256,
  };
  try {
    const [first, second] = await Promise.all([
      cache.ensure(input),
      cache.ensure(input),
    ]);
    assert.equal(first.path, second.path);
    assert.equal(first.status.ino, second.status.ino);
    assert.equal(readFileSync(first.path, "utf8"), value.payload.toString());
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache rejects NAS tamper before a cold fill", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  try {
    writeFileSync(value.sourcePath, "tampered-source");
    await assert.rejects(
      () => cache.ensure({
        objectKey: value.objectKey,
        sourcePath: value.sourcePath,
        size: value.payload.length,
        sha256: value.sha256,
      }),
      /checksum|size/i,
    );
    assert.equal(existsSync(join(value.cacheRoot, value.objectKey)), false);
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache rejects a cache object whose sealed identity changed", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  const input = {
    objectKey: value.objectKey,
    sourcePath: value.sourcePath,
    size: value.payload.length,
    sha256: value.sha256,
  };
  try {
    const receipt = await cache.ensure(input);
    chmodSync(receipt.path, 0o600);
    writeFileSync(receipt.path, Buffer.alloc(value.payload.length, 0x78));
    chmodSync(receipt.path, 0o400);
    await assert.rejects(
      () => cache.ensure(input),
      /identity|checksum/i,
    );
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache recovers a cache-file-only eviction from authoritative NAS bytes", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  const input = {
    objectKey: value.objectKey,
    sourcePath: value.sourcePath,
    size: value.payload.length,
    sha256: value.sha256,
  };
  try {
    const first = await cache.ensure(input);
    rmSync(first.path);
    const rebuilt = await cache.ensure(input);
    assert.equal(readFileSync(rebuilt.path, "utf8"), value.payload.toString());
    assert.notEqual(rebuilt.status.ino, first.status.ino);
    assert.equal(rebuilt.providerVersionId, first.providerVersionId);
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache replaces an interrupted partial manifest only after rehashing expected bytes", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  const input = {
    objectKey: value.objectKey,
    sourcePath: value.sourcePath,
    size: value.payload.length,
    sha256: value.sha256,
  };
  try {
    const first = await cache.ensure(input);
    const manifestPath = join(
      dirname(first.path),
      `.${basename(first.path)}.ccnas-cache-v1.json`,
    );
    chmodSync(manifestPath, 0o600);
    writeFileSync(manifestPath, "{\"version\":1");
    chmodSync(manifestPath, 0o400);
    const recovered = await cache.ensure(input);
    assert.equal(recovered.status.ino, first.status.ino);
    assert.doesNotThrow(() => JSON.parse(readFileSync(manifestPath, "utf8")));
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache never follows a symlinked manifest", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  const input = {
    objectKey: value.objectKey,
    sourcePath: value.sourcePath,
    size: value.payload.length,
    sha256: value.sha256,
  };
  const outside = join(value.sourceRoot, "outside-manifest.json");
  try {
    const first = await cache.ensure(input);
    const manifestPath = join(
      dirname(first.path),
      `.${basename(first.path)}.ccnas-cache-v1.json`,
    );
    rmSync(manifestPath);
    writeFileSync(outside, "outside");
    symlinkSync(outside, manifestPath);
    await assert.rejects(() => cache.ensure(input), /symlink|manifest|path/i);
    assert.equal(readFileSync(outside, "utf8"), "outside");
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("two CCNAS cache instances race safely on the same object", async () => {
  const value = fixture();
  const firstCache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  const secondCache = new CcnasReadCache(value.cacheRoot, 0n, TEST_CACHE_MAX_BYTES);
  const input = {
    objectKey: value.objectKey,
    sourcePath: value.sourcePath,
    size: value.payload.length,
    sha256: value.sha256,
  };
  try {
    const [first, second] = await Promise.all([
      firstCache.ensure(input),
      secondCache.ensure(input),
    ]);
    assert.equal(first.status.ino, second.status.ino);
    assert.equal(first.providerVersionId, second.providerVersionId);
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache refuses a cold fill that would exceed its configured capacity", async () => {
  const value = fixture();
  const cache = new CcnasReadCache(
    value.cacheRoot,
    0n,
    BigInt(value.payload.length - 1),
  );
  try {
    await assert.rejects(
      () => cache.ensure({
        objectKey: value.objectKey,
        sourcePath: value.sourcePath,
        size: value.payload.length,
        sha256: value.sha256,
      }),
      /capacity|configured maximum/i,
    );
    assert.equal(existsSync(join(value.cacheRoot, value.objectKey)), false);
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});

test("CCNAS cache counts crash-residual reservations against the free-space reserve", async () => {
  const value = fixture();
  const available = statfsSync(value.cacheRoot, { bigint: true });
  const availableBytes = available.bavail * available.bsize;
  const staleReservation = join(
    value.cacheRoot,
    `.ccnas-cache-reservation-${10n * 1024n * 1024n * 1024n}-${randomUUID()}`,
  );
  writeFileSync(staleReservation, "", { mode: 0o400 });
  const cache = new CcnasReadCache(
    value.cacheRoot,
    availableBytes - BigInt(value.payload.length) - 1024n * 1024n * 1024n,
    100n * 1024n * 1024n * 1024n,
  );
  try {
    await assert.rejects(
      () => cache.ensure({
        objectKey: value.objectKey,
        sourcePath: value.sourcePath,
        size: value.payload.length,
        sha256: value.sha256,
      }),
      /free-space reserve/i,
    );
    assert.equal(existsSync(join(value.cacheRoot, value.objectKey)), false);
  } finally {
    rmSync(value.sourceRoot, { recursive: true, force: true });
    rmSync(value.cacheRoot, { recursive: true, force: true });
  }
});
