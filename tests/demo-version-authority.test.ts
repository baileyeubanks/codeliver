import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { demoReviewPayload } from "../lib/review/demoReview.ts";
import { selectReportComments } from "../lib/review/report.ts";
import type { Comment, Version } from "../lib/types/codeliver.ts";

type DemoVersionAuthorityModule = {
  buildDemoVersionAuthority(input: {
    assetId: string;
    versionCount: number;
    fileUrl: string;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    createdAt: string;
    seededVersions: readonly Version[];
    sourceMetadata?: {fileSize:number; resolution:string};
  }): { current: Version; versions: Version[] };
  bindDemoReviewComments(
    comments: readonly Comment[],
    assetId: string,
  ): Comment[];
};

async function loadAuthority(): Promise<DemoVersionAuthorityModule | null> {
  return import("../lib/review/demo-version-authority.ts").catch(() => null);
}

test("workspace current version owns the demo review without relabeling other-version notes", async () => {
  const authorityModule = await loadAuthority();
  assert.ok(authorityModule, "demo version authority helper must exist");

  const authority = authorityModule.buildDemoVersionAuthority({
    assetId: "workspace-asset",
    versionCount: 4,
    fileUrl: "/demo/ica-ceo-preview.mp4",
    thumbnailUrl: "/demo/ceraweek-speaker.jpg",
    durationSeconds: 71,
    createdAt: "2026-07-14T21:53:00.000Z",
    seededVersions: demoReviewPayload.versions,
  });

  assert.equal(authority.current.id, "demo-version-4");
  assert.equal(authority.current.version_number, 4);
  assert.deepEqual(
    authority.versions.map((version) => version.version_number),
    [4, 3, 2, 1],
  );
  assert.deepEqual(
    authority.versions.filter((version) => version.is_current).map((version) => version.id),
    ["demo-version-4"],
  );
  assert.ok(authority.versions.every((version) => version.asset_id === "workspace-asset"));

  const seed = demoReviewPayload.comments[0]!;
  const comments = authorityModule.bindDemoReviewComments(
    [
      seed,
      { ...seed, id: "current-note", version_id: "demo-version-4" },
      { ...seed, id: "older-note", version_id: "demo-version-2" },
    ],
    "workspace-asset",
  );

  assert.deepEqual(
    comments.map((comment) => comment.version_id),
    [null, "demo-version-4", "demo-version-2"],
  );
  assert.ok(comments.every((comment) => comment.asset_id === "workspace-asset"));

  const reportInput = {
    assetId: "workspace-asset",
    assetTitle: "Demo",
    projectName: "Project",
    versionNumber: 4,
    approvalLabel: "In review",
    comments,
  };
  assert.deepEqual(
    selectReportComments({ ...reportInput, versionId: authority.current.id }).map(
      (comment) => comment.id,
    ),
    [seed.id, "current-note"],
  );
  assert.deepEqual(
    selectReportComments({ ...reportInput, versionId: "demo-version-2" }).map(
      (comment) => comment.id,
    ),
    [seed.id, "older-note"],
  );
});

test("public demo loader uses one authority for its current version and seeded comments", () => {
  const source = readFileSync(
    new URL("../components/review/PublicReviewPage.tsx", import.meta.url),
    "utf8",
  );
  const demoBranch = source.slice(
    source.indexOf("if (demoMode) {"),
    source.indexOf("const payload = await loadAdmittedPublicReview(token)"),
  );

  assert.match(demoBranch, /buildDemoVersionAuthority\(/);
  assert.match(demoBranch, /const publicVersionId = demoVersionAuthority\.current\.id/);
  assert.match(demoBranch, /comments: bindDemoReviewComments\(/);
  assert.match(demoBranch, /const demoVersion = demoVersionAuthority\.current/);
  assert.match(demoBranch, /const versionList = demoVersionAuthority\.versions/);
  assert.doesNotMatch(demoBranch, /demoReviewPayload\.comments\.map/);
});

test("source representation uses measured metadata without inventing archive versions", async () => {
  const module = await loadAuthority(); assert.ok(module);
  const input = {assetId:"aayush-v2",versionCount:1,fileUrl:"/api/demo/source-media/aayush-v2?demo=1",thumbnailUrl:null,durationSeconds:123.248,createdAt:"2026-09-09T00:00:00Z",seededVersions:[],sourceMetadata:{fileSize:235134905,resolution:"1280 × 720"}};
  const result = module.buildDemoVersionAuthority(input);
  assert.equal(result.versions.length,1);
  assert.equal(result.current.id,"source-version-aayush-v2");
  assert.equal(result.current.resolution,"1280 × 720");
  assert.equal(result.current.file_size,235134905);
  assert.match(result.current.notes ?? "",/archive version lineage is not established/);
  assert.notEqual(result.current.id,module.buildDemoVersionAuthority({...input,assetId:"other-source"}).current.id);
});
