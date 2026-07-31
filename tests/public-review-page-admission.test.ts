import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(repositoryRoot, "app/review/[token]/page.tsx"),
  "utf8",
);

test("the review document probes existence without consuming a final-view admission", () => {
  assert.doesNotMatch(source, /getReviewInviteByToken/);
  assert.doesNotMatch(source, /admitReviewInvite/);
  assert.match(source, /if \(!isOpaqueRouteToken\(token\)\) notFound\(\)/);
  assert.match(source, /probeReviewDocumentAuthority\(token\)/);
  assert.match(source, /return <PublicReviewPage \/>/);
});

test("the bearer-token review document is no-referrer and not indexable", () => {
  assert.match(source, /referrer:\s*"no-referrer"/);
  assert.match(
    source,
    /robots:\s*\{[\s\S]*index:\s*false[\s\S]*follow:\s*false/,
  );
});
