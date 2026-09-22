"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { leaderEndpoint } from "@/lib/review/callout-geometry";

export default function AnchoredLeaderLine({
  anchorRef,
  cardRef,
  refreshKey,
  className,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  cardRef: RefObject<HTMLElement | null>;
  refreshKey: string;
  className: string;
}) {
  const [endpoint, setEndpoint] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const card = cardRef.current?.getBoundingClientRect();
      if (!anchor || !card) return;
      setEndpoint(leaderEndpoint({ x: anchor.left, y: anchor.top }, card));
    };
    update();
    // The card's transform can be committed after this component's first
    // layout pass. Measure once more on the rendered frame so a newly opened
    // callout has a leader before any drag occurs.
    const animationFrame = window.requestAnimationFrame(update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    if (cardRef.current) observer?.observe(cardRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, cardRef, refreshKey]);

  return (
    <svg className={className} aria-hidden="true">
      <line x1="0" y1="0" x2={endpoint.x} y2={endpoint.y} />
    </svg>
  );
}
