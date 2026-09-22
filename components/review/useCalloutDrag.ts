"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clampCalloutDrag } from "@/lib/review/callout-geometry";

export function useCalloutDrag(cardRef: RefObject<HTMLElement | null>) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const drag = useRef<{ pointerX: number; pointerY: number; origin: { x: number; y: number } } | null>(null);

  useEffect(() => { offsetRef.current = offset; }, [offset]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const card = cardRef.current?.getBoundingClientRect();
      if (!card) return;
      const current = offsetRef.current;
      const constrained = clampCalloutDrag(
        current,
        current,
        card,
        { width: window.innerWidth, height: window.innerHeight },
      );
      if (constrained.x !== current.x || constrained.y !== current.y) {
        offsetRef.current = constrained;
        setOffset(constrained);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cardRef]);

  const stopDragging = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stopDragging);
    window.removeEventListener("pointercancel", stopDragging);
  // move is a function declaration so it is stable for this hook instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = useCallback((event: PointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const desired = {
      x: active.origin.x + event.clientX - active.pointerX,
      y: active.origin.y + event.clientY - active.pointerY,
    };
    const current = offsetRef.current;
    const card = cardRef.current?.getBoundingClientRect();
    const next = card
      ? clampCalloutDrag(current, desired, card, { width: window.innerWidth, height: window.innerHeight })
      : desired;
    offsetRef.current = next;
    setOffset(next);
  }, [cardRef]);

  useEffect(() => () => {
    drag.current = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stopDragging);
    window.removeEventListener("pointercancel", stopDragging);
  }, [move, stopDragging]);

  const beginDragging = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, origin: offsetRef.current };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stopDragging, { once: true });
    window.addEventListener("pointercancel", stopDragging, { once: true });
  }, [move, stopDragging]);

  return { offset, beginDragging };
}
