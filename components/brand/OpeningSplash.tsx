"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./OpeningSplash.module.css";

const SESSION_KEY = "co-videopro-opening-seen-v1";
const APP_ROOT_ID = "co-videopro-app-root";
const MOBILE_MAX_VISIBLE_MS = 6_000;
const DESKTOP_MAX_VISIBLE_MS = 16_000;
const FALLBACK_HOLD_MS = 1_250;
const EXIT_MS = 300;

type SplashState = "checking" | "visible" | "leaving" | "hidden";
type OpeningVariant = "mobile" | "desktop";

const OPENING_MEDIA = {
  desktop: {
    src: "/brand/co-videopro-opening-desktop.mp4",
    poster: "/brand/co-videopro-opening-desktop-poster.jpg",
    width: 1600,
    height: 900,
  },
  mobile: {
    src: "/brand/co-videopro-opening-motion.mp4",
    poster: "/brand/co-videopro-opening-mobile-poster.jpg",
    width: 540,
    height: 960,
  },
} as const;

export default function OpeningSplash() {
  const [state, setState] = useState<SplashState>("checking");
  const [variant, setVariant] = useState<OpeningVariant | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const previousOverflowRef = useRef<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousAppInertRef = useRef(false);
  const previousAppAriaHiddenRef = useRef<string | null>(null);
  const visibleStartedAtRef = useRef(0);
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const exitTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);

  const restoreDocument = useCallback((markSeen: boolean) => {
    const previousOverflow = previousOverflowRef.current;
    if (previousOverflow !== null) {
      if (previousOverflow) {
        document.documentElement.style.overflow = previousOverflow;
      } else {
        document.documentElement.style.removeProperty("overflow");
      }
      previousOverflowRef.current = null;
    }

    const appRoot = document.getElementById(APP_ROOT_ID);
    if (appRoot) {
      if (previousAppInertRef.current) {
        appRoot.setAttribute("inert", "");
      } else {
        appRoot.removeAttribute("inert");
      }
      const previousAriaHidden = previousAppAriaHiddenRef.current;
      if (previousAriaHidden === null) {
        appRoot.removeAttribute("aria-hidden");
      } else {
        appRoot.setAttribute("aria-hidden", previousAriaHidden);
      }
    }

    document.documentElement.dataset.openingSplash = markSeen ? "seen" : "pending";

    if (markSeen) {
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected && !previousFocus.closest(`#${APP_ROOT_ID}[inert]`)) {
        previousFocus.focus({ preventScroll: true });
      }
    }
  }, []);

  const close = useCallback(() => {
    setState((current) =>
      current === "hidden" || current === "checking" ? current : "leaving",
    );
    if (exitTimerRef.current === null) {
      exitTimerRef.current = window.setTimeout(() => setState("hidden"), EXIT_MS);
    }
  }, []);

  const handleVideoError = useCallback(() => {
    setVideoFailed(true);
    if (fallbackTimerRef.current === null) {
      fallbackTimerRef.current = window.setTimeout(close, FALLBACK_HOLD_MS);
    }
  }, [close]);

  useEffect(() => {
    const bootstrapState = document.documentElement.dataset.openingSplash;
    let shouldPlay = bootstrapState !== "seen";

    if (bootstrapState !== "pending" && bootstrapState !== "seen") {
      try {
        shouldPlay = window.sessionStorage.getItem(SESSION_KEY) !== "true";
        if (shouldPlay) window.sessionStorage.setItem(SESSION_KEY, "true");
      } catch {
        shouldPlay = true;
      }
    }

    if (!shouldPlay) {
      document.documentElement.dataset.openingSplash = "seen";
      const hideFrame = window.requestAnimationFrame(() => setState("hidden"));
      return () => window.cancelAnimationFrame(hideFrame);
    }

    const mobileQuery = window.matchMedia("(max-width: 640px)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncVariant = () => {
      setVideoFailed(false);
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setVariant(mobileQuery.matches ? "mobile" : "desktop");
    };
    const syncMotionPreference = () => setReduceMotion(reducedMotionQuery.matches);

    mobileQuery.addEventListener("change", syncVariant);
    reducedMotionQuery.addEventListener("change", syncMotionPreference);

    previousOverflowRef.current = document.documentElement.style.overflow;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById(APP_ROOT_ID);
    if (appRoot) {
      previousAppInertRef.current = appRoot.hasAttribute("inert");
      previousAppAriaHiddenRef.current = appRoot.getAttribute("aria-hidden");
      appRoot.setAttribute("inert", "");
      appRoot.setAttribute("aria-hidden", "true");
    }

    document.documentElement.style.overflow = "hidden";
    let focusFrame: number | null = null;
    const revealFrame = window.requestAnimationFrame(() => {
      syncVariant();
      syncMotionPreference();
      visibleStartedAtRef.current = window.performance.now();
      document.documentElement.dataset.openingSplash = "visible";
      setState("visible");
      focusFrame = window.requestAnimationFrame(() => {
        skipButtonRef.current?.focus({ preventScroll: true });
      });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(revealFrame);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      mobileQuery.removeEventListener("change", syncVariant);
      reducedMotionQuery.removeEventListener("change", syncMotionPreference);
      window.removeEventListener("keydown", handleKeyDown);
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      restoreDocument(false);
    };
  }, [close, restoreDocument]);

  useEffect(() => {
    if (state !== "visible" || variant === null) return;

    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    const maxVisibleMs = reduceMotion
      ? 180
      : variant === "mobile"
        ? MOBILE_MAX_VISIBLE_MS
        : DESKTOP_MAX_VISIBLE_MS;
    const elapsed = window.performance.now() - visibleStartedAtRef.current;
    holdTimerRef.current = window.setTimeout(close, Math.max(0, maxVisibleMs - elapsed));

    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, [close, reduceMotion, state, variant]);

  useEffect(() => {
    if (state === "hidden") restoreDocument(true);
  }, [restoreDocument, state]);

  if (state === "checking" || state === "hidden" || variant === null) return null;

  const media = OPENING_MEDIA[variant];

  return (
    <div
      className={styles.splash}
      data-state={state}
      data-variant={variant}
      role="dialog"
      aria-modal="true"
      aria-label="Opening Co-VideoPro"
    >
      <button
        ref={skipButtonRef}
        className={styles.skip}
        type="button"
        onClick={close}
        aria-label="Skip opening animation"
        title="Skip opening animation"
      >
        <X size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>

      <div className={styles.stage} data-video-failed={videoFailed || undefined}>
        <div className={styles.mediaFrame}>
          <Image
            key={`poster-${variant}`}
            className={styles.fallback}
            src={media.poster}
            alt="Co-VideoPro"
            width={media.width}
            height={media.height}
            sizes={variant === "mobile" ? "min(540px, 92vw, 46dvh)" : "min(960px, 92vw, 82dvh)"}
            priority
            unoptimized
            draggable={false}
          />
          {!videoFailed && !reduceMotion ? (
            <video
              key={variant}
              className={styles.motion}
              src={media.src}
              poster={media.poster}
              autoPlay
              muted
              playsInline
              preload="auto"
              onEnded={close}
              onError={handleVideoError}
              aria-hidden="true"
            />
          ) : null}
        </div>
        <span className={styles.progress} aria-hidden="true">
          <span />
        </span>
      </div>
    </div>
  );
}
