import assert from "node:assert/strict";
import test from "node:test";
import {
  canResolvePlaybackRequest,
  canStartPlayback,
  clampSequenceTimelinePosition,
  nextSequencePlayback,
  pausePlaybackRequest,
  playbackPromiseOutcome,
  orderSequenceClips,
  queuePlaybackRequest,
  resolveSequencePlayback,
  sequenceTimelineDuration,
  timelineSecondsForClipSource,
} from "../lib/projects/sequence-playback.ts";
import * as sequencePlayback from "../lib/projects/sequence-playback.ts";
import type { DemoMediaVersion } from "../lib/demo/media-version-authority.ts";
import type { SequenceClip } from "../lib/covideopro/record.ts";

const clip = (id: string, asset_id: string, timelineIn: number, timelineOut: number, sourceIn: number, sourceOut: number): SequenceClip => ({
  id, sequence_id: "sequence", asset_id, version_id: null, select_id: null, track_index: 0,
  timeline_in_seconds: timelineIn, timeline_out_seconds: timelineOut,
  source_in_seconds: sourceIn, source_out_seconds: sourceOut,
});

const clips = [
  clip("third", "source-a", 8, 10, 6, 8),
  clip("first", "source-a", 0, 5, 40, 45),
  clip("second", "source-b", 5, 8, 10, 13),
];

const version = (overrides: Partial<DemoMediaVersion>): DemoMediaVersion => ({
  id: "version-v1",
  asset_id: "source-a",
  version_number: 1,
  media_blob_id: null,
  source_url: "https://media.test/source-v1.mp4",
  thumbnail_blob_id: null,
  file_name: "source-v1.mp4",
  file_type: "video",
  file_size: 1200,
  duration_seconds: 10,
  created_at: "2026-09-22T00:00:00.000Z",
  is_current: false,
  ...overrides,
});

test("sequence clips preserve their exact V1 and V2 media identities", () => {
  const resolve = (sequencePlayback as unknown as {
    resolveSequenceClipMedia?: (input: unknown) => unknown;
  }).resolveSequenceClipMedia;
  assert.equal(typeof resolve, "function", "sequence playback must resolve a clip against its exact version");
  if (!resolve) return;

  const assets = [{ id: "source-a", title: "Source A", file_url: "https://media.test/current-v2.mp4" }];
  const v1 = version({ id: "version-v1", version_number: 1, source_url: "https://media.test/source-v1.mp4" });
  const v2 = version({
    id: "version-v2",
    version_number: 2,
    media_blob_id: "blob-version-v2",
    source_url: null,
    file_name: "source-v2.mp4",
    is_current: true,
  });

  const v1Result = resolve({ clip: { ...clips[0], version_id: v1.id }, assets, versions: [v1, v2] }) as {
    status: string; version?: { id: string; version_number: number }; sourceUrl?: string | null; mediaBlobId?: string | null;
  };
  assert.deepEqual(v1Result, {
    status: "ready",
    asset: assets[0],
    version: v1,
    sourceUrl: "https://media.test/source-v1.mp4",
    mediaBlobId: null,
    label: "Source A · V1",
  });

  const v2Result = resolve({ clip: { ...clips[0], version_id: v2.id }, assets, versions: [v1, v2] }) as {
    status: string; version?: { id: string }; sourceUrl?: string | null; mediaBlobId?: string | null;
  };
  assert.equal(v2Result.status, "ready");
  assert.equal(v2Result.version?.id, "version-v2");
  assert.equal(v2Result.sourceUrl, null);
  assert.equal(v2Result.mediaBlobId, "blob-version-v2");
});

