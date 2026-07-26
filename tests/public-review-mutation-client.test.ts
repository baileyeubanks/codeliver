import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("remote frame comments do not upload session-only raster or vector drawings", () => {
  const submit = source("lib/review/submit-review-comment.ts");
  const remoteStart = submit.indexOf(
    "const response = await fetch(`/api/review/${token}/comments`",
  );
  const remoteEnd = submit.indexOf(
    "\n  if (!response.ok)",
    remoteStart,
  );
  assert.notEqual(remoteStart, -1);
  assert.notEqual(remoteEnd, -1);
  const remoteRequest = submit.slice(remoteStart, remoteEnd);

  assert.doesNotMatch(remoteRequest, /\bdrawing\s*:/);
  assert.doesNotMatch(remoteRequest, /\bannotations\s*:/);
  assert.match(remoteRequest, /credentials:\s*"same-origin"/);
  assert.match(remoteRequest, /cache:\s*"no-store"/);
  assert.match(remoteRequest, /referrerPolicy:\s*"no-referrer"/);
});

test("all public-review action requests explicitly carry the admitted browser policy", () => {
  const client = source("components/review/PublicReviewPage.tsx");
  for (const endpoint of ["comments", "edit-decisions", "approvals"]) {
    const start = client.indexOf(
      `fetch(\`/api/review/\${token}/${endpoint}\``,
    );
    assert.notEqual(start, -1, endpoint);
    const request = client.slice(start, start + 900);
    assert.match(request, /credentials:\s*"same-origin"/, endpoint);
    assert.match(request, /cache:\s*"no-store"/, endpoint);
    assert.match(request, /referrerPolicy:\s*"no-referrer"/, endpoint);
  }
});
