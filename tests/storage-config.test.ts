import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readStorageConfig } from "../lib/storage/config.ts";
import { createStorageRuntime } from "../lib/storage/runtime.ts";

test("storage stays fail-closed without an explicit provider", async () => {
  const runtime = createStorageRuntime({});
  const readiness = await runtime.adapter.diagnose();

  assert.equal(runtime.config.provider, "unconfigured");
  assert.equal(readiness.configured, false);
  assert.equal(readiness.readyForWrites, false);
});

test("filesystem writes require an explicit root and write authority", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-config-"));
  try {
    const disabled = createStorageRuntime({
      CODELIVER_STORAGE_PROVIDER: "local",
      CODELIVER_LOCAL_STORAGE_ROOT: root,
      CODELIVER_STORAGE_RESERVED_BYTES: "0",
    });
    assert.equal((await disabled.adapter.diagnose()).readyForWrites, false);

    const enabled = createStorageRuntime({
      CODELIVER_STORAGE_PROVIDER: "local",
      CODELIVER_LOCAL_STORAGE_ROOT: root,
      CODELIVER_STORAGE_WRITE_ENABLED: "1",
      CODELIVER_STORAGE_RESERVED_BYTES: "0",
    });
    assert.equal((await enabled.adapter.diagnose()).readyForWrites, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("relative roots are rejected instead of being resolved implicitly", () => {
  const config = readStorageConfig({
    CODELIVER_STORAGE_PROVIDER: "local",
    CODELIVER_LOCAL_STORAGE_ROOT: "./media",
    CODELIVER_STORAGE_WRITE_ENABLED: "1",
  });

  assert.equal(config.filesystemRoot, null);
  assert.match(config.issues.join(" "), /absolute path/);
});

test("Google Drive readiness validates configuration without granting writes", async () => {
  const secret = "drive-token-that-must-not-leak";
  const runtime = createStorageRuntime({
    CODELIVER_STORAGE_PROVIDER: "google-drive",
    CODELIVER_STORAGE_WRITE_ENABLED: "1",
    GOOGLE_DRIVE_FOLDER_ID: "folder-id",
    GOOGLE_DRIVE_ACCESS_TOKEN: secret,
  });
  const readiness = await runtime.adapter.diagnose();

  assert.equal(readiness.configured, true);
  assert.equal(readiness.writeEnabled, true);
  assert.equal(readiness.readyForWrites, false);
  assert.match(JSON.stringify(readiness), /write transport is not enabled/i);
  assert.doesNotMatch(JSON.stringify(readiness), new RegExp(secret));
  await assert.rejects(
    () => runtime.adapter.beginMultipart("9e238da2-33c1-4fe5-a371-83dd65ca7c11"),
    /writes are unavailable/
  );
});
