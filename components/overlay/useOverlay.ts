"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  computeOverlayPosition,
  type OverlayAlign,
  type OverlaySide,
} from "./overlay-position.ts";

// One global dismiss stack for every anchored overlay: Escape closes only the
// topmost layer, no matter where focus sits (search inputs included), and an
// outside pointer-down closes the layer. Fixes the per-component mousedown
// listeners that each popover used to wire (or forget) by hand.
const dismissStack: Array<() => void> = [];
let dismissStackAttached = false;

function attachDismissStack() {
  if (dismissStackAttached || typeof document === "undefined") return;
  dismissStackAttached = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || dismissStack.length === 0) return;
    event.preventDefault();
    dismissStack.at(-1)?.();
  });
}

interface UseOverlayOptions {
  open: boolean;
  onClose: () => void;
  /** The trigger element the overlay is anchored to. */
  anchorRef: RefObject<HTMLElement | null>;
  side?: OverlaySide;
  align?: OverlayAlign;
  offset?: number;
  padding?: number;
  /** Return focus to the previously focused element (usually the trigger) on close. */
  returnFocus?: boolean;
}

const HIDDEN_STYLE: CSSProperties = { position: "fixed", visibility: "hidden" };

export function useOverlay({
  open,
  onClose,
  anchorRef,
  side = "bottom",
  align = "end",
  offset = 8,
  padding = 8,
  returnFocus = true,
}: UseOverlayOptions) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<CSSProperties>(HIDDEN_STYLE);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setOverlayStyle(HIDDEN_STYLE);
      return;
    }

    attachDismissStack();
    const close = () => onCloseRef.current();
    dismissStack.push(close);
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || overlayRef.current?.contains(target)) return;
      onCloseRef.current();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      const index = dismissStack.indexOf(close);
      if (index !== -1) dismissStack.splice(index, 1);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      const returnTarget = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (returnFocus && returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
      }
    };
    // anchorRef/overlayRef are stable ref objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, returnFocus]);

  useEffect(() => {
    if (!open) return;

    let frame = 0;
    function updatePosition() {
      frame = 0;
      const anchor = anchorRef.current;
      const overlay = overlayRef.current;
      if (!anchor || !overlay) return;
      const next = computeOverlayPosition({
        anchor: anchor.getBoundingClientRect(),
        overlay: { width: overlay.offsetWidth, height: overlay.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        side,
        align,
        offset,
        padding,
      });
      setOverlayStyle({
        position: "fixed",
        top: next.top,
        left: next.left,
        right: "auto",
        bottom: "auto",
        margin: 0,
        visibility: "visible",
      });
    }
    function schedulePosition() {
      if (!frame) frame = window.requestAnimationFrame(updatePosition);
    }

    updatePosition();
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side, align, offset, padding]);

  return [overlayRef, overlayStyle] as const;
}
