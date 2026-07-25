"use client";

import { useEffect, useRef, useState } from "react";
import { GitCompare, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import VideoPlayer from "@/components/player/VideoPlayer";
import { usePlayerStore } from "@/lib/stores/playerStore";
import type { Version } from "@/lib/types/codeliver";
import {
  comparePair,
  currentVersion,
  versionBadgeLabel,
} from "@/lib/versions/versions";

/**
 * P19b — A/B version compare. Two VideoPlayer instances share one transport:
 * play/pause rides the global player store (both players already follow it),
 * the seek slider drives both elements, and a drift corrector snaps slot B
 * back to slot A when they wander apart. Slot B starts muted so the two
 * audio tracks never stack; each pane has its own honest audio toggle.
 */

/** Max playhead gap (seconds) before the follower snaps to the leader. */
export const COMPARE_DRIFT_THRESHOLD_SECONDS = 0.35;

export function shouldCorrectDrift(
  leaderTime: number,
  followerTime: number,
  threshold: number = COMPARE_DRIFT_THRESHOLD_SECONDS,
): boolean {
  return Math.abs(leaderTime - followerTime) > threshold;
}

/** Clamp a transport seek; an unknown duration (0) sets no upper bound. */
export function clampCompareSeek(seconds: number, duration: number): number {
  const lowered = Math.max(0, seconds);
  return duration > 0 ? Math.min(lowered, duration) : lowered;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

interface VersionCompareProps {
  versions: Version[];
  initialAId?: string | null;
  initialBId?: string | null;
  onExit?: () => void;
}

export default function VersionCompare({
  versions,
  initialAId = null,
  initialBId = null,
  onExit,
}: VersionCompareProps) {
  const defaults = comparePair(versions);
  const [slotAId, setSlotAId] = useState<string | null>(
    initialAId ?? defaults?.a.id ?? versions[0]?.id ?? null,
  );
  const [slotBId, setSlotBId] = useState<string | null>(
    initialBId ?? defaults?.b.id ?? currentVersion(versions)?.id ?? null,
  );
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [mutedA, setMutedA] = useState(false);
  const [mutedB, setMutedB] = useState(true);
  const [timeA, setTimeA] = useState(0);
  const [durationA, setDurationA] = useState(0);

  const playing = usePlayerStore((state) => state.playing);
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const versionA = versions.find((version) => version.id === slotAId) ?? null;
  const versionB = versions.find((version) => version.id === slotBId) ?? null;

  // Compare always starts paused at zero — never inherit the single view's
  // playhead, which belongs to a different version.
  useEffect(() => {
    usePlayerStore.getState().setPlaying(false);
  }, []);

  // Linked transport: slot A leads, slot B snaps back when it drifts.
  useEffect(() => {
    const leader = videoARef.current;
    const follower = videoBRef.current;
    if (!leader || !follower) return;

    const correctFollower = () => {
      if (shouldCorrectDrift(leader.currentTime, follower.currentTime)) {
        follower.currentTime = leader.currentTime;
      }
    };
    const trackDuration = () => setDurationA(
      Number.isFinite(leader.duration) ? leader.duration : 0,
    );

    leader.addEventListener("timeupdate", correctFollower);
    leader.addEventListener("seeked", correctFollower);
    leader.addEventListener("loadedmetadata", trackDuration);
    trackDuration();
    return () => {
      leader.removeEventListener("timeupdate", correctFollower);
      leader.removeEventListener("seeked", correctFollower);
      leader.removeEventListener("loadedmetadata", trackDuration);
    };
  }, [slotAId, slotBId]);

  // Per-pane audio: applied straight to the element so the two players never
  // share one mute state. B starts muted; toggles are explicit and labeled.
  useEffect(() => {
    if (videoARef.current) videoARef.current.muted = mutedA;
  }, [mutedA, slotAId]);
  useEffect(() => {
    if (videoBRef.current) videoBRef.current.muted = mutedB;
  }, [mutedB, slotBId]);

  function handleSeekBoth(next: number) {
    const clamped = clampCompareSeek(next, durationA);
    if (videoARef.current) videoARef.current.currentTime = clamped;
    if (videoBRef.current) videoBRef.current.currentTime = clamped;
    setTimeA(clamped);
    usePlayerStore.getState().setCurrentTime(clamped);
  }

  if (versions.length < 2) {
    return (
      <div className="px-6 py-12 text-center" data-testid="version-compare">
        <p className="text-sm text-white/70">
          Compare needs at least two versions on this asset.
        </p>
      </div>
    );
  }

  const slots = [
    {
      slot: "A" as const,
      version: versionA,
      selectedId: slotAId,
      onChange: setSlotAId,
      videoRef: videoARef,
      muted: mutedA,
      onToggleMute: () => setMutedA((current) => !current),
    },
    {
      slot: "B" as const,
      version: versionB,
      selectedId: slotBId,
      onChange: setSlotBId,
      videoRef: videoBRef,
      muted: mutedB,
      onToggleMute: () => setMutedB((current) => !current),
    },
  ];

  return (
    <div data-testid="version-compare" className="bg-black/95 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <p className="flex items-center gap-2 text-xs font-medium text-white/80">
          <GitCompare size={14} aria-hidden="true" />
          A/B compare — playback only. Pins, drawings, and notes stay on the single view.
        </p>
        {onExit ? (
          <button
            type="button"
            onClick={onExit}
            aria-label="Exit compare view"
            className="flex min-h-8 items-center gap-1 rounded-full border border-white/25 px-3 text-xs text-white/85 transition-colors hover:border-white/50 hover:text-white"
          >
            <X size={12} aria-hidden="true" />
            Single view
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map(({ slot, version, selectedId, onChange, videoRef, muted, onToggleMute }) => (
          <section
            key={slot}
            data-compare-slot={slot}
            aria-label={`Compare slot ${slot}`}
            className="min-w-0"
          >
            <div className="flex items-center gap-2 pb-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-[#18223e]">
                {slot}
              </span>
              <select
                aria-label={`Compare slot ${slot} version`}
                value={selectedId ?? ""}
                onChange={(event) => onChange(event.target.value || null)}
                className="min-h-8 rounded-[var(--radius-sm)] border border-white/25 bg-black px-2 text-xs text-white"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {versionBadgeLabel(version)}
                  </option>
                ))}
              </select>
              {version?.is_current ? (
                <span
                  data-badge="current"
                  className="rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]"
                >
                  Current
                </span>
              ) : null}
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? `Unmute slot ${slot}` : `Mute slot ${slot}`}
                aria-pressed={!muted}
                className="ml-auto flex min-h-8 items-center gap-1 rounded-full border border-white/25 px-2.5 text-[11px] text-white/85 transition-colors hover:border-white/50 hover:text-white"
              >
                {muted ? (
                  <VolumeX size={12} aria-hidden="true" />
                ) : (
                  <Volume2 size={12} aria-hidden="true" />
                )}
                {muted ? "Muted" : "Audio on"}
              </button>
            </div>
            {version ? (
              <VideoPlayer
                src={version.file_url}
                poster={version.thumbnail_url ?? undefined}
                videoRef={videoRef}
                onTimeUpdate={slot === "A" ? (time) => setTimeA(time) : undefined}
              />
            ) : (
              <p className="rounded-[var(--radius)] border border-white/15 px-4 py-8 text-center text-xs text-white/60">
                Pick a version for slot {slot}.
              </p>
            )}
          </section>
        ))}
      </div>

      <div
        data-testid="compare-transport"
        className="mt-3 flex items-center gap-3 rounded-[var(--radius-sm)] border border-white/15 bg-white/5 px-3 py-2"
      >
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pause both versions" : "Play both versions"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[#18223e] transition-colors hover:brightness-110"
        >
          {playing ? (
            <Pause size={15} aria-hidden="true" />
          ) : (
            <Play size={15} aria-hidden="true" />
          )}
        </button>
        <input
          type="range"
          aria-label="Seek both versions"
          min={0}
          max={durationA > 0 ? durationA : 0}
          step={0.01}
          value={clampCompareSeek(timeA, durationA)}
          onChange={(event) => handleSeekBoth(Number(event.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
        />
        <span className="shrink-0 font-mono text-[11px] text-white/75">
          {formatClock(timeA)} / {formatClock(durationA)}
        </span>
      </div>
    </div>
  );
}
