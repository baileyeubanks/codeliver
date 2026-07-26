"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export interface ShowreelClip {
  /** Video source (mp4). Omit for a still frame held with the editorial drift. */
  src?: string;
  /** Still frame shown while the film loads, under reduced motion, and as the frame itself for still clips. */
  poster: string;
  /** Quiet mono label, e.g. "REEL 01 — FIELD INTERVIEW". */
  label: string;
}

const CLIP_MS = 9000;

/**
 * Studio Home showreel stage — full-bleed selected film imagery with a slow
 * editorial crop drift, controlled cross-dissolves, and a quiet cobalt
 * progress line. Decorative by contract: the frame is aria-hidden and all
 * meaning lives in the copy layer above it.
 *
 * Reduced motion: no cycling, no drift — the first frame becomes still
 * photography and the progress line rests.
 */
export function ShowreelStage({
  clips,
}: {
  clips: readonly ShowreelClip[];
}) {
  const [current, setCurrent] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [cycle, setCycle] = useState(0);
  const [still, setStill] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (still || clips.length < 2) return;

    const advance = () => {
      setPrevious(current);
      setCurrent((c) => (c + 1) % clips.length);
      setCycle((n) => n + 1);
    };

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        advance();
        schedule();
      }, CLIP_MS);
    };
    schedule();

    const onVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (cleanupRef.current) clearTimeout(cleanupRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // `current` intentionally read at advance time via closure refresh
  }, [still, clips.length, current]);

  // Drop the outgoing layer after the dissolve completes.
  useEffect(() => {
    if (previous === null) return;
    cleanupRef.current = setTimeout(() => setPrevious(null), 1800);
    return () => {
      if (cleanupRef.current) clearTimeout(cleanupRef.current);
    };
  }, [previous]);

  if (still) {
    return (
      <>
        <div className="cpv-reel__frame" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={clips[0].poster} alt="" />
        </div>
        <div className="cpv-reel__meta">
          <span className="cpv-reel__clip">{clips[0].label}</span>
        </div>
      </>
    );
  }

  const layers = [previous, current].filter((i): i is number => i !== null);

  return (
    <>
      <div className="cpv-reel__frame" aria-hidden="true">
        {layers.map((i) =>
          clips[i].src ? (
            <video
              key={`${i}-${i === current ? cycle : cycle - 1}`}
              className={i === current && previous !== null ? "is-entering" : undefined}
              src={clips[i].src}
              poster={clips[i].poster}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${i}-${i === current ? cycle : cycle - 1}`}
              className={i === current && previous !== null ? "is-entering" : undefined}
              src={clips[i].poster}
              alt=""
            />
          ),
        )}
      </div>
      <div className="cpv-reel__meta" style={{ "--reel-clip-ms": `${CLIP_MS}ms` } as CSSProperties}>
        <span className="cpv-reel__track" aria-hidden="true">
          <span key={cycle} />
        </span>
        <span className="cpv-reel__clip">
          {clips[current].label}
          <span className="cpv-reel__index">
            &nbsp;&nbsp;{String(current + 1).padStart(2, "0")} / {String(clips.length).padStart(2, "0")}
          </span>
        </span>
      </div>
    </>
  );
}

export { CLIP_MS as SHOWREEL_CLIP_MS };
