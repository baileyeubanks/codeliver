"use client";

import Image from "next/image";
import {
  CircleAlert,
  Clapperboard,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
} from "lucide-react";
import React, { type CSSProperties } from "react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
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
  context?: React.ReactNode;
  media: React.ReactNode;
}

interface RailSection {
  kicker?: string;
  title?: string;
  description?: string;
  stats?: string[];
  approval?: {
    header: React.ReactNode;
    summary: React.ReactNode;
    error: string;
    content: React.ReactNode;
    footer?: React.ReactNode;
  } | null;
  completion?: {
    content: React.ReactNode;
  } | null;
  comments: {
    title: string;
    description?: string;
    countLabel: string;
    filters: Filter[];
    hasResults: boolean;
    emptyTitle: string;
    emptyDescription: string;
    content: React.ReactNode;
  };
}

export interface ReviewWorkspaceProps {
  loading: boolean;
  error: string;
  accessGate?: {
    password: string;
    error: string;
    submitting: boolean;
    onPasswordChange: (value: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  } | null;
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
  accessGate,
  brand,
  header,
  stage,
  rail,
}: ReviewWorkspaceProps) {
  const usesCanonicalProductBrand =
    !brand || brand.logoPath.startsWith("/brand/co-videopro-");
  const railStats = rail.stats ?? [];
  const hasRailHeader = Boolean(rail.kicker || rail.title || rail.description || railStats.length > 0);

  if (loading) {
    return (
      <div className={`${styles.shell} ${styles.state}`} role="status" aria-live="polite">
        <div className={styles.stateContent}>
          <CoProductionBrand
            className={styles.stateLogo}
            variant="wordmark"
            sizes="188px"
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

  if (accessGate) {
    return (
      <div className={`${styles.shell} ${styles.state}`}>
        <div className={styles.stateContent}>
          <CoProductionBrand
            className={styles.stateLogo}
            variant="wordmark"
            sizes="188px"
            priority
          />
          <LockKeyhole className={styles.stateAccessIcon} size={24} aria-hidden="true" />
          <div>
            <strong>Protected review</strong>
            <p>Enter the link password to open this version.</p>
          </div>
          <form className={styles.accessForm} onSubmit={accessGate.onSubmit}>
            <label className={styles.accessLabel} htmlFor="review-link-password">
              Password
            </label>
            <input
              id="review-link-password"
              className={styles.accessInput}
              type="password"
              value={accessGate.password}
              minLength={8}
              maxLength={128}
              autoComplete="current-password"
              autoFocus
              disabled={accessGate.submitting}
              onChange={(event) => accessGate.onPasswordChange(event.target.value)}
            />
            {accessGate.error ? (
              <p className={styles.accessError} role="alert">
                {accessGate.error}
              </p>
            ) : null}
            <button
              className={styles.accessButton}
              type="submit"
              disabled={accessGate.submitting || accessGate.password.length < 8}
            >
              {accessGate.submitting ? "Opening..." : "Open review"}
            </button>
          </form>
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
            variant="wordmark"
            sizes="188px"
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
          className={`${styles.brand} ${brand && !usesCanonicalProductBrand ? styles.customBrand : ""}`}
          aria-label={brand?.displayName ?? "Co-VideoPro by Content Co-op"}
        >
          {usesCanonicalProductBrand ? (
            <CoProductionBrand
              className={styles.productBrand}
              variant="wordmark"
              label={brand?.displayName ?? "Co-VideoPro by Content Co-op"}
              sizes="180px"
              priority
            />
          ) : brand ? (
            <Image
              className={styles.brandImage}
              src={brand.logoPath}
              alt=""
              width={44}
              height={44}
              priority
              unoptimized
            />
          ) : null}
          {brand && !usesCanonicalProductBrand ? (
            <span className={styles.brandCopy}>
              <strong>{brand.displayName}</strong>
              <small>{brand.playerLabel}</small>
            </span>
          ) : null}
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
          {stage.context ? (
            <section className={styles.context} aria-label="Review context" aria-live="polite">
              {stage.context}
            </section>
          ) : null}
        </section>

        <aside className={styles.rail} aria-labelledby="public-review-rail-heading">
          {hasRailHeader ? (
            <header className={styles.railHeader}>
              <div className={styles.sectionLead}>
                <span className={styles.sectionIcon} aria-hidden="true">
                  <MessageSquareText size={16} strokeWidth={1.9} />
                </span>
                <div className={styles.sectionCopy}>
                  {rail.kicker ? <p className={styles.kicker}>{rail.kicker}</p> : null}
                  {rail.title ? (
                    <h2 id="public-review-rail-heading" className={styles.heading}>
                      {rail.title}
                    </h2>
                  ) : null}
                  {rail.description ? <p className={styles.description}>{rail.description}</p> : null}
                </div>
              </div>
              <ReviewStats stats={railStats} label="Review rail statistics" rail />
            </header>
          ) : (
            <h2 id="public-review-rail-heading" className="sr-only">
              Review comments
            </h2>
          )}

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
              {rail.comments.description ? <p>{rail.comments.description}</p> : null}
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

          {rail.completion ? (
            <section className={styles.completion} aria-label="Review completion">
              {rail.completion.content}
            </section>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
