import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("Copilot failures preserve the current composer without claiming durable storage", () => {
  const panel = source("components/copilot/CopilotPanel.tsx");

  assert.match(panel, /setDraft\(trimmed\)/);
  assert.match(panel, /Your question remains in the composer; try again\./);
  assert.doesNotMatch(panel, /Your question is saved/);
});

test("project Copilot placement stays scoped and clears desktop player controls", () => {
  const styles = source("app/globals.css");

  assert.match(
    styles,
    /@media \(min-width: 901px\) \{[\s\S]*?body:has\(\.cockpit-shell\) \.cvp-copilot-pill \{[\s\S]*?bottom: 96px/,
  );
});
