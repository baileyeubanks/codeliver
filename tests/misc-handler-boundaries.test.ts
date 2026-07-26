import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("misc handlers contain explicit opaque backend response paths", () => {
  for (const path of [
    "app/api/ai/brand-check/route.ts", "app/api/ai/summarize/route.ts", "app/api/ai/transcribe/route.ts",
    "app/api/comments/attachments/route.ts", "app/api/comments/reactions/route.ts", "app/api/sharing/analytics/route.ts",
    "app/api/versions/compare/route.ts", "app/api/transcode/worker/route.ts", "app/api/media/transcode/route.ts",
  ]) {
    const source = readFileSync(resolve(root, path), "utf8");
    assert.match(source, /BACKEND_UNAVAILABLE|backendUnavailable\(|status >= 500/);
    assert.match(source, /apiJson|apiError|NextResponse/);
  }
});
