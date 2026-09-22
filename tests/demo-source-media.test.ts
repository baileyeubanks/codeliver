import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { localSourceMedia, sourceByteRange } from "../lib/demo/source-media.ts";

type CatalogAsset = {
  id: string;
  path: string;
  bytes: number;
  poster_path?: string;
};

type Fixture = {
  directory: string;
  root: string;
  outside: string;
  catalogPath: string;
  mediaPath: string;
  mediaBytes: Buffer;
  environment: Record<string, string>;
};

async function createFixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "cvp-source-media-"));
  const root = join(directory, "source-root");
  const outside = join(directory, "outside-root");
  const catalogPath = join(directory, "catalog.json");
  const mediaPath = join(root, "verified.mp4");
  const mediaBytes = Buffer.from("0123456789", "utf8");
  await Promise.all([mkdir(root), mkdir(outside)]);
  await writeFile(mediaPath, mediaBytes);

  return {
    directory,
    root,
    outside,
    catalogPath,
    mediaPath,
    mediaBytes,
    environment: {
      NODE_ENV: "development",
      CODELIVER_DEMO_MODE: "1",
      CODELIVER_SOURCE_ROOT: root,
      CODELIVER_SOURCE_CATALOG: catalogPath,
    },
  };
}

async function writeCatalog(fixture: Fixture, assets: CatalogAsset[]) {
  await writeFile(fixture.catalogPath, JSON.stringify({ assets }));
}

function sourceRequest(
  id: string,
  options: { method?: "GET" | "HEAD"; host?: string; range?: string; crossSite?: boolean } = {},
) {
  const headers = new Headers({ host: options.host ?? "127.0.0.1:4141" });
  if (options.range) headers.set("range", options.range);
  if (options.crossSite) headers.set("sec-fetch-site", "cross-site");
  return new Request(`http://127.0.0.1:4141/api/demo/source-media/${encodeURIComponent(id)}?demo=1`, {
    method: options.method ?? "GET",
    headers,
  });
}

async function withFixture(
  callback: (fixture: Fixture) => Promise<void>,
) {
  const fixture = await createFixture();
  try {
    await callback(fixture);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

test("source media parses only one valid bounded byte range", () => {
  assert.deepEqual(sourceByteRange(null, 10), { start: 0, end: 9, partial: false });
  assert.deepEqual(sourceByteRange("bytes=2-5", 10), { start: 2, end: 5, partial: true });
  assert.deepEqual(sourceByteRange("bytes=-3", 10), { start: 7, end: 9, partial: true });
  assert.deepEqual(sourceByteRange("bytes=8-", 10), { start: 8, end: 9, partial: true });
  assert.equal(sourceByteRange("bytes=8-7", 10), null);
  assert.equal(sourceByteRange("bytes=0-1,3-4", 10), null);
  assert.equal(sourceByteRange("bytes=-0", 10), null);
  assert.equal(sourceByteRange("bytes=999999999999999999999-", 10), null);
});

test("source media serves only a size-bound source file and honors range and HEAD", async () => {
  await withFixture(async (fixture) => {
    await writeCatalog(fixture, [{
      id: "verified-source",
      path: fixture.mediaPath,
      bytes: fixture.mediaBytes.length,
    }]);

    const partial = await localSourceMedia(
      sourceRequest("verified-source", { range: "bytes=2-5" }),
      "verified-source",
      fixture.environment,
    );
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(partial.headers.get("content-length"), "4");
    assert.equal(partial.headers.get("cache-control"), "private, no-store");
    assert.equal(await partial.text(), "2345");

    const head = await localSourceMedia(
      sourceRequest("verified-source", { method: "HEAD", range: "bytes=0-0" }),
      "verified-source",
      fixture.environment,
    );
    assert.equal(head.status, 206);
    assert.equal(head.headers.get("content-range"), "bytes 0-0/10");
    assert.equal(head.body, null);

    const full = await localSourceMedia(
      sourceRequest("verified-source"),
      "verified-source",
      fixture.environment,
    );
    assert.equal(full.status, 200);
    assert.equal(await full.text(), fixture.mediaBytes.toString("utf8"));
  });
});

test("source media rejects production, remote, cross-site, bad-range, and size-mismatched requests", async () => {
  await withFixture(async (fixture) => {
    await writeCatalog(fixture, [{
      id: "verified-source",
      path: fixture.mediaPath,
      bytes: fixture.mediaBytes.length + 1,
    }]);

    const sizeMismatch = await localSourceMedia(
      sourceRequest("verified-source"),
      "verified-source",
      fixture.environment,
    );
    assert.equal(sizeMismatch.status, 409);

    const production = await localSourceMedia(
      sourceRequest("verified-source"),
      "verified-source",
      { ...fixture.environment, NODE_ENV: "production" },
    );
    assert.equal(production.status, 404);

    const remote = await localSourceMedia(
      sourceRequest("verified-source", { host: "admin.contentco-op.com" }),
      "verified-source",
      fixture.environment,
    );
    assert.equal(remote.status, 404);

    const crossSite = await localSourceMedia(
      sourceRequest("verified-source", { crossSite: true }),
      "verified-source",
      fixture.environment,
    );
    assert.equal(crossSite.status, 404);

    await writeCatalog(fixture, [{
      id: "verified-source",
      path: fixture.mediaPath,
      bytes: fixture.mediaBytes.length,
    }]);
    const invalidRange = await localSourceMedia(
      sourceRequest("verified-source", { range: "bytes=90-91" }),
      "verified-source",
      fixture.environment,
    );
    assert.equal(invalidRange.status, 416);
    assert.equal(invalidRange.headers.get("content-range"), "bytes */10");
  });
});

test("source media rejects manifest paths that resolve outside the local source root", async () => {
  await withFixture(async (fixture) => {
    const outsidePath = join(fixture.outside, "outside.mp4");
    const linkedPath = join(fixture.root, "linked-outside.mp4");
    await writeFile(outsidePath, fixture.mediaBytes);
    await symlink(outsidePath, linkedPath);
    await writeCatalog(fixture, [
      { id: "relative-escape", path: join(fixture.root, "..", "outside-root", "outside.mp4"), bytes: fixture.mediaBytes.length },
      { id: "symlink-escape", path: linkedPath, bytes: fixture.mediaBytes.length },
    ]);

    const relativeEscape = await localSourceMedia(
      sourceRequest("relative-escape"),
      "relative-escape",
      fixture.environment,
    );
    assert.equal(relativeEscape.status, 404);

    const symlinkEscape = await localSourceMedia(
      sourceRequest("symlink-escape"),
      "symlink-escape",
      fixture.environment,
    );
    assert.equal(symlinkEscape.status, 404);
  });
});

test("source media response cancellation settles for a streamed local file", async () => {
  await withFixture(async (fixture) => {
    const largePath = join(fixture.root, "large.mp4");
    await writeFile(largePath, Buffer.alloc(256 * 1024, 7));
    await writeCatalog(fixture, [{ id: "large-source", path: largePath, bytes: 256 * 1024 }]);

    const response = await localSourceMedia(
      sourceRequest("large-source"),
      "large-source",
      fixture.environment,
    );
    assert.equal(response.status, 200);
    const reader = response.body?.getReader();
    assert.ok(reader);
    await reader.read();
    await reader.cancel("test cancellation");
  });
});
