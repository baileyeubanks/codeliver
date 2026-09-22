import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { publishImmutableDirectory } from "../lib/storage/atomic-directory-publication.ts";

function candidate(root: string, name: string, payload: string): string {
  const directory = join(root, name);
  mkdirSync(directory);
  writeFileSync(join(directory, "master.mov"), payload, { mode: 0o400 });
  return directory;
}

test("nonempty directory publication lets exactly one concurrent writer win", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-directory-publish-"));
  const destination = join(root, "v00000001");
  const first = candidate(root, ".first.tmp", "first-bytes");
  const second = candidate(root, ".second.tmp", "second-bytes");

  try {
    const results = await Promise.allSettled([
      publishImmutableDirectory(first, destination),
      publishImmutableDirectory(second, destination),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(String((rejected[0] as PromiseRejectedResult).reason), /overwrite refused/i);

    const winner = readFileSync(join(destination, "master.mov"), "utf8");
    assert.ok(winner === "first-bytes" || winner === "second-bytes");
    assert.equal(
      readFileSync(join(destination, "master.mov"), "utf8"),
      winner,
      "the losing publish must not replace the winner",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory publication refuses an existing nonempty destination", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-directory-conflict-"));
  const destination = candidate(root, "v00000001", "committed-bytes");
  const replacement = candidate(root, ".replacement.tmp", "replacement-bytes");

  try {
    await assert.rejects(
      () => publishImmutableDirectory(replacement, destination),
      /overwrite refused/i,
    );
    assert.equal(
      readFileSync(join(destination, "master.mov"), "utf8"),
      "committed-bytes",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
