import assert from "node:assert/strict";
import test from "node:test";
import { readStorageConfig } from "../lib/storage/config.ts";

test("required ClamAV caps the upload budget before bytes are accepted", () => {
  for (const provider of ["local", "ccnas", "google-drive", "object-store"]) {
    const config = readStorageConfig({
      CODELIVER_STORAGE_PROVIDER: provider,
      CODELIVER_CLAMSCAN_PATH: "/opt/homebrew/bin/clamscan",
    });
    assert.equal(config.maxUploadBytes, 2_000_000_000n);
  }
});

test("required ClamAV preserves a lower configured upload budget", () => {
  const config = readStorageConfig({
    CODELIVER_CLAMSCAN_PATH: "/opt/homebrew/bin/clamscan",
    CODELIVER_STORAGE_MAX_UPLOAD_BYTES: "400000000",
  });
  assert.equal(config.maxUploadBytes, 400_000_000n);
});

test("scanner cap does not alter unconfigured or explicit local-demo policy", () => {
  for (const env of [
    {},
    { CODELIVER_CLAMSCAN_PATH: "  " },
    { CODELIVER_STORAGE_PROVIDER: "local", CODELIVER_MALWARE_POLICY: "allow-local-demo", CODELIVER_CLAMSCAN_PATH: "/opt/homebrew/bin/clamscan" },
  ]) {
    assert.equal(readStorageConfig(env).maxUploadBytes, 12n * 1024n ** 3n);
  }
});

test("explicitly raised limits cannot exceed the required scanner ceiling", () => {
  assert.equal(readStorageConfig({
    CODELIVER_CLAMSCAN_PATH: "/opt/homebrew/bin/clamscan",
    CODELIVER_STORAGE_MAX_UPLOAD_BYTES: "999999999999",
  }).maxUploadBytes, 2_000_000_000n);
});
