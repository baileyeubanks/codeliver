import type { SequenceClip } from "@/lib/covideopro/record.ts";
import { currentDemoMediaVersion, type DemoMediaVersion } from "../demo/media-version-authority.ts";

export interface SequenceTimelineAsset {
  id: string;
  title: string;
  file_url?: string | null;
}

export type SequenceClipMedia =
  | {
    status: "ready";
    asset: SequenceTimelineAsset;
    version: DemoMediaVersion | null;
    sourceUrl: string | null;
    mediaBlobId: string | null;
    label: string;
  }
  | {
    status: "unavailable";
    asset: SequenceTimelineAsset | null;
    versionId: string | null;
    label: string;
    reason: string;
  };

function versionLabel(asset: SequenceTimelineAsset | null, version: DemoMediaVersion | null, versionId: string | null) {
  const title = asset?.title ?? "Unknown media";
  if (version) return `${title} · V${version.version_number}`;
  if (versionId) return `${title} · version ${versionId}`;
  return `${title} · current media`;
}

/**
 * Resolve one timeline clip to its recorded source identity. A clip that names
 * a version is never allowed to follow an asset's mutable current URL.
 */
export function resolveSequenceClipMedia(input: {
  clip: Pick<SequenceClip, "asset_id" | "version_id">;
  assets: readonly SequenceTimelineAsset[];
  versions: readonly DemoMediaVersion[];
}): SequenceClipMedia {
  const assetMatches = input.assets.filter((candidate) => candidate.id === input.clip.asset_id);
  const asset = assetMatches.length === 1 ? assetMatches[0] : null;
  const hasExplicitVersion = input.clip.version_id !== null;
  const versionId = hasExplicitVersion ? input.clip.version_id?.trim() ?? null : null;
  if (!asset) {
    return {
      status: "unavailable",
      asset: null,
      versionId,
      label: versionLabel(null, null, versionId),
      reason: "The selected media is unavailable.",
    };
  }

  if (hasExplicitVersion) {
    if (!versionId) {
      return {
        status: "unavailable",
        asset,
        versionId: null,
        label: `${asset.title} · invalid version`,
        reason: "The selected version is unavailable.",
      };
    }
    const matches = input.versions.filter((candidate) => candidate.id === versionId);
    const version = matches.length === 1 && matches[0]?.asset_id === asset.id ? matches[0] : null;
    if (!version || (!version.source_url && !version.media_blob_id)) {
      return {
        status: "unavailable",
        asset,
        versionId,
        label: versionLabel(asset, null, versionId),
        reason: "The selected version is unavailable.",
      };
    }
    return {
      status: "ready",
      asset,
      version,
      sourceUrl: version.source_url,
      mediaBlobId: version.media_blob_id,
      label: versionLabel(asset, version, versionId),
    };
  }

  const scopedVersions = input.versions.filter((candidate) => candidate.asset_id === asset.id);
  if (scopedVersions.length > 0) {
    const current = currentDemoMediaVersion(scopedVersions, asset.id);
    if (!current || (!current.source_url && !current.media_blob_id)) {
      return {
        status: "unavailable",
        asset,
        versionId: null,
        label: versionLabel(asset, null, null),
        reason: "The current version is unavailable.",
      };
    }
    return {
      status: "ready",
      asset,
      version: current,
      sourceUrl: current.source_url,
      mediaBlobId: current.media_blob_id,
      label: versionLabel(asset, current, null),
    };
  }

  if (asset.file_url) {
    return {
      status: "ready",
      asset,
      version: null,
      sourceUrl: asset.file_url,
      mediaBlobId: null,
      label: versionLabel(asset, null, null),
    };
  }

  return {
    status: "unavailable",
    asset,
    versionId: null,
    label: versionLabel(asset, null, null),
    reason: "The current media is unavailable.",
  };
}

export interface SequencePlaybackTarget {
  kind: "clip";
  clip: SequenceClip;
  timelineSeconds: number;
  sourceSeconds: number;
}

export interface SequencePlaybackEnd {
  kind: "end";
  timelineSeconds: number;
}

export type SequencePlaybackResolution = SequencePlaybackTarget | SequencePlaybackEnd;

/** Keep source selection deterministic even when one source range appears more
 * than once or clips arrive out of order from the record. */
export function orderSequenceClips(clips: readonly SequenceClip[]): SequenceClip[] {
  return [...clips].sort((left, right) =>
    left.timeline_in_seconds - right.timeline_in_seconds
    || left.timeline_out_seconds - right.timeline_out_seconds
    || left.track_index - right.track_index
    || left.id.localeCompare(right.id),
  );
}

export function sequenceTimelineDuration(clips: readonly SequenceClip[]): number {
  return orderSequenceClips(clips).reduce(
    (maximum, clip) => Math.max(maximum, clip.timeline_out_seconds),
    0,
  );
}

