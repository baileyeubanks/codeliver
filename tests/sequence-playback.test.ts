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
