"use client";

import Image from "next/image";
import {
  CircleAlert,
  Focus,
  LoaderCircle,
} from "lucide-react";
import React, { useState, type CSSProperties } from "react";
import { CoProductionBrand } from "@/components/brand/CoProductionBrand";
import styles from "./PublicReviewWorkspace.module.css";

interface Filter {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

interface StageSection {
  kicker: string;
  title: string;
  description: string;
  stats: string[];
  context: React.ReactNode;
  media: React.ReactNode;
}

interface RailSection {
  kicker: string;
  title: string;
  description: string;
  stats: string[];
  intro: React.ReactNode;
  approval?: {
    header: React.ReactNode;
    summary: React.ReactNode;
    error: string;
    content: React.ReactNode;
    footer?: React.ReactNode;
  } | null;
  comments: {
    title: string;
    description: string;
    countLabel: string;
    filters: Filter[];
    hasResults: boolean;
    emptyTitle: string;
    emptyDescription: string;
    content: React.ReactNode;
  };
  composer: React.ReactNode;
}

export interface ReviewWorkspaceProps {
  loading: boolean;
  error: string;
  errorAction?: {
    href: string;
    label: string;
  };
  brand?: {
    displayName: string;
    playerLabel: string;
    primaryColor: string;
    logoPath: string;
  };
  header: React.ReactNode;
  stage: StageSection;
  rail: RailSection;
}

export default function PublicReviewWorkspace({
  loading,
  error,
  errorAction,
  brand,
  header,
  stage,
  rail,
}: ReviewWorkspaceProps) {
  const [focused, setFocused] = useState(false);

  if (loading) {
    return (
      <div className={`${styles.shell} ${styles.state}`} role="status" aria-live="polite">
        <div className={styles.stateContent}>
          <CoProductionBrand
            className={styles.stateLogo}
            variant="horizontal"
            label="Co‑VideoPro by Content Co-op"
            priority
          />
          <LoaderCircle className={styles.stateSpinner} size={24} aria-hidden="true" />
          <div>
            <strong>Preparing your review</strong>
            <p>Loading the latest version, comments, and approval state.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.shell} ${styles.state}`} role="alert">
        <div className={styles.stateContent}>
          <CoProductionBrand
            className={styles.stateLogo}
            variant="horizontal"
            label="Co‑VideoPro by Content Co-op"
            priority
          />
          <CircleAlert className={styles.stateErrorIcon} size={24} aria-hidden="true" />
          <div>
            <strong>Review unavailable</strong>
            <p>{error}</p>
            {errorAction ? <a href={errorAction.href}>{errorAction.label}</a> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.shell} ${focused ? styles.focused : ""}`}
      style={
        brand
          ? ({ "--accent": brand.primaryColor } as CSSProperties)
          : undefined
      }
    >
      <a className={styles.skipLink} href="#public-review-workspace">
        Skip to review workspace
      </a>

      <header className={styles.header} aria-label="Review header">
        <div
          className={`${styles.brand} ${brand ? styles.customBrand : styles.productBrand}`}
          aria-label={brand?.displayName ?? "Co‑VideoPro by Content Co-op"}
        >
          {brand ? (
            <>
              <Image
                className={styles.brandImage}
                src={brand.logoPath}
                alt=""
                width={44}
                height={44}
                priority
              />
              <span className={styles.brandCopy}>
                <strong>{brand.displayName}</strong>
                <small>{brand.playerLabel}</small>
              </span>
            </>
          ) : (
            <CoProductionBrand
              className={styles.brandLockup}
              variant="horizontal"
              label="Co‑VideoPro by Content Co-op"
              priority
            />
          )}
        </div>
        <div className={styles.meta}>{header}</div>
      </header>

      <main id="public-review-workspace" className={styles.body} tabIndex={-1}>
        <section className={styles.stage} aria-labelledby="public-review-stage-heading">
          <div className={styles.stageToolbar}>
            <h2 id="public-review-stage-heading" className={styles.visuallyHidden}>
              {stage.title}
            </h2>
            <button
              type="button"
              className={styles.focusButton}
              aria-pressed={focused}
              onClick={() => setFocused((value) => !value)}
            >
              <Focus size={15} aria-hidden="true" />
              {focused ? "Show review" : "Focus player"}
            </button>
          </div>

          <div className={styles.media}>{stage.media}</div>
          {stage.context ? (
            <section className={styles.context} aria-label="Selected comment" aria-live="polite">
              {stage.context}
            </section>
          ) : null}
        </section>

        <aside className={styles.rail} aria-labelledby="public-review-rail-heading">
          <header className={styles.railHeader}>
            <div>
              <h2 id="public-review-rail-heading" className={styles.railTitle}>
                {rail.title}
              </h2>
              <p className={styles.visuallyHidden}>{rail.description}</p>
            </div>
            <div className={styles.railMeta}>
              <span>{rail.comments.countLabel}</span>
              {rail.stats[0] ? <span>{rail.stats[0]}</span> : null}
            </div>
          </header>

          {rail.intro ? (
            <section className={styles.guide} aria-labelledby="public-review-guide-heading">
              <h3 id="public-review-guide-heading" className={styles.visuallyHidden}>
                Review flow
              </h3>
              <div className={styles.guideContent}>{rail.intro}</div>
            </section>
          ) : null}

          {/* Keep the note composer at the top of the review pane. Approval
              steps can be long, and a reviewer must not have to scroll past
              them before they can leave a timecoded note. */}
          <div className={styles.composer}>{rail.composer}</div>

          {rail.approval ? (
            <section className={styles.approval} aria-label="Approval">
              <div className={styles.approvalContent}>
                {rail.approval.header}
                {rail.approval.summary}
                {rail.approval.error ? (
                  <p className={styles.approvalError} role="alert">
                    {rail.approval.error}
                  </p>
                ) : null}
                <div className={styles.approvalSteps}>{rail.approval.content}</div>
                {rail.approval.footer}
              </div>
            </section>
          ) : null}

          <section className={styles.comments} aria-labelledby="public-review-comments-heading">
            <h3 id="public-review-comments-heading" className={styles.visuallyHidden}>
              {rail.comments.title}
            </h3>

            {rail.comments.filters.length > 0 ? (
              <div className={styles.filters} role="group" aria-label="Comment filters">
                {rail.comments.filters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={filter.onClick}
                    aria-pressed={filter.active}
                    className={filter.active ? styles.activeFilter : undefined}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.commentList}>
              {rail.comments.hasResults ? (
                rail.comments.content
              ) : (
                <div className={styles.emptyComments}>
                  <p>{rail.comments.emptyTitle}</p>
                  <span>{rail.comments.emptyDescription}</span>
                </div>
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
