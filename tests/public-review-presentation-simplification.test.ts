import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("public review keeps the player first and removes repeated presentation chrome", () => {
  const workspace = source("components/review/PublicReviewWorkspace.tsx");
  const styles = source("components/review/PublicReviewWorkspace.module.css");

  assert.match(workspace, /className=\{styles\.stageToolbar\}/);
  assert.match(workspace, /className=\{styles\.visuallyHidden\}/);
  assert.match(workspace, /\{stage\.context \? \(/);
  assert.doesNotMatch(workspace, /Clapperboard|MessageSquareText|ListChecks/);
  assert.doesNotMatch(workspace, /commentsTitleRow/);

  assert.match(styles, /\.rail\s*\{[\s\S]*?display:\s*flex/);
  assert.match(styles, /@media \(min-width:\s*981px\)[\s\S]*?\.composer\s*\{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(styles, /@media \(min-width:\s*981px\)[\s\S]*?\.rail\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles, /@media \(min-width:\s*981px\)[\s\S]*?\.comments\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /\.visuallyHidden\s*\{/);
});

test("review metadata and secondary tools use disclosure while primary review controls stay explicit", () => {
  const page = source("components/review/PublicReviewPage.tsx");

  assert.match(page, /<details className="client-review-tools">/);
  assert.match(page, /<summary>Review details<\/summary>/);
  assert.match(page, /<VersionSwitcher\b/);
  assert.match(page, /<InlineReviewComment\b/);
  assert.doesNotMatch(page, /<PublicReviewComposer\b/);
  assert.doesNotMatch(page, /composer:/);
  assert.match(page, /guestFilmAllowsComments\(token, permissions\)/);
  assert.match(page, /permissions === "approve"/);
  assert.match(page, /<details className="review-timeline-help">/);

  assert.doesNotMatch(page, /client-review-page-description/);
  assert.doesNotMatch(page, /client-review-intent-badge/);
  assert.match(page, /isSourcePreview && orderedVersions\.length === 1/);
  assert.match(page, />Imported file<\/span>/);
});