export function clampSequenceTimelinePosition(
  timelineSeconds: number,
  duration: number,
): number {
  if (!Number.isFinite(timelineSeconds)) return 0;
  return Math.max(0, Math.min(Math.max(0, duration), timelineSeconds));
}

/** Resolve a timeline point to the exact record clip and its source position.
 * Gaps move to the next ordered clip; the exclusive timeline end is a stable
 * terminal position rather than a seek into an arbitrary source asset. */
export function resolveSequencePlayback(
  clips: readonly SequenceClip[],
  timelineSeconds: number,
): SequencePlaybackResolution {
  const ordered = orderSequenceClips(clips);
  const duration = sequenceTimelineDuration(ordered);
  const position = clampSequenceTimelinePosition(timelineSeconds, duration);
  const clipAtPosition = ordered.find((candidate) =>
    position >= candidate.timeline_in_seconds && position < candidate.timeline_out_seconds,
  );
  const nextClip = clipAtPosition ? null : ordered.find((candidate) => candidate.timeline_in_seconds >= position);
  const clip = clipAtPosition ?? nextClip;

  if (!clip) return { kind: "end", timelineSeconds: duration };
  const resolvedTimelineSeconds = clipAtPosition ? position : clip.timeline_in_seconds;
  return {
    kind: "clip",
    clip,
    timelineSeconds: resolvedTimelineSeconds,
    sourceSeconds: clip.source_in_seconds + (resolvedTimelineSeconds - clip.timeline_in_seconds),
  };
}

/** Advance strictly from the active clip identity. Source time alone is not a
 * clip identity because a sequence may reuse or reorder the same source range. */
export function nextSequencePlayback(
  clips: readonly SequenceClip[],
  activeClipId: string | null,
): SequencePlaybackResolution {
  const ordered = orderSequenceClips(clips);
  const activeIndex = activeClipId ? ordered.findIndex((clip) => clip.id === activeClipId) : -1;
  const next = activeIndex >= 0 ? ordered[activeIndex + 1] : ordered[0];
  if (!next) return { kind: "end", timelineSeconds: sequenceTimelineDuration(ordered) };
  return {
    kind: "clip",
    clip: next,
    timelineSeconds: next.timeline_in_seconds,
    sourceSeconds: next.source_in_seconds,
  };
}

export function timelineSecondsForClipSource(
  clip: SequenceClip,
  sourceSeconds: number,
): number {
  const source = Math.max(clip.source_in_seconds, Math.min(clip.source_out_seconds, sourceSeconds));
  return clip.timeline_in_seconds + (source - clip.source_in_seconds);
}

/** A source replacement is asynchronous. Keep the caller's current intent and
 * request generation explicit so delayed metadata or play promises cannot
 * revive a paused sequence or apply a prior source's seek. */
export interface PlaybackIntent {
  generation: number;
  desiredPlaying: boolean;
}

export interface PlaybackRequest {
  generation: number;
  sourceUrl: string;
  resume: boolean;
}

export function queuePlaybackRequest(
  intent: PlaybackIntent,
  sourceUrl: string,
  resume: boolean,
): { intent: PlaybackIntent; request: PlaybackRequest } {
  const nextIntent = { generation: intent.generation + 1, desiredPlaying: resume };
  return {
    intent: nextIntent,
    request: { generation: nextIntent.generation, sourceUrl, resume },
  };
}

/** Pausing preserves a pending exact seek but makes it impossible for that
 * request, or an older play promise, to restart media. */
export function pausePlaybackRequest(
  intent: PlaybackIntent,
  request: PlaybackRequest | null,
): { intent: PlaybackIntent; request: PlaybackRequest | null } {
  const nextIntent = { generation: intent.generation + 1, desiredPlaying: false };
  return {
    intent: nextIntent,
    request: request ? { ...request, generation: nextIntent.generation, resume: false } : null,
  };
}

export function canResolvePlaybackRequest(
  intent: PlaybackIntent,
  request: PlaybackRequest,
  observedSourceUrl: string,
): boolean {
  return request.generation === intent.generation && request.sourceUrl === observedSourceUrl;
}

export function canStartPlayback(
  intent: PlaybackIntent,
  request: PlaybackRequest,
): boolean {
  return request.generation === intent.generation && request.resume && intent.desiredPlaying;
}

export type PlaybackPromiseOutcome = "start" | "ignore" | "abort" | "failure";

/** Decide a delayed play() completion against the latest user intent. An older
 * completion must be inert: it cannot pause media, clear a newer intent, or
 * report a browser error belonging to an obsolete source request. */
export function playbackPromiseOutcome(
  intent: PlaybackIntent,
  request: PlaybackRequest,
  error?: { name?: string } | null,
): PlaybackPromiseOutcome {
  if (request.generation !== intent.generation || !intent.desiredPlaying) return "ignore";
  if (!error) return "start";
  return error.name === "AbortError" ? "abort" : "failure";
}
