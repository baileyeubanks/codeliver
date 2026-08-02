import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("managed queued share delivery is rendered as accepted and pending", () => {
  const modal = source("components/sharing/ShareModal.tsx");
  const summaryStart = modal.indexOf("function summarizeNotificationStatus");
  const summaryEnd = modal.indexOf("export default function ShareModal", summaryStart);
  const summary = modal.slice(summaryStart, summaryEnd);

  assert.match(summary, /result\.mode === "queued"\) return "queued"/);
  assert.match(summary, /status === "queued" \|\| status === "sent"/);
  assert.ok(
    summary.indexOf('result.mode === "queued"') < summary.lastIndexOf('return "failed"'),
    "queued mode must be resolved before the failure fallback",
  );
  assert.match(
    modal,
    /notificationStatus === "queued"[\s\S]*accepted for durable delivery\. Delivery is pending\./,
  );
});

test("upload cancellation waits for server termination and remains retryable on failure", () => {
  const uploader = source("components/assets/AssetUpload.tsx");
  const cancelStart = uploader.indexOf("const cancelUpload = useCallback");
  const cancelEnd = uploader.indexOf("const ext =", cancelStart);
  const cancellation = uploader.slice(cancelStart, cancelEnd);

  const abortIndex = cancellation.indexOf("await item.tusUpload.abort(true)");
  const removalIndex = cancellation.indexOf("current.filter");
  assert.ok(abortIndex >= 0, "server termination must be awaited");
  assert.ok(removalIndex > abortIndex, "the queue item must remain until termination succeeds");
  assert.match(cancellation, /catch[\s\S]*cancelling: false/);
  assert.match(cancellation, /The upload remains in the queue; retry cancellation\./);
  assert.match(uploader, /aria-label=\{`Retry cancellation for \$\{item\.file\.name\}`\}/);
  assert.match(uploader, /onClick=\{\(\) => void cancelUpload\(item\.id\)\}/);
});
