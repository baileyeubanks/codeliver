"use client";

import { useRef, type ReactNode } from "react";
import { Activity, Info, Layers3, MessageSquareText, X, type LucideIcon } from "lucide-react";
import { useDialogFocus } from "@/components/navigation/useDialogFocus";
import type { CockpitDockTab } from "./cockpit-layout";
import styles from "./CockpitDock.module.css";

interface DockTabDefinition {
  id: CockpitDockTab;
  label: string;
  icon: LucideIcon;
}

const TABS: DockTabDefinition[] = [
  { id: "review", label: "Review", icon: MessageSquareText },
  { id: "versions", label: "Versions", icon: Layers3 },
  { id: "inspector", label: "Inspector", icon: Info },
  { id: "activity", label: "Activity", icon: Activity },
];

interface CockpitDockProps {
  idPrefix: string;
  open: boolean;
  mobileModal: boolean;
  activeTab: CockpitDockTab;
  reviewCount?: number;
  versionCount?: number;
  onTabChange: (tab: CockpitDockTab) => void;
  onClose: () => void;
  children: ReactNode;
}

export default function CockpitDock({
  idPrefix,
  open,
  mobileModal,
  activeTab,
  reviewCount = 0,
  versionCount = 0,
  onTabChange,
  onClose,
  children,
}: CockpitDockProps) {
  const dockRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabsetId = `cockpit-dock-${idPrefix.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  useDialogFocus(open && mobileModal, dockRef, onClose, closeRef);

  return (
    <section
      ref={dockRef}
      className={styles.dock}
      role={mobileModal ? "dialog" : "complementary"}
      aria-modal={mobileModal ? "true" : undefined}
      aria-label="Project operator dock"
      tabIndex={mobileModal ? -1 : undefined}
    >
      <header className={styles.header}>
        <div className={styles.tabs} role="tablist" aria-label="Operator dock tools">
          {TABS.map(({ id, label, icon: Icon }) => {
            const count = id === "review" ? reviewCount : id === "versions" ? versionCount : 0;
            return (
              <button
                id={`${tabsetId}-${id}-tab`}
                key={id}
                className={styles.tab}
                type="button"
                role="tab"
                aria-label={label}
                aria-selected={activeTab === id}
                aria-controls={`${tabsetId}-${id}-panel`}
                onClick={() => onTabChange(id)}
                title={label}
              >
                <Icon size={15} />
                <span>{label}</span>
                {count > 0 ? <span className={styles.count}>{count}</span> : null}
              </button>
            );
          })}
        </div>
        <button ref={closeRef} className={styles.close} type="button" onClick={onClose} aria-label="Close operator dock" title="Close operator dock">
          <X size={17} />
        </button>
      </header>
      <div
        id={`${tabsetId}-${activeTab}-panel`}
        className={styles.body}
        role="tabpanel"
        aria-labelledby={`${tabsetId}-${activeTab}-tab`}
      >
        {children}
      </div>
    </section>
  );
}
