"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Scissors, Trash2 } from "lucide-react";
import {
  removeSequenceClip,
  splitSequenceClip,
  trimSequenceClip,
} from "@/lib/demo/workspace-store";
import { edlFilename, generateEdl } from "@/lib/covideopro/edl.ts";
import {
  nextSequencePlayback,
  orderSequenceClips,
  resolveSequencePlayback,
  sequenceTimelineDuration,
  timelineSecondsForClipSource,
  type SequencePlaybackTarget,
} from "@/lib/projects/sequence-playback";
import type { Sequence, SequenceClip } from "@/lib/covideopro/record.ts";

interface TimelineAsset {
  id: string;
  title: string;
  file_url?: string | null;
}

interface SequenceTimelineProps {
  sequence: Sequence;
  clips: SequenceClip[];
  assets: TimelineAsset[];
  onNotice: (message: string) => void;
}

function fmt(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Bespoke sequence timeline: each record clip carries the source identity used
 * for preview. That remains reliable when one source is repeated or reordered.
 */
export default function SequenceTimeline({ sequence, clips, assets, onNotice }: SequenceTimelineProps) {
  const ordered = useMemo(() => orderSequenceClips(clips), [clips]);
  const duration = useMemo(() => sequenceTimelineDuration(ordered), [ordered]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pendingSeekRef = useRef<{ target: SequencePlaybackTarget; resume: boolean } | null>(null);
  const initialSeekAppliedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(() => ordered[0]?.id ?? null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  const activeClip = ordered.find((clip) => clip.id === activeClipId) ?? ordered[0] ?? null;
  const activeAsset = activeClip ? assets.find((asset) => asset.id === activeClip.asset_id) ?? null : null;
  const playableUrl = activeAsset?.file_url ?? null;
  const selected = ordered.find((clip) => clip.id === selectedClipId) ?? null;
  const selectedAsset = selected ? assets.find((asset) => asset.id === selected.asset_id) : null;

  const finishPlayback = useCallback(() => {
    pendingSeekRef.current = null;
    isPlayingRef.current = false;
    videoRef.current?.pause();
    setPlaying(false);
    setPlayhead(duration);
  }, [duration]);

  const flushPendingSeek = useCallback(() => {
    const pending = pendingSeekRef.current;
    const video = videoRef.current;
    if (!pending || !video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    video.currentTime = pending.target.sourceSeconds;
    pendingSeekRef.current = null;
    if (!pending.resume) return;
    void video.play().then(() => {
      isPlayingRef.current = true;
      setPlaying(true);
    }).catch(() => {
      isPlayingRef.current = false;
      setPlaying(false);
      onNotice("Playback was blocked by the browser.");
    });
  }, [onNotice]);

  const queuePlaybackTarget = useCallback((target: SequencePlaybackTarget, resume: boolean) => {
    const video = videoRef.current;
    pendingSeekRef.current = { target, resume };
    setActiveClipId(target.clip.id);
    setPlayhead(target.timelineSeconds);
    if (video && activeClip?.asset_id === target.clip.asset_id && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      flushPendingSeek();
    }
  }, [activeClip?.asset_id, flushPendingSeek]);

  /** Clamp every interaction through the resolver. Gaps select the next clip;
   * the exclusive end updates the playhead and deliberately has no source seek. */
  const seek = useCallback((timelineSeconds: number, resume = playing) => {
    const target = resolveSequencePlayback(ordered, timelineSeconds);
    if (target.kind === "end") {
      finishPlayback();
      return;
    }
    queuePlaybackTarget(target, resume);
  }, [finishPlayback, ordered, playing, queuePlaybackTarget]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMetadata = () => flushPendingSeek();
    video.addEventListener("loadedmetadata", onMetadata);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) flushPendingSeek();
    return () => video.removeEventListener("loadedmetadata", onMetadata);
  }, [activeClipId, flushPendingSeek, playableUrl]);

  // A newly mounted sequence previews its first exact source frame before play.
  // This avoids showing source frame zero for a clip whose record starts later.
  useEffect(() => {
    if (initialSeekAppliedRef.current || !activeClip) return;
    initialSeekAppliedRef.current = true;
    pendingSeekRef.current = {
      target: {
        kind: "clip",
        clip: activeClip,
        timelineSeconds: activeClip.timeline_in_seconds,
        sourceSeconds: activeClip.source_in_seconds,
      },
      resume: false,
    };
    flushPendingSeek();
  }, [activeClip, flushPendingSeek]);

  // Playback advances from the active record clip, never from a matching source
  // range. This supports repeated/reordered ranges and cross-asset sequences.
  useEffect(() => {
    const video = videoRef.current;
    const current = ordered.find((clip) => clip.id === activeClipId) ?? ordered[0] ?? null;
    if (!video || !current) return;
    const playbackVideo = video;
    const currentClip = current;

    function advance() {
      if (!isPlayingRef.current || pendingSeekRef.current) return;
      const next = nextSequencePlayback(ordered, currentClip.id);
      if (next.kind === "end") finishPlayback();
      else queuePlaybackTarget(next, true);
    }
    function onTimeUpdate() {
      // A departing source can emit a final timeupdate while its replacement
      // loads. It must not advance or overwrite the target clip's playhead.
      if (!isPlayingRef.current || pendingSeekRef.current) return;
      const source = playbackVideo.currentTime;
      if (source >= currentClip.source_out_seconds - 0.04) {
        advance();
        return;
      }
      if (source >= currentClip.source_in_seconds) {
        setPlayhead(timelineSecondsForClipSource(currentClip, source));
      }
    }
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", advance);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", advance);
    };
  }, [activeClipId, duration, finishPlayback, ordered, queuePlaybackTarget]);

  function togglePlay() {
    if (!playableUrl) return;
    if (playing) {
      isPlayingRef.current = false;
      videoRef.current?.pause();
      setPlaying(false);
      return;
    }
    seek(playhead >= duration ? 0 : playhead, true);
  }

  function handleTrackClick(event: React.MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || duration === 0) return;
    const rect = track.getBoundingClientRect();
    seek(((event.clientX - rect.left) / rect.width) * duration);
  }

  function handleSplit() {
    if (!selected) {
      onNotice("Select a clip to split.");
      return;
    }
    const result = splitSequenceClip({ clipId: selected.id, atTimelineSeconds: playhead });
    onNotice(result.ok ? "Clip split at playhead." : result.reason);
  }

  function handleRemove() {
    if (!selected) {
      onNotice("Select a clip to remove.");
      return;
    }
    const result = removeSequenceClip({ clipId: selected.id, ripple: true });
    if (result.ok) {
      setSelectedClipId(null);
      onNotice("Clip removed; timeline rippled.");
    } else {
      onNotice(result.reason);
    }
  }

  function handleTrim(edge: "in" | "out", event: React.MouseEvent) {
    if (!selected) return;
    const clip: SequenceClip = selected;
    event.stopPropagation();
    const track = trackRef.current;
    if (!track || duration === 0) return;
    const rect = track.getBoundingClientRect();

    function onMove(moveEvent: MouseEvent) {
      const ratio = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      const timelinePoint = ratio * duration;
      if (edge === "in") {
        const offset = Math.max(
          -clip.source_in_seconds,
          Math.min(clip.source_out_seconds - clip.source_in_seconds - 0.5, timelinePoint - clip.timeline_in_seconds),
        );
        trimSequenceClip({
          clipId: clip.id,
          sourceIn: clip.source_in_seconds + Math.max(0, offset),
          sourceOut: clip.source_out_seconds,
        });
      } else {
        const newOut = Math.max(
          clip.source_in_seconds + 0.5,
          clip.source_out_seconds + (timelinePoint - clip.timeline_out_seconds),
        );
        trimSequenceClip({ clipId: clip.id, sourceIn: clip.source_in_seconds, sourceOut: newOut });
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onNotice("Trim applied.");
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function exportEdl() {
    const edl = generateEdl(sequence, ordered.map((clip) => ({
      clip,
      reel: assets.find((asset) => asset.id === clip.asset_id)?.title ?? clip.asset_id,
      clipName: assets.find((asset) => asset.id === clip.asset_id)?.title ?? clip.asset_id,
    })));
    const blob = new Blob([edl], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = edlFilename(sequence);
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice("EDL exported for Premiere/Resolve handoff.");
  }

  return (
    <div className="cv-timeline" data-sequence-id={sequence.id}>
      <div className="cv-timeline__bar">
        <span>
          <strong>{sequence.name}</strong>
          <span className="cv-timeline__meta">
          {ordered.length} clips · {fmt(duration)} · {Math.round(sequence.fps)}fps · {sequence.status.replace("_", " ")}
          </span>
        </span>
        <span className="cv-timeline__actions">
          {selected ? (
            <>
              <button type="button" onClick={handleSplit} title="Split selected clip at playhead"><Scissors size={14} /> Split</button>
              <button type="button" onClick={handleRemove} title="Ripple-delete selected clip"><Trash2 size={14} /> Delete</button>
            </>
          ) : null}
          <button type="button" onClick={exportEdl} title="Export CMX 3600 EDL"><Download size={14} /> EDL</button>
        </span>
      </div>

      <p className="cv-timeline__meta" aria-live="polite">
        {selected
          ? `${selectedAsset?.title ?? selected.asset_id} · source ${fmt(selected.source_in_seconds)}→${fmt(selected.source_out_seconds)} · record ${fmt(selected.timeline_in_seconds)}→${fmt(selected.timeline_out_seconds)}`
          : "Select a clip to inspect its source and record range."}
      </p>

      <div className="cv-timeline__stage">
        {playableUrl ? (
          <>
            <video ref={videoRef} src={playableUrl} className="cv-timeline__video" playsInline preload="auto" />
            <button type="button" className="cv-timeline__play" onClick={togglePlay}>
              {playing ? "Pause" : playhead > 0 && playhead < duration ? "Resume" : "Play"} sequence
            </button>
          </>
        ) : (
          <div className="cv-timeline__novideo">
            No playable source attached to {activeAsset?.title ?? "this media"} yet — upload media to preview the assembly.
          </div>
        )}
      </div>

      <div
        className="cv-timeline__track"
        ref={trackRef}
        onClick={handleTrackClick}
        role="slider"
        aria-label="Sequence timeline"
        aria-valuenow={Math.round(playhead)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        tabIndex={0}
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? playhead + 1
            : event.key === "ArrowLeft" ? playhead - 1
              : event.key === "Home" ? 0
                : event.key === "End" ? duration
                  : null;
          if (next === null) return;
          event.preventDefault();
          seek(next);
        }}
      >
        {ordered.map((clip) => {
          const width = duration > 0 ? ((clip.timeline_out_seconds - clip.timeline_in_seconds) / duration) * 100 : 0;
          const left = duration > 0 ? (clip.timeline_in_seconds / duration) * 100 : 0;
          const asset = assets.find((candidate) => candidate.id === clip.asset_id);
          return (
            <div
              key={clip.id}
              className={`cv-timeline__clip${selectedClipId === clip.id ? " is-selected" : ""}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedClipId(clip.id);
                seek(clip.timeline_in_seconds);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setSelectedClipId(clip.id);
                seek(clip.timeline_in_seconds);
              }}
              role="button"
              tabIndex={0}
              title={`${asset?.title ?? clip.asset_id} — source ${fmt(clip.source_in_seconds)}→${fmt(clip.source_out_seconds)}`}
            >
              {selectedClipId === clip.id ? (
                <>
                  <i className="cv-timeline__handle cv-timeline__handle--in" onMouseDown={(event) => handleTrim("in", event)} />
                  <i className="cv-timeline__handle cv-timeline__handle--out" onMouseDown={(event) => handleTrim("out", event)} />
                </>
              ) : null}
              <span className="cv-timeline__clip-label">{asset?.title ?? "clip"}</span>
              <span className="cv-timeline__clip-time">{fmt(clip.timeline_out_seconds - clip.timeline_in_seconds)}</span>
            </div>
          );
        })}
        {duration > 0 ? (
          <i className="cv-timeline__playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
        ) : null}
      </div>
      <div className="cv-timeline__timebar">
        <span>{fmt(playhead)}</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  );
}
