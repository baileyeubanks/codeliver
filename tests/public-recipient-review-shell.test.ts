import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceSource = readFileSync(
  resolve(repositoryRoot, "components/review/PublicReviewWorkspace.tsx"),
  "utf8",
);
const workspaceStyles = readFileSync(
  resolve(repositoryRoot, "components/review/PublicReviewWorkspace.module.css"),
  "utf8",
);
const publicReviewSource = readFileSync(
  resolve(repositoryRoot, "app/review/[token]/page.tsx"),
  "utf8",
);

test("public recipient shell remains a slot-only presentation boundary", () => {
  assert.match(workspaceSource, /stage\.media/);
  assert.match(workspaceSource, /stage\.context/);
  assert.match(workspaceSource, /rail\.approval/);
  assert.match(workspaceSource, /rail\.comments\.content/);

  assert.doesNotMatch(workspaceSource, /ProjectCockpit/);
  assert.doesNotMatch(workspaceSource, /useRouter|useParams|useSearchParams/);
  assert.doesNotMatch(workspaceSource, /\bfetch\s*\(/);
  assert.doesNotMatch(workspaceSource, /href=["'`]\/(?:projects|dashboard|reviews)/);
});

test("public review keeps one anchored draft instead of competing rail and canvas composers", () => {
  assert.match(
    publicReviewSource,
    /annotationEnabled=\{canComment && asset\?\.file_type === "video" && !commentDraft\}/,
  );
  assert.match(publicReviewSource, /commentDraft && asset && canComment/);
  assert.match(publicReviewSource, /<InlineReviewComment[\s\S]*?assetType=\{asset\.file_type\}/);
  assert.doesNotMatch(publicReviewSource, /PublicReviewComposer|Review flow|rail:\s*\{[\s\S]*?intro:/);
  assert.doesNotMatch(workspaceSource, /rail\.intro|rail\.composer|Review flow/);
});

test("public recipient shell exposes accessible review and filter landmarks", () => {
  assert.match(workspaceSource, /href="#public-review-workspace"/);
  assert.match(workspaceSource, /<main id="public-review-workspace"/);
  assert.match(workspaceSource, /aria-labelledby="public-review-stage-heading"/);
  assert.match(workspaceSource, /aria-labelledby="public-review-rail-heading"/);
  assert.match(workspaceSource, /role="group" aria-label="Comment filters"/);
  assert.match(workspaceSource, /aria-pressed=\{filter\.active\}/);
  assert.match(workspaceSource, /type="button"/);
});

test("public recipient shell keeps the protected-link access gate", () => {
  assert.match(workspaceSource, /accessGate\?: \{/);
  assert.match(workspaceSource, /if \(accessGate\) \{/);
  assert.match(workspaceSource, /type="password"/);
  assert.match(workspaceSource, /onSubmit=\{accessGate\.onSubmit\}/);
  assert.match(workspaceSource, /disabled=\{accessGate\.submitting \|\| accessGate\.password\.length < 8\}/);
  assert.match(workspaceStyles, /\.accessInput:focus-visible/);
  assert.match(workspaceStyles, /\.accessButton:disabled/);
});

test("public recipient shell uses the canonical Co-VideoPro mark for platform states", () => {
  assert.match(
    workspaceSource,
    /import CoProductionBrand from "@\/components\/brand\/CoProductionBrand"/,
  );
  assert.match(
    workspaceSource,
    /aria-label=\{brand\?\.displayName \?\? "Co-VideoPro by Content Co-op"\}/,
  );
  assert.match(
    workspaceSource,
    /<CoProductionBrand[\s\S]*?className=\{styles\.stateLogo\}/,
  );
  assert.match(
    workspaceSource,
    /<CoProductionBrand[\s\S]*?className=\{styles\.productBrand\}/,
  );
  assert.match(
    workspaceSource,
    /brand\.logoPath\.startsWith\("\/brand\/co-videopro-"\)/,
  );
  assert.match(
    workspaceSource,
    /brand && !usesCanonicalProductBrand \? styles\.customBrand/,
  );
  assert.match(
    workspaceStyles,
    /\.stateLogo\s*\{[\s\S]*?--co-production-brand-width:\s*188px/,
  );
  assert.match(
    workspaceStyles,
    /\.productBrand\s*\{[\s\S]*?--co-production-brand-width:\s*180px/,
  );
  assert.equal(workspaceSource.match(/sizes="188px"/g)?.length, 3);
  assert.match(workspaceSource, /src=\{brand\.logoPath\}[\s\S]*?\bunoptimized\b/);
});

test("public recipient shell keeps the bright frame scoped and responsive", () => {
  assert.match(workspaceSource, /PublicReviewWorkspace\.module\.css/);
  assert.match(workspaceStyles, /\.shell\s*\{[\s\S]*?--surface:\s*#ffffff/);
  assert.match(workspaceStyles, /color-scheme:\s*light/);
  assert.match(workspaceStyles, /\.media\s*\{[\s\S]*?background:\s*#050505/);
  assert.match(workspaceStyles, /@media \(min-width:\s*981px\)/);
  assert.match(
    workspaceStyles,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(360px,\s*390px\)/,
  );
  assert.match(workspaceStyles, /\.rail\s*\{[\s\S]*?min-width:\s*0/);
});
