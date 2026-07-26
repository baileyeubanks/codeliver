import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(repositoryRoot, "lib/review/public-admission-client.ts"),
  "utf8",
);

test("the production review client explicitly admits before reading the private payload", () => {
  const admissionFetch = source.indexOf(
    "await renewPublicReviewAdmission(token, options)",
  );
  const payloadFetch = source.indexOf(
    "const response = await fetch(reviewPath(token)",
  );

  assert.notEqual(admissionFetch, -1);
  assert.notEqual(payloadFetch, -1);
  assert.equal(admissionFetch < payloadFetch, true);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /"Content-Type":\s*"application\/json"/);
  assert.match(source, /body:\s*"\{\}"/);
});
