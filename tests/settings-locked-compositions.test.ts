import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const frameSource = readFileSync(
  new URL("../components/auth/SettingsFrame.tsx", import.meta.url),
  "utf8",
);
const pillarStyles = readFileSync(
  new URL("../components/auth/SettingsPillar.module.css", import.meta.url),
  "utf8",
);

test("mobile settings uses a dedicated route-backed section picker", () => {
  assert.match(frameSource, /htmlFor="settings-section-select"/);
  assert.match(frameSource, /value=\{activeTab\}/);
  assert.match(
    frameSource,
    /onTabChange\(event\.target\.value as SettingsTab\)/,
  );
  assert.match(pillarStyles, /\.mobileSectionPicker\s*\{[\s\S]*display:\s*none/);
  assert.match(
    pillarStyles,
    /@media \(max-width: 900px\)[\s\S]*\.nav\s*\{\s*display:\s*none/,
  );
  assert.match(
    pillarStyles,
    /@media \(max-width: 900px\)[\s\S]*\.mobileSectionPicker\s*\{[\s\S]*display:\s*grid/,
  );
});

test("settings navigation has no horizontal scrolling fallback", () => {
  assert.doesNotMatch(pillarStyles, /overflow-x:\s*auto/);
  assert.doesNotMatch(frameSource, /scrollLeft|ResizeObserver/);
});
