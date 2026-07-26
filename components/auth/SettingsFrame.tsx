import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  Palette,
  ServerCog,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { SettingsTab } from "./settings-route";
import styles from "./SettingsPillar.module.css";

export type { SettingsTab } from "./settings-route";

const SETTINGS_TABS: Array<{
  value: SettingsTab;
  label: string;
  icon: typeof UserRound;
}> = [
  { value: "account", label: "Account", icon: UserRound },
  { value: "organization", label: "Organization", icon: Building2 },
  { value: "security", label: "Security", icon: ShieldCheck },
  { value: "preferences", label: "Preferences", icon: Settings2 },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "systems", label: "Systems", icon: ServerCog },
  { value: "brand", label: "Brand", icon: Palette },
];

export function SettingsToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    />
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "info";
}) {
  const toneClass = {
    neutral: "",
    good: styles.statusGood,
    warn: styles.statusWarn,
    info: styles.statusInfo,
  }[tone];
  return <span className={`${styles.status} ${toneClass}`}>{children}</span>;
}

export function SettingsSection({
  title,
  detail,
  action,
  children,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>
          <h2>{title}</h2>
          {detail ? <p>{detail}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function SettingsFrame({
  activeTab,
  onTabChange,
  notice,
  demoMode,
  highContrast,
  children,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  notice: string;
  demoMode: boolean;
  highContrast: boolean;
  children: ReactNode;
}) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const activeButton = document.getElementById(`settings-tab-${activeTab}`);
    const nav = navRef.current;
    if (!activeButton || !nav) return;

    function revealActiveTab() {
      if (!activeButton || !nav) return;
      const navBounds = nav.getBoundingClientRect();
      const tabBounds = activeButton.getBoundingClientRect();
      if (tabBounds.left < navBounds.left) {
        nav.scrollLeft -= navBounds.left - tabBounds.left;
      } else if (tabBounds.right > navBounds.right) {
        nav.scrollLeft += tabBounds.right - navBounds.right;
      }
    }

    revealActiveTab();
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeTab]);

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = SETTINGS_TABS.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = SETTINGS_TABS[nextIndex];
    onTabChange(nextTab.value);
    requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${nextTab.value}`)?.focus();
    });
  }

  return (
    <div className={`${styles.page} ${highContrast ? styles.highContrast : ""}`}>
      <header className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <h1>Settings</h1>
          <p>Account, organization, access policy, and client-facing identity.</p>
        </div>
        <div className={styles.headerStatus}>
          {notice ? (
            <span className={styles.notice} role="status" aria-live="polite">
              <CheckCircle2 size={14} aria-hidden="true" /> {notice}
            </span>
          ) : null}
          <span className={styles.modeBadge}>
            {demoMode ? "Local governance demo" : "Managed account"}
          </span>
        </div>
      </header>

      <div className={styles.layout}>
        <nav
          ref={navRef}
          className={styles.nav}
          aria-label="Settings sections"
          role="tablist"
          aria-orientation="vertical"
        >
          {SETTINGS_TABS.map(({ value, label, icon: Icon }, index) => (
            <button
              key={value}
              id={`settings-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              aria-controls="settings-panel"
              tabIndex={activeTab === value ? 0 : -1}
              onClick={() => onTabChange(value)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <main
          id="settings-panel"
          className={styles.content}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export { styles as settingsStyles };
