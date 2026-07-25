import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(resolve(repositoryRoot, "scripts/verify-runtime.sh"), "utf8");

test("runtime verification rejects successful launch-editor behavior", () => {
  assert.match(script, /__nextjs_launch-editor\?file=package\.json/);
  assert.match(script, /2\*\) fail "Next\.js editor endpoint returned HTTP \$editor_status"/);
  assert.match(script, /launch\.\?editor\|open in editor/);
});

test("runtime verification rejects RSC server errors and stack or source-path leaks", () => {
  assert.match(script, /rsc_status="\$\(status_for/);
  assert.match(script, /5\*\) fail "malformed RSC request returned server error HTTP \$rsc_status"/);
  assert.match(script, /webpack-internal:|file:/);
  assert.match(script, /node_modules\/next\/dist\/.+runtime\\\.\(dev\|development\)/);
});

test("runtime verification checks every browser chunk map actually served by the login page", () => {
  assert.match(script, /login_html="\$tmp_dir\/login\.html"/);
  assert.match(script, /grep -oE '\/_next\/static/);
  assert.match(script, /sort -u/);
  assert.match(script, /404\|410/);
  assert.match(script, /\(\( map_count > 0 \)\) \|\| fail/);
});
