import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_COCKPIT_LAYOUT,
  applyCockpitMode,
  cockpitLayoutStorageKey,
  normalizeCockpitLayout,
  parseCockpitLayout,
} from "../components/cockpit/cockpit-layout.ts";

test("invalid or stale cockpit layouts fail closed to supported values", () => {
  assert.deepEqual(parseCockpitLayout("not-json"), DEFAULT_COCKPIT_LAYOUT);
  assert.deepEqual(normalizeCockpitLayout(null), DEFAULT_COCKPIT_LAYOUT);
  assert.deepEqual(
    normalizeCockpitLayout({
      version: 99,
      mode: "unknown",
      rail: "wide",
      dockOpen: "yes",
      dockTab: "transcript",
      density: "tiny",
    }),
    DEFAULT_COCKPIT_LAYOUT,
  );
});

test("valid persisted fields survive normalization", () => {
  assert.deepEqual(
    normalizeCockpitLayout({
      version: 2,
      mode: "edit",
      rail: "compact",
      dockOpen: false,
      dockTab: "inspector",
      density: "comfortable",
    }),
    {
      version: 2,
      mode: "edit",
      rail: "compact",
      dockOpen: false,
      dockTab: "inspector",
      density: "comfortable",
    },
  );
});

test("pre-simplification layouts close the dock once while preserving rail preference", () => {
  const migrated = normalizeCockpitLayout({ version: 1, rail: "compact", dockOpen: true });
  assert.equal(migrated.dockOpen, false);
  assert.equal(migrated.rail, "compact");
  assert.equal(normalizeCockpitLayout({ ...DEFAULT_COCKPIT_LAYOUT, dockOpen: true }).dockOpen, true);
});

test("workspace modes apply deterministic operator presets", () => {
  const edit = applyCockpitMode(DEFAULT_COCKPIT_LAYOUT, "edit");
  assert.equal(edit.rail, "compact");
  assert.equal(edit.dockOpen, true);
  assert.equal(edit.dockTab, "versions");

  const focus = applyCockpitMode(edit, "focus");
  assert.equal(focus.rail, "compact");
  assert.equal(focus.dockOpen, false);

  const review = applyCockpitMode(focus, "review");
  assert.deepEqual(review, DEFAULT_COCKPIT_LAYOUT);
});

test("layout storage is project-scoped and versioned", () => {
  assert.equal(cockpitLayoutStorageKey("ica"), "co-deliver.cockpit-layout.v2:ica");
  assert.notEqual(cockpitLayoutStorageKey("ica"), cockpitLayoutStorageKey("other-project"));
});
