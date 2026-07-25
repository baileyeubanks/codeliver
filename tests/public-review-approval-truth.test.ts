import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = readFileSync(
  resolve(repositoryRoot, "app/review/[token]/page.tsx"),
  "utf8",
);

test("public review exposes one approval mutation path", () => {
  assert.match(pageSource, /recordDemoPublicReviewApproval/);
  assert.doesNotMatch(pageSource, /FinishReviewBar/);
  assert.doesNotMatch(pageSource, /finishDemoReview/);
});

test("public review omits the numbered instruction panel", () => {
  assert.match(pageSource, /intro:\s*null/);
  assert.doesNotMatch(pageSource, /stepThreeText/);
  assert.doesNotMatch(pageSource, />1\.<\/span>|>2\.<\/span>|>3\.<\/span>/);
});
