import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reviewPage = readFileSync(
  new URL("../components/review/PublicReviewPage.tsx", import.meta.url),
  "utf8",
);
const cockpit = readFileSync(
  new URL("../components/projects/ProjectCockpit.tsx", import.meta.url),
  "utf8",
);

test("a local review link keeps its asset, version, and media source authoritative", () => {
  assert.match(
    reviewPage,
    /requestedDemoShare\?\.asset_ids\[0\] \?\? searchParams\.get\("asset"\)/,
  );
  assert.match(reviewPage, /resolvePinnedDemoMediaVersion\(/);
  assert.match(
    reviewPage,
    /requestedDemoRequiresExactVersion && !selectedDemoLocalVersion/,
  );
  assert.match(
    reviewPage,
    /demoMediaUrl \?\? selectedDemoLocalVersion\.source_url \?\? ""/,
  );
  assert.match(
    reviewPage,
    /demoMode && activeVersion[\s\S]*activeVersion\.file_url \|\| null/,
  );
  assert.doesNotMatch(reviewPage, /activeVersion\?\.file_url \|\| asset\?\.file_url/);
});

test("the cockpit cannot replace a missing V2 blob with its imported source base", () => {
  assert.match(cockpit, /activeDemoVersion\?\.source_url/);
  assert.match(cockpit, /versionedDemoActive\s*\?\s*null/);
  assert.match(cockpit, /replacementOfImportedSource/);
  assert.match(cockpit, /onUploadRevision/);
});
