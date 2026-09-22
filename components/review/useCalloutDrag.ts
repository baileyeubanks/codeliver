"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clampCalloutDrag } from "@/lib/review/callout-geometry";

function visibleViewport() {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
  };
}

export function useCalloutDrag(cardRef: RefObject<HTMLElement | null>) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const drag = useRef<{ pointerX: number; pointerY: number; origin: { x: number; y: number } } | null>(null);

  useEffect(() => { offsetRef.current = offset; }, [offset]);

  useLayoutEffect(() => {
    let frame = 0;
    const constrain = () => {
      const element = cardRef.current;
      if (!element) return;
      const viewport = visibleViewport();
      element.style.setProperty("--callout-viewport-height", `${viewport.height}px`);
      const card = element.getBoundingClientRect();
      const current = offsetRef.current;
      const constrained = clampCalloutDrag(
        current,
        current,
        card,
        viewport,
      );
      if (Math.abs(constrained.x - current.x) > 0.5 || Math.abs(constrained.y - current.y) > 0.5) {
        offsetRef.current = constrained;
        setOffset(constrained);
      }
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(constrain);
    };
    schedule();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (cardRef.current) {
      observer?.observe(cardRef.current);
      if (cardRef.current.parentElement?.parentElement) observer?.observe(cardRef.current.parentElement.parentElement);
    }
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
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
      ? clampCalloutDrag(current, desired, card, visibleViewport())
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
