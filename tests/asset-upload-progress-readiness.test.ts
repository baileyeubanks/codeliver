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

test("AssetUpload keeps selected files pending while confirming readiness", () => {
  assert.doesNotMatch(uploader, /disabled=\{storage\.phase !== "ready"\}/);
  assert.match(uploader, /void refreshStorageReadiness\(\)\.then\(begin\)/);
  assert.match(uploader, /startTusUpload\(item, readiness\)/);
  assert.doesNotMatch(uploader, /Storage readiness is still being checked. Retry/);
  assert.match(uploader, /refreshStorageReadiness/);
  assert.match(uploader, /aria-label="Retry upload"/);
  assert.match(uploader, /aria-label="Remove failed upload"/);
  assert.doesNotMatch(uploader, /set(?:Timeout|Interval)\(/);
});

test("AssetUpload retry resumes a durable upload instead of terminating it", () => {
  const retryStart = uploader.indexOf("const retryUpload = useCallback");
  const retryEnd = uploader.indexOf("const removeUploadItem", retryStart);
  const retry = uploader.slice(retryStart, retryEnd);

  assert.notEqual(retryStart, -1, "retry handler is present");
  assert.notEqual(retryEnd, -1, "retry handler ends before removal handler");
  assert.match(
    retry,
    /attemptId:\s*item\.attemptId/,
    "a retry must preserve the idempotency key bound to the durable upload",
  );
  assert.doesNotMatch(
    retry,
    /\.abort\(true\)/,
    "a retry must not DELETE an upload whose bytes may already be committed",
  );
  assert.match(
    retry,
    /startTusUpload\(retryItem/,
    "a retry starts a fresh Tus client so it can HEAD and reconcile the stored URL",
  );
});
