import assert from "node:assert/strict";
import test from "node:test";

import {
  parseUploadChecksum,
  parseUploadMetadata,
  tusHeaders,
} from "../lib/tus/protocol.ts";

function metadata(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
    .join(",");
}

test("tus metadata parsing is bounded and rejects duplicate or malformed values", () => {
  assert.deepEqual(
    parseUploadMetadata(metadata({ filename: "master.mov", projectId: "project-a" })),
    { filename: "master.mov", projectId: "project-a" }
  );
  assert.throws(
    () => parseUploadMetadata("filename YQ==,filename Yg=="),
    /key is invalid/
  );
  assert.throws(() => parseUploadMetadata("filename !!!"), /valid base64/);
  assert.throws(
    () => parseUploadMetadata(`filename ${Buffer.from([0xff]).toString("base64")}`),
    /valid UTF-8/
  );
  assert.throws(
    () => parseUploadMetadata(`filename ${Buffer.from("x".repeat(3_000)).toString("base64")}`),
    /value is too large/
  );
});

test("tus checksum parsing only accepts 32-byte SHA-256 digests", () => {
  const digest = Buffer.alloc(32, 7);
  assert.equal(parseUploadChecksum(`sha256 ${digest.toString("base64")}`), digest.toString("hex"));
  assert.throws(() => parseUploadChecksum("md5 Zm9v"), /must use sha256/);
  assert.throws(
    () => parseUploadChecksum(`sha256 ${Buffer.alloc(31).toString("base64")}`),
    /length is invalid/
  );
});

test("tus discovery advertises checksum and explicit upload limits", () => {
  const headers = tusHeaders(1024n);
  assert.match(headers["Tus-Extension"], /checksum/);
  assert.equal(headers["Tus-Checksum-Algorithm"], "sha256");
  assert.equal(headers["Tus-Max-Size"], "1024");
});
