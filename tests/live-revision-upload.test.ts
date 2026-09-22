import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUploadFingerprintScope,
  buildUploadTargetMetadata,
  parseUploadCompletionReceipt,
  shouldRetryUploadStatus,
  resolveRevisionUploadTarget,
  type RevisionUploadTarget,
} from "../lib/uploads/revision-upload.ts";

const revisionTarget: RevisionUploadTarget = {
  assetId: "asset-a",
  expectedCurrentVersionId: "version-v1",
};

test("revision metadata names the exact asset and current cut without a client version number", () => {
  assert.deepEqual(buildUploadTargetMetadata(revisionTarget), {
    assetId: "asset-a",
    expectedCurrentVersionId: "version-v1",
  });
  assert.deepEqual(buildUploadTargetMetadata(null), { version: "1" });
});

test("revision resume scope changes when its exact current cut changes", () => {
  const initialScope = buildUploadFingerprintScope("project-a", "editor@example.com", "folder-a", null);
  const firstRevisionScope = buildUploadFingerprintScope("project-a", "editor@example.com", "folder-a", revisionTarget);
  const nextRevisionScope = buildUploadFingerprintScope("project-a", "editor@example.com", "folder-a", {
    ...revisionTarget,
    expectedCurrentVersionId: "version-v2",
  });

  assert.notEqual(initialScope, firstRevisionScope);
  assert.notEqual(firstRevisionScope, nextRevisionScope);
  assert.match(firstRevisionScope, /asset-a/);
  assert.match(firstRevisionScope, /version-v1/);
});

test("revision completion requires a matching exact server receipt", () => {
  assert.deepEqual(parseUploadCompletionReceipt({
    get(name: string) {
      return name === "Upload-Asset" ? JSON.stringify({ id: "asset-a" })
        : name === "Upload-Version" ? JSON.stringify({ id: "version-v2", number: 2 })
          : null;
    },
  }, revisionTarget), {
    assetId: "asset-a",
    versionId: "version-v2",
    versionNumber: 2,
    revision: true,
  });

  assert.equal(parseUploadCompletionReceipt({ get: () => null }, revisionTarget), null);
  assert.equal(parseUploadCompletionReceipt({
    get(name: string) {
      return name === "Upload-Asset" ? JSON.stringify({ id: "asset-a" })
        : JSON.stringify({ id: "version-v1", number: 1 });
    },
  }, revisionTarget), null, "the replacement receipt cannot reuse its expected current version");
  assert.equal(parseUploadCompletionReceipt({
    get(name: string) {
      return name === "Upload-Asset" ? JSON.stringify({ id: "asset-other" })
        : JSON.stringify({ id: "version-v2", number: 2 });
    },
  }, revisionTarget), null);
});

test("initial V1 uploads accept a valid receipt and stale revision conflicts do not retry", () => {
  assert.deepEqual(parseUploadCompletionReceipt({
    get(name: string) {
      return name === "Upload-Asset" ? JSON.stringify({ id: "asset-new" })
        : name === "Upload-Version" ? JSON.stringify({ id: "version-v1", number: 1 })
          : null;
    },
  }, null), {
    assetId: "asset-new",
    versionId: "version-v1",
    versionNumber: 1,
    revision: false,
  });
  assert.equal(shouldRetryUploadStatus(409, true), false);
  assert.equal(shouldRetryUploadStatus(409, false), true);
  assert.equal(shouldRetryUploadStatus(423), true);
  assert.equal(shouldRetryUploadStatus(429), true);
});


test("revision target accepts only the authoritative asset scope and current version", () => {
  assert.deepEqual(resolveRevisionUploadTarget({
    id: "asset-a",
    project_id: "project-a",
    current_version: { id: "version-v1" },
  }, "project-a", "asset-a"), revisionTarget);

  assert.equal(resolveRevisionUploadTarget({
    id: "asset-a",
    project_id: "project-other",
    current_version: { id: "version-v1" },
  }, "project-a", "asset-a"), null, "a valid asset from another project cannot become a target");
  assert.equal(resolveRevisionUploadTarget({
    id: "asset-a",
    project_id: "project-a",
    current_version: null,
  }, "project-a", "asset-a"), null, "an unversioned asset has no replacement target");
});
