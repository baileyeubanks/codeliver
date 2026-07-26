"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Scissors, Trash2 } from "lucide-react";
import {
  removeSequenceClip,
  splitSequenceClip,
  trimSequenceClip,
} from "@/lib/demo/workspace-store";
import { edlFilename, generateEdl } from "@/lib/covideopro/edl.ts";
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
 * Bespoke sequence timeline: real playback (source seeked clip-to-clip),
 * playhead sync, trim/split/ripple-delete through validated store mutations.
 */
export default function SequenceTimeline({ sequence, clips, assets, onNotice }: SequenceTimelineProps) {
  const ordered = useMemo(
    () => [...clips].sort((a, b) => a.timeline_in_seconds - b.timeline_in_seconds),
    [clips],
  );
  const duration = ordered.reduce((max, clip) => Math.max(max, clip.timeline_out_seconds), 0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  const firstAsset = ordered.length > 0 ? assets.find((asset) => asset.id === ordered[0].asset_id) : null;
  const playableUrl = firstAsset?.file_url ?? null;
  const selected = ordered.find((clip) => clip.id === selectedClipId) ?? null;

  function clipAt(timelineSeconds: number): SequenceClip | null {
    return ordered.find(
      (clip) => timelineSeconds >= clip.timeline_in_seconds && timelineSeconds < clip.timeline_out_seconds,
    ) ?? null;
  }

  /** Map sequence timeline position → source time for the video element. */
  function sourceTimeFor(timelineSeconds: number): { clip: SequenceClip; source: number } | null {
    const clip = clipAt(timelineSeconds);
    if (!clip) return null;
    return { clip, source: clip.source_in_seconds + (timelineSeconds - clip.timeline_in_seconds) };
  }

  function seek(timelineSeconds: number) {
    const target = sourceTimeFor(Math.max(0, Math.min(duration, timelineSeconds)));
    const video = videoRef.current;
    if (!target || !video) return;
    video.currentTime = target.source;
    setPlayhead(timelineSeconds);
  }

  // Playback engine: advance through clips at source boundaries.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function onTimeUpdate() {
      if (!video) return;
      const source = video.currentTime;
      const current = ordered.find(
        (clip) => source >= clip.source_in_seconds && source < clip.source_out_seconds,
      );
      if (current) {
        setPlayhead(current.timeline_in_seconds + (source - current.source_in_seconds));
        return;
      }
      const next = ordered.find((clip) => clip.source_in_seconds > source);
      if (next && playing) {
        video.currentTime = next.source_in_seconds;
        setPlayhead(next.timeline_in_seconds);
      } else if (!next) {
        setPlaying(false);
        video.pause();
        setPlayhead(duration);
      }
    }
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [ordered, playing, duration]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video || !playableUrl) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      if (playhead >= duration - 0.05) seek(0);
      else seek(playhead);
      void video.play().then(() => setPlaying(true)).catch(() => onNotice("Playback was blocked by the browser."));
    }
  }

  function handleTrackClick(event: React.MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || duration === 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seek(ratio * duration);
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
        <strong>{sequence.name}</strong>
        <span className="cv-timeline__meta">
          {ordered.length} clips · {fmt(duration)} · {Math.round(sequence.fps)}fps · {sequence.status.replace("_", " ")}
        </span>
        <span className="cv-timeline__actions">
          <button type="button" onClick={handleSplit} title="Split selected clip at playhead"><Scissors size={14} /> Split</button>
          <button type="button" onClick={handleRemove} title="Ripple-delete selected clip"><Trash2 size={14} /> Delete</button>
          <button type="button" onClick={exportEdl} title="Export CMX 3600 EDL"><Download size={14} /> EDL</button>
        </span>
      </div>

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
            No playable source attached to {firstAsset?.title ?? "this media"} yet — upload media to preview the assembly.
          </div>
        )}
      </div>

      <div className="cv-timeline__track" ref={trackRef} onClick={handleTrackClick} role="slider" aria-label="Sequence timeline" aria-valuenow={Math.round(playhead)} tabIndex={0}>
        {ordered.map((clip) => {
          const width = duration > 0 ? ((clip.timeline_out_seconds - clip.timeline_in_seconds) / duration) * 100 : 0;
          const asset = assets.find((candidate) => candidate.id === clip.asset_id);
          return (
            <div
              key={clip.id}
              className={`cv-timeline__clip${selectedClipId === clip.id ? " is-selected" : ""}`}
              style={{ width: `${width}%` }}
              onClick={(event) => {
                event.stopPropagation();
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
