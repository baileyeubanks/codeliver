"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "@/components/navigation/useDialogFocus";
import styles from "./CockpitOverviewDrawer.module.css";

export interface CockpitOverviewMetric {
  label: string;
  value: number | string;
  unit: string;
}

interface CockpitOverviewDrawerProps {
  compactRail: boolean;
  metrics: CockpitOverviewMetric[];
  open: boolean;
  projectName: string;
  viewerName: string;
  onClose: () => void;
}

export default function CockpitOverviewDrawer({
  compactRail,
  metrics,
  open,
  projectName,
  viewerName,
  onClose,
}: CockpitOverviewDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, drawerRef, onClose, closeRef);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      data-compact-rail={compactRail}
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        id="cockpit-project-overview"
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cockpit-overview-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id="cockpit-overview-title">Welcome back, {viewerName}</h2>
            <p>Here is what is happening with {projectName}.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close project overview" title="Close project overview">
            <X size={19} />
          </button>
        </header>

        <section className={styles.metrics} aria-label="Project metrics">
          {metrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.unit}</small>
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}
