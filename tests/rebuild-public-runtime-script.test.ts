import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(
  resolve(repositoryRoot, "scripts/rebuild-public-runtime.sh"),
  "utf8",
);

test("public runtime rebuild derives the project root from its own location", () => {
  assert.match(script, /SCRIPT_DIR="\$\{0:A:h\}"/);
  assert.match(script, /APP_DIR="\$\{SCRIPT_DIR:h\}"/);
  assert.doesNotMatch(script, /\/Users\/[^"\s]+/);
});

test("public runtime rebuild validates the repository before build or process actions", () => {
  const contractStart = script.indexOf('required_file="$APP_DIR/package.json"');
  const contractFailure = script.indexOf("exit 1", contractStart);
  const dependencyInstall = script.indexOf("npm ci");
  const build = script.indexOf("npm run build");
  const processLookup = script.indexOf("lsof -nP -tiTCP");
  const processStop = script.indexOf("kill -TERM");
  const processStart = script.indexOf("npm run start");

  assert.ok(contractStart >= 0, "package.json must be part of the repository contract");
  assert.match(script, /required_directory="\$APP_DIR\/app"/);
  assert.match(script, /required_file="\$APP_DIR\/next\.config\.ts"/);
  assert.ok(contractFailure > contractStart, "an invalid repository must exit non-zero");

  for (const [label, action] of [
    ["clean dependency install", dependencyInstall],
    ["build", build],
    ["process lookup", processLookup],
    ["process stop", processStop],
    ["process start", processStart],
  ] as const) {
    assert.ok(action > contractFailure, `${label} must happen only after contract validation`);
  }
});

test("public runtime rebuild only replaces one verified app-owned Next dev or production listener", () => {
  assert.match(script, /lsof -nP -tiTCP:"\$PORT" -sTCP:LISTEN/);
  assert.match(script, /listener_pids=\(\)/);
  assert.match(script, /if \[\[ -n "\$listener_output" \]\]/);
  assert.match(script, /\(\( \$\{#listener_pids\[@\]\} > 1 \)\)/);
  assert.match(script, /lsof -a -p "\$existing_pid" -d cwd -Fn/);
  assert.match(script, /ps -p "\$existing_pid" -o command=/);
  assert.match(script, /"\$process_command" != \*"next dev"\*/);
  assert.match(script, /"\$process_command" != \*"next start"\*/);
  assert.match(script, /"\$process_command" != \*"next-server"\*/);
  assert.match(script, /listener changed during validation/);
  assert.match(script, /kill -TERM "\$existing_pid"/);
  assert.match(script, /was reclaimed after the verified runtime stopped/);
  assert.match(script, /refusing to force kill/);
  assert.doesNotMatch(script, /xargs kill/);
});

test("public runtime rebuild starts the package production start command on the selected port", () => {
  assert.match(script, /PORT="\$PORT" exec npm run start/);
  assert.match(script, /invalid PORT/);
});
