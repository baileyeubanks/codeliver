"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./FailOnStageCard.module.css";

interface FailOnStageCardProps {
  /** Retries the same route/source — the review shell never navigates away. */
  onRetry?: () => void;
  /**
   * Keep the card above the stage picture but clear of a persistent transport
   * strip (the cockpit player owns a 48px control bar at the frame bottom).
   */
  clearTransport?: boolean;
  /**
   * Operator-only honesty: the same-origin media path that went cold, so the
   * storage/load dig has the real route. Never pass signed or external URLs.
   */
  detail?: string;
  /** Approved fallback actions (e.g. an authorized download) render quietly. */
  children?: ReactNode;
}

/**
 * VA-010 recovery shape: media load failures never unmount the stage and
 * never replace the review shell. One quiet line and one blue Retry sit on
 * the dimmed frame; the poster/last frame stays visible behind the card.
 */
export default function FailOnStageCard({
  onRetry,
  clearTransport = false,
  detail,
  children,
}: FailOnStageCardProps) {
  return (
    <div
      className={`${styles.overlay} ${clearTransport ? styles.clearTransport : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.card} role="alert">
        <p className={styles.line}>Couldn&#8217;t load this cut.</p>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
        {onRetry || children ? (
          <div className={styles.actions}>
            {onRetry ? (
              <button
                type="button"
                className={styles.retry}
                onClick={onRetry}
                aria-label="Retry playback"
              >
                <RotateCcw size={13} aria-hidden="true" />
                Retry
              </button>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
