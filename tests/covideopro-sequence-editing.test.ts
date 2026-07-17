import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { register, registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
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

import { edlFilename, generateEdl, secondsToTimecode } from "../lib/covideopro/edl.ts";

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;
async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

test.beforeEach(async () => {
  (await store()).resetDemoWorkspace();
});

test("timecode conversion is frame-accurate at 24fps", () => {
  assert.equal(secondsToTimecode(0, 24), "00:00:00:00");
  assert.equal(secondsToTimecode(6, 24), "00:00:06:00");
  assert.equal(secondsToTimecode(22.5, 24), "00:00:22:12");
  assert.equal(secondsToTimecode(3661.25, 24), "01:01:01:06");
});

test("EDL export emits ordered CMX 3600 events with source and record times", () => {
  const edl = generateEdl(
    { name: "McLaren Podcast — radio cut", fps: 24 },
    [
      { clip: { id: "c2", sequence_id: "s", asset_id: "a", version_id: null, select_id: null, track_index: 0, timeline_in_seconds: 16, timeline_out_seconds: 54, source_in_seconds: 40, source_out_seconds: 78 }, reel: "podcast", clipName: "Podcast_v3" },
      { clip: { id: "c1", sequence_id: "s", asset_id: "a", version_id: null, select_id: "sel-1", track_index: 0, timeline_in_seconds: 0, timeline_out_seconds: 16, source_in_seconds: 6, source_out_seconds: 22 }, reel: "podcast", clipName: "Podcast_v3" },
    ],
  );

  const lines = edl.split("\n");
  assert.equal(lines[0], "TITLE: McLaren Podcast — radio cut");
  assert.equal(lines[1], "FCM: NON-DROP FRAME");
  assert.match(lines[3], /^001  podcast  V     C        00:00:06:00 00:00:22:00 00:00:00:00 00:00:16:00$/);
  assert.equal(lines[4], "* FROM CLIP NAME: Podcast_v3");
  assert.equal(lines[5], "* SELECT: sel-1");
  assert.match(lines[6], /^002  podcast  V     C        00:00:40:00 00:01:18:00 00:00:16:00 00:00:54:00$/);
  assert.equal(edlFilename({ name: "McLaren Podcast — radio cut" }), "mclaren-podcast-radio-cut.edl");
});

test("trim adjusts source range and ripples later clips", async () => {
  const { trimSequenceClip, getDemoWorkspaceSnapshot } = await store();

  const trimmed = trimSequenceClip({ clipId: "clip-pod-2", sourceIn: 46, sourceOut: 78 });
  assert.equal(trimmed.ok, true);

  const clips = getDemoWorkspaceSnapshot().sequenceClips
    .filter((clip) => clip.sequence_id === "seq-pod-radio-cut")
    .sort((a, b) => a.timeline_in_seconds - b.timeline_in_seconds);
  // clip 2 lost 6s at its head: [16,54) → [16,48), clip 3 ripples left.
  assert.deepEqual(clips.map((clip) => [clip.timeline_in_seconds, clip.timeline_out_seconds]), [[0, 16], [16, 48], [48, 86]]);
  assert.deepEqual([clips[1].source_in_seconds, clips[1].source_out_seconds], [46, 78]);

  const invalid = trimSequenceClip({ clipId: "clip-pod-2", sourceIn: 78, sourceOut: 46 });
  assert.equal(invalid.ok, false, "inverted ranges rejected");
});

test("split divides a clip at the playhead with correct source offsets", async () => {
  const { splitSequenceClip, getDemoWorkspaceSnapshot } = await store();

  const split = splitSequenceClip({ clipId: "clip-pod-1", atTimelineSeconds: 6 });
  assert.equal(split.ok, true);

  const clips = getDemoWorkspaceSnapshot().sequenceClips
    .filter((clip) => clip.sequence_id === "seq-pod-radio-cut")
    .sort((a, b) => a.timeline_in_seconds - b.timeline_in_seconds);
  assert.equal(clips.length, 4);
  assert.deepEqual(clips.slice(0, 2).map((clip) => [clip.timeline_in_seconds, clip.timeline_out_seconds, clip.source_in_seconds, clip.source_out_seconds]), [
    [0, 6, 6, 12],
    [6, 16, 12, 22],
  ]);

  const outside = splitSequenceClip({ clipId: "clip-pod-1", atTimelineSeconds: 99 });
  assert.equal(outside.ok, false);
});

test("ripple delete closes the gap", async () => {
  const { removeSequenceClip, getDemoWorkspaceSnapshot } = await store();

  const removed = removeSequenceClip({ clipId: "clip-pod-2", ripple: true });
  assert.equal(removed.ok, true);

  const clips = getDemoWorkspaceSnapshot().sequenceClips
    .filter((clip) => clip.sequence_id === "seq-pod-radio-cut")
    .sort((a, b) => a.timeline_in_seconds - b.timeline_in_seconds);
  assert.equal(clips.length, 2);
  assert.deepEqual(clips.map((clip) => [clip.timeline_in_seconds, clip.timeline_out_seconds]), [[0, 16], [16, 54]]);
});
