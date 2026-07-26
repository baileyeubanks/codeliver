import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config.ts";

test("local media bypasses the broken Next image optimizer", () => {
  assert.equal(
    nextConfig.images?.unoptimized,
    true,
    "valid local media must render from its source URL instead of /_next/image",
  );
});
