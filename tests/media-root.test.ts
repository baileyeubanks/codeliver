import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  DEFAULT_MEDIA_ROOT,
  ensureUploadStagingDirectory,
  ensureTranscodeOutputDirectories,
  isSafeUploadId,
  requireConfiguredMediaRoot,
  resolveMediaPath,
  resolveMediaRoot,
  transcodeOutputDirectories,
  uploadStagingDirectory,
} from "../lib/storage/media-root.ts";

test("media root resolution is absolute and has a stable fallback", () => {
  assert.equal(resolveMediaRoot(undefined), DEFAULT_MEDIA_ROOT);
  assert.equal(resolveMediaRoot(" ./media "), resolve("./media"));
});

test("media writes require an explicitly configured absolute root", () => {
  assert.throws(() => requireConfiguredMediaRoot(undefined), /explicitly configured/);
  assert.throws(() => requireConfiguredMediaRoot("./media"), /absolute path/);
  assert.equal(requireConfiguredMediaRoot("/tmp/codeliver"), "/tmp/codeliver");
});

test("staging storage is created lazily", () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-media-root-"));
  const staging = uploadStagingDirectory(root);

  try {
    assert.equal(existsSync(staging), false);
    assert.equal(ensureUploadStagingDirectory(root), staging);
    assert.equal(existsSync(staging), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcode output storage is created lazily", () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-transcode-root-"));
  const directories = transcodeOutputDirectories(root);

  try {
    assert.equal(existsSync(directories.proxyRoot), false);
    assert.equal(existsSync(directories.thumbnailRoot), false);
    assert.deepEqual(ensureTranscodeOutputDirectories(root), directories);
    assert.equal(existsSync(directories.proxyRoot), true);
    assert.equal(existsSync(directories.thumbnailRoot), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("media paths cannot escape the configured storage root", () => {
  const root = resolve("/tmp/codeliver-media-root");
  assert.equal(
    resolveMediaPath("project-id/video.mp4", root),
    join(root, "project-id", "video.mp4")
  );
  assert.throws(
    () => resolveMediaPath("../outside.mp4", root),
    /escapes the configured storage root/
  );
  assert.throws(
    () => resolveMediaPath("/absolute/video.mp4", root),
    /must be a non-empty relative path/
  );
});

test("upload ids are restricted to generated UUIDs", () => {
  assert.equal(isSafeUploadId("9e238da2-33c1-4fe5-a371-83dd65ca7c11"), true);
  assert.equal(isSafeUploadId("../../outside"), false);
  assert.equal(isSafeUploadId("not-a-real-upload"), false);
});