test("unknown, mismatched, and duplicate version identities never fall forward to current media", () => {
  const resolve = (sequencePlayback as unknown as {
    resolveSequenceClipMedia?: (input: unknown) => unknown;
  }).resolveSequenceClipMedia;
  assert.equal(typeof resolve, "function", "sequence playback must reject unproven version bindings");
  if (!resolve) return;

  const assets = [{ id: "source-a", title: "Source A", file_url: "https://media.test/current-v2.mp4" }];
  const current = version({ id: "version-v2", version_number: 2, media_blob_id: "blob-version-v2", source_url: null, is_current: true });
  const unknown = resolve({ clip: { ...clips[0], version_id: "missing-v1" }, assets, versions: [current] }) as { status: string; sourceUrl?: string | null; mediaBlobId?: string | null };
  assert.deepEqual(unknown, {
    status: "unavailable",
    asset: assets[0],
    versionId: "missing-v1",
    label: "Source A · version missing-v1",
    reason: "The selected version is unavailable.",
  });

  const mismatched = resolve({
    clip: { ...clips[0], version_id: "version-other" },
    assets,
    versions: [version({ id: "version-other", asset_id: "source-b", source_url: "https://media.test/other.mp4" }), current],
  }) as { status: string };
  assert.equal(mismatched.status, "unavailable");

  const duplicate = resolve({
    clip: { ...clips[0], version_id: "version-v1" },
    assets,
    versions: [version({ id: "version-v1" }), version({ id: "version-v1", source_url: "https://media.test/other-v1.mp4" }), current],
  }) as { status: string };
  assert.equal(duplicate.status, "unavailable");

  const blank = resolve({
    clip: { ...clips[0], version_id: "   " },
    assets,
    versions: [current],
  }) as { status: string; label?: string };
  assert.equal(blank.status, "unavailable");
  assert.equal(blank.label, "Source A · invalid version");

  const duplicateAsset = resolve({
    clip: { ...clips[0], version_id: "version-v2" },
    assets: [assets[0], { ...assets[0] }],
    versions: [current],
  }) as { status: string };
  assert.equal(duplicateAsset.status, "unavailable");
});

test("version-absent legacy sequence clips resolve the one current cut, then ordinary asset media", () => {
  const resolve = (sequencePlayback as unknown as {
    resolveSequenceClipMedia?: (input: unknown) => unknown;
  }).resolveSequenceClipMedia;
  assert.equal(typeof resolve, "function", "legacy clips need documented current-media semantics");
  if (!resolve) return;

  const versionedAsset = { id: "source-a", title: "Source A", file_url: "https://media.test/stale-asset-url.mp4" };
  const current = version({ id: "version-v2", version_number: 2, media_blob_id: "blob-version-v2", source_url: null, is_current: true });
  const currentResult = resolve({ clip: clips[0], assets: [versionedAsset], versions: [current] }) as {
    status: string; version?: { id: string }; sourceUrl?: string | null; mediaBlobId?: string | null;
  };
  assert.equal(currentResult.status, "ready");
  assert.equal(currentResult.version?.id, "version-v2");
  assert.equal(currentResult.mediaBlobId, "blob-version-v2");

  const ordinaryAsset = { id: "source-a", title: "Source A", file_url: "https://media.test/current.mp4" };
  const ordinaryResult = resolve({ clip: clips[0], assets: [ordinaryAsset], versions: [] }) as {
    status: string; version?: unknown; sourceUrl?: string | null; mediaBlobId?: string | null;
  };
  assert.deepEqual(ordinaryResult, {
    status: "ready",
    asset: ordinaryAsset,
    version: null,
    sourceUrl: "https://media.test/current.mp4",
    mediaBlobId: null,
    label: "Source A · current media",
  });
});

test("sequence playback resolves ordered, repeated, and cross-source clips by exact identity", () => {
  assert.deepEqual(orderSequenceClips(clips).map((item) => item.id), ["first", "second", "third"]);
  assert.equal(sequenceTimelineDuration(clips), 10);

  const first = resolveSequencePlayback(clips, 2);
  assert.deepEqual(first.kind === "clip" && [first.clip.id, first.clip.asset_id, first.sourceSeconds], ["first", "source-a", 42]);

  const second = resolveSequencePlayback(clips, 6);
  assert.deepEqual(second.kind === "clip" && [second.clip.id, second.clip.asset_id, second.sourceSeconds], ["second", "source-b", 11]);

  const repeatedSource = resolveSequencePlayback(clips, 9);
  assert.deepEqual(repeatedSource.kind === "clip" && [repeatedSource.clip.id, repeatedSource.clip.asset_id, repeatedSource.sourceSeconds], ["third", "source-a", 7]);
  assert.equal(timelineSecondsForClipSource(clips[0], 7), 9);
});

