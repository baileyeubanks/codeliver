"use client";

import Image from "next/image";
import {
  CircleAlert,
  Clapperboard,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
} from "lucide-react";
import React, { type CSSProperties } from "react";
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

function ReviewStats({
  stats,
  label,
  rail = false,
}: {
  stats: string[];
  label: string;
  rail?: boolean;
}) {
  if (stats.length === 0) return null;

  return (
    <ul
      className={`${styles.stats} ${rail ? styles.railStats : ""}`}
      aria-label={label}
    >
      {stats.map((stat, index) => (
        <li key={`${stat}-${index}`}>{stat}</li>
      ))}
    </ul>
  );
}

export default function PublicReviewWorkspace({
  loading,
  error,
  brand,
  header,
  stage,
  rail,
}: ReviewWorkspaceProps) {
  if (loading) {
    return (
      <div className={`${styles.shell} ${styles.state}`} role="status" aria-live="polite">
        <div className={styles.stateContent}>
          <CoProductionBrand
            className={styles.stateLogo}
            variant="horizontal"
            label="Co-VideoPro by Content Co-op"
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
            label="Co-VideoPro by Content Co-op"
            priority
          />
          <CircleAlert className={styles.stateErrorIcon} size={24} aria-hidden="true" />
          <div>
            <strong>Review unavailable</strong>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.shell}
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
          aria-label={brand?.displayName ?? "Co-VideoPro by Content Co-op"}
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
              label="Co-VideoPro by Content Co-op"
              priority
            />
          )}
        </div>
        <div className={styles.meta}>{header}</div>
      </header>

      <main id="public-review-workspace" className={styles.body} tabIndex={-1}>
        <section className={styles.stage} aria-labelledby="public-review-stage-heading">
          <header className={styles.stageHeader}>
            <div className={styles.sectionLead}>
              <span className={styles.sectionIcon} aria-hidden="true">
                <Clapperboard size={16} strokeWidth={1.9} />
              </span>
              <div className={styles.sectionCopy}>
                <p className={styles.kicker}>{stage.kicker}</p>
                <h2 id="public-review-stage-heading" className={styles.heading}>
                  {stage.title}
                </h2>
                <p className={styles.description}>{stage.description}</p>
              </div>
            </div>

            <ReviewStats stats={stage.stats} label="Review statistics" />
          </header>

          <div className={styles.media}>{stage.media}</div>
          <section className={styles.context} aria-label="Review context" aria-live="polite">
            {stage.context}
          </section>
        </section>

        <aside className={styles.rail} aria-labelledby="public-review-rail-heading">
          <header className={styles.railHeader}>
            <div className={styles.sectionLead}>
              <span className={styles.sectionIcon} aria-hidden="true">
                <MessageSquareText size={16} strokeWidth={1.9} />
              </span>
              <div className={styles.sectionCopy}>
                <p className={styles.kicker}>{rail.kicker}</p>
                <h2 id="public-review-rail-heading" className={styles.heading}>
                  {rail.title}
                </h2>
                <p className={styles.description}>{rail.description}</p>
              </div>
            </div>
            <ReviewStats stats={rail.stats} label="Review rail statistics" rail />
          </header>

          {rail.intro ? (
            <section className={styles.guide} aria-labelledby="public-review-guide-heading">
              <div className={styles.panelHeading}>
                <ListChecks size={15} aria-hidden="true" />
                <h3 id="public-review-guide-heading">Review flow</h3>
              </div>
              <div className={styles.guideContent}>{rail.intro}</div>
            </section>
          ) : null}

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
            <header className={styles.commentsHeader}>
              <div className={styles.commentsTitleRow}>
                <h3 id="public-review-comments-heading">{rail.comments.title}</h3>
                <span>{rail.comments.countLabel}</span>
              </div>
              <p>{rail.comments.description}</p>
            </header>

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

          <div className={styles.composer}>{rail.composer}</div>
        </aside>
      </main>
    </div>
  );
}
