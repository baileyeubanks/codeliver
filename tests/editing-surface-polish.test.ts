import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

test("sequences render one active timeline and keep imported projects honest about missing work", () => {
  const component = source("components/projects/ProjectRecordSections.tsx");

  assert.match(component, /const \[activeSequenceId, setActiveSequenceId\]/);
  assert.match(component, /const activeSequence = sequences\.find/);
  assert.equal((component.match(/<SequenceTimeline/g) ?? []).length, 1);
  assert.match(component, /<SequenceTimeline\s+key=\{activeSequence\.id\}/);
  assert.match(component, /No local sequence assembly or transcript selects are recorded for this imported project\./);
  assert.match(component, /No transcript-backed or manual selects are recorded for this imported project\./);
  assert.match(component, /const transcriptAssets = sourceCatalog \? \[\] : workspace\.assets/);
});

test("timeline selection exposes its exact source and record range and works by keyboard", () => {
  const component = source("components/projects/SequenceTimeline.tsx");

  assert.match(component, /source \$\{fmt\(selected\.source_in_seconds\)\}→\$\{fmt\(selected\.source_out_seconds\)\}/);
  assert.match(component, /record \$\{fmt\(selected\.timeline_in_seconds\)\}→\$\{fmt\(selected\.timeline_out_seconds\)\}/);
  assert.match(component, /aria-valuemin=\{0\}/);
  assert.match(component, /event\.key === "ArrowRight"/);
  assert.match(component, /event\.key === "ArrowLeft"/);
  assert.match(component, /event\.key !== "Enter" && event\.key !== " "/);
});
