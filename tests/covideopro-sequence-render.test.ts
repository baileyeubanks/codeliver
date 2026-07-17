import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { register, registerHooks } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

register("./typescript-resolver.mjs", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

import {
  buildConcatPlan,
  renderConcatPlan,
  type ConcatPlanEntry,
} from "../lib/covideopro/render.ts";

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;
async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

const DEMO_SOURCE = join(repositoryRoot, "public/demo/interview-source.mp4");

const CLIPS = [
  { id: "c1", sequence_id: "s1", asset_id: "a1", version_id: null, select_id: null, track_index: 0, timeline_in_seconds: 0, timeline_out_seconds: 16, source_in_seconds: 6, source_out_seconds: 22 },
  { id: "c2", sequence_id: "s1", asset_id: "a1", version_id: null, select_id: null, track_index: 0, timeline_in_seconds: 16, timeline_out_seconds: 54, source_in_seconds: 40, source_out_seconds: 78 },
];

function resolver(file: string): string | null {
  return file === "/demo/interview-source.mp4" ? DEMO_SOURCE : null;
}

test.beforeEach(async () => {
  (await store()).resetDemoWorkspace();
});

test("concat plan orders clips and validates contiguity and files", () => {
  const plan = buildConcatPlan(
    { id: "s1", fps: 24 },
    [CLIPS[1], CLIPS[0]],
    (assetId) => resolver(assetId === "a1" ? "/demo/interview-source.mp4" : ""),
  );
  assert.deepEqual(plan.map((entry) => entry.clip.id), ["c1", "c2"]);
  assert.deepEqual(plan.map((entry) => entry.file), [DEMO_SOURCE, DEMO_SOURCE]);

  const gapped = buildConcatPlan(
    { id: "s1", fps: 24 },
    [{ ...CLIPS[1], timeline_in_seconds: 20 }],
    () => DEMO_SOURCE,
  );
  assert.deepEqual(gapped, { error: "Timeline is not contiguous for rendering (gap or overlap)." });

  const missing = buildConcatPlan({ id: "s1", fps: 24 }, CLIPS, () => null);
  assert.deepEqual(missing, { error: "Every clip needs a playable source file before rendering." });
});

test("real ffmpeg render produces a file with the assembled duration", { timeout: 180_000 }, async () => {
  const plan = buildConcatPlan({ id: "s1", fps: 24 }, CLIPS, () => DEMO_SOURCE) as ConcatPlanEntry[];
  const outDir = mkdtempSync(join(tmpdir(), "cv-render-"));
  try {
    const result = await renderConcatPlan(plan, join(outDir, "cut.mp4"));
    assert.ok(existsSync(join(outDir, "cut.mp4")), "render writes the output file");
    assert.ok(
      Math.abs(result.durationSeconds - 54) < 1.0,
      `expected ≈54s assembled duration, got ${result.durationSeconds}`,
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("store render flow registers a truthful render asset (injected renderer)", async () => {
  const { renderSequenceToAsset, getDemoWorkspaceSnapshot } = await store();
  const result = await renderSequenceToAsset("seq-pod-radio-cut", {
    render: async () => ({ url: "/demo/renders/seq-pod-radio-cut.mp4", durationSeconds: 92 }),
  });
  assert.equal(result.ok, true);

  const workspace = getDemoWorkspaceSnapshot();
  const renderAsset = workspace.assets.find((asset) => asset.id === result.id);
  assert.equal(renderAsset?.title, "McLaren Podcast — radio cut (render)");
  assert.equal(renderAsset?.file_url, "/demo/renders/seq-pod-radio-cut.mp4");
  assert.equal(renderAsset?.duration_seconds, 92);
  assert.equal(renderAsset?.project_id, "schneider-epc");
  assert.equal(workspace.activity[0]?.action, "rendered_sequence");
});

test("render flow refuses a sequence without playable sources", async () => {
  const { renderSequenceToAsset, createSequenceFromSelects, addSelect } = await store();
  const sel = addSelect({
    projectId: "ica",
    assetId: "kevin-bowers-v2",
    inSeconds: 0,
    outSeconds: 5,
    label: "bite",
    source: "manual",
  });
  assert.equal(sel.ok, true);
  const seq = createSequenceFromSelects({ projectId: "ica", name: "ica cut", selectIds: [sel.id] });
  const result = await renderSequenceToAsset(seq.id, { render: async () => ({ url: "/x.mp4", durationSeconds: 5 }) });
  assert.equal(result.ok, false);
  assert.match(result.reason, /playable source/);
});
