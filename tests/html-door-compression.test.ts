import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import nextConfig from "../next.config.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configSource = readFileSync(resolve(repositoryRoot, "next.config.ts"), "utf8");

test("Next origin compression stays off so Cloudflare HTML doors stay documents", () => {
  assert.equal(
    nextConfig.compress,
    false,
    "next.config compress must be false. Next defaults to true. A missing flag gzips Accept-Encoding: gzip, and the Cloudflare tunnel returns a 0-byte HTML body on https://co-videopro.com and https://client.contentco-op.com (hang or file download).",
  );
  assert.match(
    configSource,
    /compress:\s*false/,
    "compress: false must stay a literal in next.config.ts. An env toggle could turn origin gzip back on in production without a source diff.",
  );
});
