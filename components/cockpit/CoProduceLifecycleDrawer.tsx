"use client";

import Link from "next/link";
import {
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  Clapperboard,
  Clock3,
  Lightbulb,
  LockKeyhole,
  Minus,
  MonitorPlay,
  PackageCheck,
  PanelRightOpen,
  TriangleAlert,
  UserRoundCheck,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/navigation/useDialogFocus";
import styles from "./CoProduceLifecycleDrawer.module.css";

export type CoProduceLifecyclePhaseId =
  | "pre-production"
  | "production"
  | "post-production"
  | "delivery-assets";

export type CoProduceLifecycleTone =
  | "neutral"
  | "active"
  | "waiting"
  | "attention"
  | "complete";

export interface CoProduceLifecycleStatus {
  label: string;
  tone: CoProduceLifecycleTone;
}

export interface CoProduceLifecycleSurfaceLink {
  label: string;
  href: string;
}

export interface CoProduceLifecyclePhase {
  href: string | null;
  progress: number;
  progressLabel?: string;
  status: CoProduceLifecycleStatus;
  agentStatus: CoProduceLifecycleStatus;
  humanStatus: CoProduceLifecycleStatus;
  links: readonly CoProduceLifecycleSurfaceLink[];
}

export type CoProduceLifecycleData = Readonly<
  Record<CoProduceLifecyclePhaseId, CoProduceLifecyclePhase>
>;

export interface CoProduceLifecycleDestination {
  phaseId: CoProduceLifecyclePhaseId;
  href: string;
  kind: "phase" | "surface";
}

export interface CoProduceLifecycleDrawerProps {
  phases: CoProduceLifecycleData;
  className?: string;
  id?: string;
  triggerLabel?: string;
  title?: string;
  description?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onNavigate?: (destination: CoProduceLifecycleDestination) => void;
}

interface PhaseDefinition {
  id: CoProduceLifecyclePhaseId;
  label: string;
  sequence: string;
  icon: LucideIcon;
}

const PHASE_DEFINITIONS: readonly PhaseDefinition[] = [
  {
    id: "pre-production",
    label: "Pre-production",
    sequence: "01",
    icon: Lightbulb,
  },
  {
    id: "production",
    label: "Production",
    sequence: "02",
    icon: Clapperboard,
  },
  {
    id: "post-production",
    label: "Post-production",
    sequence: "03",
    icon: MonitorPlay,
  },
  {
    id: "delivery-assets",
    label: "Delivery & Assets",
    sequence: "04",
    icon: PackageCheck,
  },
];

const STATUS_ICONS: Readonly<Record<CoProduceLifecycleTone, LucideIcon>> = {
  neutral: Minus,
  active: CircleDot,
  waiting: Clock3,
  attention: TriangleAlert,
  complete: Check,
};

function StatusIcon({
  tone,
  size = 11,
}: {
  tone: CoProduceLifecycleTone;
  size?: number;
}) {
  const Icon = STATUS_ICONS[tone];
  return <Icon className={styles.statusIcon} size={size} aria-hidden="true" />;
}

function normalizeProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function subscribeToPortalTarget() {
  return () => undefined;
}

function getPortalTarget() {
  return document.body;
}

function getServerPortalTarget() {
  return null;
}

export default function CoProduceLifecycleDrawer({
  phases,
  className,
  id,
  triggerLabel = "Lifecycle",
  title = "Webster lifecycle",
  description = "Agent and human checkpoints across four production phases.",
  open,
  defaultOpen = false,
  onOpenChange,
  onNavigate,
}: CoProduceLifecycleDrawerProps) {
  const generatedId = useId().replaceAll(":", "");
  const panelId = id ?? `co-produce-lifecycle-${generatedId}`;
  const titleId = `${panelId}-title`;
  const descriptionId = `${panelId}-description`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const portalTarget = useSyncExternalStore(
    subscribeToPortalTarget,
    getPortalTarget,
    getServerPortalTarget,
  );
  const isOpen = open ?? internalOpen;
  const dialogOpen = isOpen && portalTarget !== null;
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  const closeDrawer = useCallback(() => setOpen(false), [setOpen]);
  useDialogFocus(dialogOpen, drawerRef, closeDrawer, closeRef, true, triggerRef);

  const navigate = useCallback(
    (destination: CoProduceLifecycleDestination) => {
      onNavigate?.(destination);
      closeDrawer();
    },
    [closeDrawer, onNavigate],
  );

  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`${isOpen ? "Close" : "Open"} ${title}`}
        title={title}
        onClick={() => setOpen(!isOpen)}
      >
        <PanelRightOpen size={15} aria-hidden="true" />
        <span className={styles.triggerText}>{triggerLabel}</span>
      </button>

      {isOpen && portalTarget
        ? createPortal(
          <div className={styles.overlay} role="presentation" onMouseDown={closeDrawer}>
          <aside
            id={panelId}
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.header}>
              <div className={styles.heading}>
                <span className={styles.eyebrow}>
                  <Workflow size={13} aria-hidden="true" />
                  Project workflow
                </span>
                <h2 id={titleId}>{title}</h2>
                <p id={descriptionId}>{description}</p>
              </div>
              <button
                ref={closeRef}
                className={styles.close}
                type="button"
                aria-label={`Close ${title}`}
                title={`Close ${title}`}
                onClick={closeDrawer}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.body}>
              <ol className={styles.phaseList} aria-label="Webster lifecycle phases">
                {PHASE_DEFINITIONS.map(({ id: phaseId, label, sequence, icon: Icon }) => {
                  const phase = phases[phaseId];
                  const progress = normalizeProgress(phase.progress);
                  const phaseTitleId = `${panelId}-${phaseId}-title`;
                  const phaseLinkContent = (
                    <>
                      <span className={styles.phaseIcon} aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <div className={styles.phaseTitle}>
                        <small aria-label={`Phase ${sequence}`}>{sequence}</small>
                        <h3 id={phaseTitleId}>{label}</h3>
                      </div>
                      {phase.href ? (
                        <ChevronRight
                          className={styles.phaseChevron}
                          size={15}
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className={styles.phaseUnavailable}
                          title={`${label} unavailable`}
                        >
                          <LockKeyhole size={13} aria-hidden="true" />
                          <span className={styles.srOnly}>Unavailable</span>
                        </span>
                      )}
                    </>
                  );

                  return (
                    <li
                      key={phaseId}
                      className={styles.phaseItem}
                      data-phase={phaseId}
                      data-tone={phase.status.tone}
                      data-available={phase.href ? "true" : "false"}
                    >
                      <section className={styles.phase} aria-labelledby={phaseTitleId}>
                        <div className={styles.phaseHeader}>
                          {phase.href ? (
                            <Link
                              className={styles.phaseLink}
                              href={phase.href}
                              onClick={() =>
                                navigate({ phaseId, href: phase.href!, kind: "phase" })
                              }
                            >
                              {phaseLinkContent}
                            </Link>
                          ) : (
                            <div
                              className={`${styles.phaseLink} ${styles.phaseLinkUnavailable}`}
                              aria-disabled="true"
                            >
                              {phaseLinkContent}
                            </div>
                          )}
                          <span className={styles.status} data-tone={phase.status.tone}>
                            <StatusIcon tone={phase.status.tone} />
                            <span>{phase.status.label}</span>
                          </span>
                        </div>

                        <div className={styles.phaseDetails}>
                          <div className={styles.progressRow}>
                            <span>Record evidence</span>
                            <progress
                              className={styles.progress}
                              value={progress}
                              max={100}
                              aria-label={`${label} record evidence`}
                            >
                              {progress}%
                            </progress>
                            <strong>{phase.progressLabel ?? `${progress}%`}</strong>
                          </div>

                          <dl className={styles.actors}>
                            <div className={styles.actor}>
                              <dt>
                                <Bot size={13} aria-hidden="true" />
                                Agent
                              </dt>
                              <dd data-tone={phase.agentStatus.tone}>
                                <StatusIcon tone={phase.agentStatus.tone} />
                                <span>{phase.agentStatus.label}</span>
                              </dd>
                            </div>
                            <div className={styles.actor}>
                              <dt>
                                <UserRoundCheck size={13} aria-hidden="true" />
                                Human in the loop
                              </dt>
                              <dd data-tone={phase.humanStatus.tone}>
                                <StatusIcon tone={phase.humanStatus.tone} />
                                <span>{phase.humanStatus.label}</span>
                              </dd>
                            </div>
                          </dl>

                          {phase.links.length > 0 ? (
                            <nav className={styles.surfaceNav} aria-label={`${label} surfaces`}>
                              <ul>
                                {phase.links.map((link) => (
                                  <li key={`${link.href}-${link.label}`}>
                                    <Link
                                      className={styles.surfaceLink}
                                      href={link.href}
                                      onClick={() =>
                                        navigate({
                                          phaseId,
                                          href: link.href,
                                          kind: "surface",
                                        })
                                      }
                                    >
                                      <span>{link.label}</span>
                                      <ChevronRight size={12} aria-hidden="true" />
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </nav>
                          ) : null}
                        </div>
                      </section>
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>
          </div>,
          portalTarget,
        )
        : null}
    </div>
  );
}
