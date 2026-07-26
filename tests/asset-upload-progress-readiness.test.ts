import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uploader = readFileSync(
  resolve(repositoryRoot, "components/assets/AssetUpload.tsx"),
  "utf8",
);

test("AssetUpload exposes tus byte progress through accessible progress ranges", () => {
  assert.match(uploader, /onProgress\(bytesUploaded, bytesTotal\)/);
  assert.match(uploader, /bytesUploaded,/);
  assert.match(uploader, /bytesTotal,/);
  assert.match(uploader, /role="progressbar"/);
  assert.match(uploader, /aria-valuenow=\{item\.bytesUploaded\}/);
  assert.match(uploader, /aria-valuemax=\{item\.bytesTotal\}/);
  assert.match(uploader, /aria-valuetext=\{`\$\{formatFileSize\(item\.bytesUploaded\)\} of \$\{formatFileSize\(item\.bytesTotal\)\} uploaded/);
});

test("AssetUpload preserves received bytes when tus completes into ready or quarantine", () => {
  assert.match(uploader, /bytesUploaded: item\.bytesTotal,/);
  assert.match(uploader, /status: quarantined \? "quarantined" : "done"/);
  assert.match(uploader, /Upload-State/);
  assert.match(uploader, /Upload-Original-Ready/);
});

test("AssetUpload queues selection during unavailable readiness as an actionable error", () => {
  assert.doesNotMatch(uploader, /disabled=\{storage\.phase !== "ready"\}/);
  assert.match(uploader, /const readinessError = storage\.phase === "ready" \? undefined/);
  assert.match(uploader, /status: tooLarge \|\| readinessError \? "error" : "pending"/);
  assert.match(uploader, /refreshStorageReadiness/);
  assert.match(uploader, /aria-label="Retry upload"/);
  assert.match(uploader, /aria-label="Remove failed upload"/);
  assert.doesNotMatch(uploader, /set(?:Timeout|Interval)\(/);
});