test("sequence playback advances in record order across sources and has deterministic gaps and end", () => {
  const fromFirst = nextSequencePlayback(clips, "first");
  assert.deepEqual(fromFirst.kind === "clip" && [fromFirst.clip.id, fromFirst.sourceSeconds], ["second", 10]);
  const fromSecond = nextSequencePlayback(clips, "second");
  assert.deepEqual(fromSecond.kind === "clip" && [fromSecond.clip.id, fromSecond.sourceSeconds], ["third", 6]);
  assert.deepEqual(nextSequencePlayback(clips, "third"), { kind: "end", timelineSeconds: 10 });

  const withGap = [clip("one", "a", 0, 3, 0, 3), clip("two", "b", 6, 8, 20, 22)];
  const gap = resolveSequencePlayback(withGap, 4);
  assert.deepEqual(gap.kind === "clip" && [gap.clip.id, gap.timelineSeconds, gap.sourceSeconds], ["two", 6, 20]);
  assert.deepEqual(resolveSequencePlayback(withGap, 8), { kind: "end", timelineSeconds: 8 });
});

test("timeline position clamps keyboard and pointer values, including the exclusive end", () => {
  assert.equal(clampSequenceTimelinePosition(-4, 10), 0);
  assert.equal(clampSequenceTimelinePosition(18, 10), 10);
  assert.equal(clampSequenceTimelinePosition(Number.NaN, 10), 0);
  assert.deepEqual(resolveSequencePlayback(clips, 100), { kind: "end", timelineSeconds: 10 });
});


test("playback request coordinator keeps a deliberate pause from restarting after metadata", () => {
  const queued = queuePlaybackRequest({ generation: 0, desiredPlaying: false }, "https://source.test/b", true);
  const paused = pausePlaybackRequest(queued.intent, queued.request);

  assert.equal(paused.intent.desiredPlaying, false);
  assert.equal(paused.request?.resume, false);
  assert.equal(canResolvePlaybackRequest(paused.intent, queued.request, "https://source.test/b"), false);
  assert.equal(canResolvePlaybackRequest(paused.intent, paused.request!, "https://source.test/b"), true);
  assert.equal(canStartPlayback(paused.intent, paused.request!), false);
});

test("playback request coordinator rejects stale source metadata and preserves nonzero record starts", () => {
  const first = queuePlaybackRequest({ generation: 0, desiredPlaying: false }, "https://source.test/a", true);
  const second = queuePlaybackRequest(first.intent, "https://source.test/b", true);

  assert.equal(canResolvePlaybackRequest(second.intent, first.request, "https://source.test/a"), false);
  assert.equal(canResolvePlaybackRequest(second.intent, second.request, "https://source.test/a"), false);
  assert.equal(canResolvePlaybackRequest(second.intent, second.request, "https://source.test/b"), true);

  const nonzero = [clip("late", "source-a", 4, 6, 20, 22)];
  assert.deepEqual(resolveSequencePlayback(nonzero, 0), {
    kind: "clip", clip: nonzero[0], timelineSeconds: 4, sourceSeconds: 20,
  });
});


test("delayed play promise outcomes cannot interfere with newer playback intent", () => {
  const first = queuePlaybackRequest({ generation: 0, desiredPlaying: false }, "https://source.test/a", true);
  const newer = queuePlaybackRequest(first.intent, "https://source.test/b", true);

  assert.equal(playbackPromiseOutcome(newer.intent, first.request), "ignore", "old success must not pause or alter newer playback");
  assert.equal(playbackPromiseOutcome(newer.intent, first.request, { name: "NotAllowedError" }), "ignore", "old rejection must stay silent");
  assert.equal(playbackPromiseOutcome(newer.intent, newer.request), "start");
});

test("play promise failures distinguish a quiet abort from a current real failure", () => {
  const queued = queuePlaybackRequest({ generation: 0, desiredPlaying: false }, "https://source.test/a", true);
  const paused = pausePlaybackRequest(queued.intent, queued.request);

  assert.equal(playbackPromiseOutcome(paused.intent, queued.request, { name: "AbortError" }), "ignore", "pause invalidates its old promise");
  assert.equal(playbackPromiseOutcome(queued.intent, queued.request, { name: "AbortError" }), "abort");
  assert.equal(playbackPromiseOutcome(queued.intent, queued.request, { name: "NotAllowedError" }), "failure");
});
