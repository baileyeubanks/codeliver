import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config.ts";

test("local media flows through the Next image optimizer", () => {
  assert.notEqual(
    nextConfig.images?.unoptimized,
    true,
    "the July 2026 unoptimized bypass is retired: the optimizer's headerless internal fetch is admitted by the host gate, so /_next/image serves local brand and thumbnail assets again",
  );
});
