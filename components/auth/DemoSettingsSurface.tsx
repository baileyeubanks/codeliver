"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Mail,
  MessagesSquare,
  Save,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { BRAND_GOVERNANCE_STORAGE_KEY, type ResolvedBrandValues } from "@contentco-op/brand";
import BrandSettings from "@/components/auth/BrandSettings";
import {
  AccountSettings,
  OrganizationSettings,
  PreferenceSettings,
  SecuritySettings,
} from "@/components/auth/IdentitySettings";
import SettingsFrame, {
  StatusBadge,
  SettingsToggle,
  type SettingsTab,
  type SettingsNotice,
  type SettingsNoticeTone,
} from "@/components/auth/SettingsFrame";
import { resolveSettingsTab } from "@/components/auth/settings-route";
import { resetBrandGovernanceDemoCache } from "@/components/auth/useBrandGovernanceDemo";
import { useEnterpriseIdentityDemo } from "@/components/auth/useEnterpriseIdentityDemo";
import { useDemoMode } from "@/lib/demo/mode";
import { normalizeE164Phone } from "@/lib/notifications/phone-number";
import {
  resetDemoWorkspace,
  updateDemoBrand,
  updateDemoNotificationChannel,
  updateDemoProfile,
  useDemoWorkspace,
  type DemoNotificationChannel,
  type DemoWorkspaceSettings,
} from "@/lib/demo/workspace-store";

type NotificationEvent = "comments" | "approvals" | "deliveries";

const NOTIFICATION_EVENTS: Array<{ value: NotificationEvent; label: string }> = [
  { value: "comments", label: "Comments" },
  { value: "approvals", label: "Decisions" },
  { value: "deliveries", label: "Deliveries" },
];

function NotificationSection({
  icon,
  title,
  detail,
  channel,
  onChange,
  disabled,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  channel: DemoNotificationChannel;
  onChange: (patch: Partial<DemoNotificationChannel>) => void;
  disabled: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--border)] py-5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--muted)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p>
        </div>
        <SettingsToggle
          checked={channel.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={`${channel.enabled ? "Disable" : "Enable"} ${title}`}
          disabled={disabled}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 pl-0 sm:grid-cols-3 sm:pl-11">
        {NOTIFICATION_EVENTS.map((event) => (
          <label
            key={event.value}
            className="flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--ink)]"
          >
            <input
              type="checkbox"
              checked={channel[event.value]}
              disabled={disabled}
              onChange={(changeEvent) =>
                onChange({ [event.value]: changeEvent.target.checked })
              }
            />
            {event.label}
          </label>
        ))}
      </div>
      {children}
    </section>
  );
}

function enabledEventCount(channel: DemoNotificationChannel) {
  return NOTIFICATION_EVENTS.filter((event) => channel[event.value]).length;
}

function NotificationReadinessSummary({
  notifications,
}: {
  notifications: DemoWorkspaceSettings["notifications"];
}) {
  const smsNumber = normalizeE164Phone(notifications.sms.phone);
  const readinessRows: Array<{
    label: string;
    detail: string;
    badge: string;
    tone: "neutral" | "good" | "warn" | "info";
    icon: LucideIcon;
  }> = [
    {
      label: "In-app",
      detail: notifications.inApp.enabled
        ? `${enabledEventCount(notifications.inApp)}/3 event types write to the workspace feed.`
        : "Workspace feed notifications are off.",
      badge: notifications.inApp.enabled ? "Active" : "Off",
      tone: notifications.inApp.enabled ? "good" : "neutral",
      icon: Bell,
    },
    {
      label: "Email",
      detail: notifications.email.enabled
        ? `${notifications.email.digest} digest selected; demo deliveries are recorded as a plan.`
        : "Email is disabled in this workspace.",
      badge: notifications.email.enabled ? "Preview plan" : "Off",
      tone: notifications.email.enabled ? "info" : "neutral",
      icon: Mail,
    },
    {
      label: "Text",
      detail: smsNumber
        ? notifications.sms.enabled
          ? `Valid text number saved: ${smsNumber}.`
          : "Valid text number saved, but the channel is off."
        : "Needs an E.164 text number before it can be enabled.",
      badge: smsNumber && notifications.sms.enabled ? "Ready" : "Needs setup",
      tone: smsNumber && notifications.sms.enabled ? "good" : "warn",
      icon: Smartphone,
    },
    {
      label: "iMessage",
      detail:
        notifications.imessage.status === "dry_run"
          ? `${notifications.imessage.relayName} logs outbound messages locally.`
          : notifications.imessage.status === "ready"
            ? `${notifications.imessage.relayName} is connected by the backend.`
            : "No outbound iMessage relay is authorized.",
      badge:
        notifications.imessage.status === "dry_run"
          ? "Dry run"
          : notifications.imessage.status === "ready"
            ? "Connected"
            : "Gated",
      tone:
        notifications.imessage.status === "ready"
          ? "good"
          : notifications.imessage.status === "dry_run"
            ? "info"
            : "warn",
      icon: MessagesSquare,
    },
    {
      label: "Live send authority",
      detail:
        "External sends still require share-recipient consent, origin checks, idempotency, and configured adapters.",
      badge: "Fail-closed",
      tone: "warn",
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="mb-1 border-y border-[var(--border)] py-4" aria-label="Notification readiness">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-sm font-bold text-[var(--ink)]">Notification readiness</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Delivery channels stay tied to explicit preferences and share authority.
          </p>
        </div>
        <StatusBadge tone="info">Local demo boundaries</StatusBadge>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2 xl:grid-cols-5">
        {readinessRows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="grid min-h-20 grid-cols-[30px_minmax(0,1fr)] gap-3 border-t border-[var(--border)] py-3 xl:border-t-0 xl:border-l xl:first:border-l-0 xl:first:pl-0 xl:pl-4"
            >
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--muted)]">
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <strong className="text-xs font-bold text-[var(--ink)]">{row.label}</strong>
                  <StatusBadge tone={row.tone}>{row.badge}</StatusBadge>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">{row.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function DemoSettingsSurface() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace(demoMode);
  const enterprise = useEnterpriseIdentityDemo(demoMode);
  const [tab, setTab] = useState<SettingsTab>("account");
  const [notice, setNotice] = useState<SettingsNotice | null>(null);
  const [smsError, setSmsError] = useState("");
  const [brandResetEpoch, setBrandResetEpoch] = useState(0);
  const noticeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  useEffect(() => {
    function syncTabFromLocation() {
      setTab(
        resolveSettingsTab(
          new URLSearchParams(window.location.search).get("section"),
        ),
      );
    }

    syncTabFromLocation();
    window.addEventListener("popstate", syncTabFromLocation);
    return () => window.removeEventListener("popstate", syncTabFromLocation);
  }, []);

  function flashNotice(message: string, tone: SettingsNoticeTone = "success") {
    setNotice({ message, tone });
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3200);
  }

  function resetLocalPillar() {
    resetDemoWorkspace();
    enterprise.reset();
    try {
      window.localStorage.removeItem(BRAND_GOVERNANCE_STORAGE_KEY);
    } catch {
      // The in-memory reset remains authoritative when storage is unavailable.
    }
    resetBrandGovernanceDemoCache();
    setBrandResetEpoch((current) => current + 1);
    flashNotice("Local workspace reset; signed-in account preserved");
  }

  function changeTab(nextTab: SettingsTab) {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("section", nextTab);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function publishBrand(values: ResolvedBrandValues) {
    updateDemoBrand({
      displayName: values.displayName,
      playerLabel: values.playerLabel,
      primaryColor: values.primaryColor,
      logoPath: values.logoPath,
    });
  }

  const settings = workspace.settings;

  return (
    <SettingsFrame
      activeTab={tab}
      onTabChange={changeTab}
      notice={notice}
      demoMode={demoMode}
      highContrast={enterprise.state.profile.highContrast}
    >
      {tab === "account" ? (
        <AccountSettings
          state={enterprise.state}
          demoMode={demoMode}
          mutate={enterprise.mutate}
          onNotice={flashNotice}
          profile={settings.profile}
          email={workspace.session.email}
        />
      ) : null}

      {tab === "organization" ? (
        <OrganizationSettings
          state={enterprise.state}
          demoMode={demoMode}
          mutate={enterprise.mutate}
          onNotice={flashNotice}
        />
      ) : null}

      {tab === "security" ? (
        <SecuritySettings
          state={enterprise.state}
          demoMode={demoMode}
          mutate={enterprise.mutate}
          onNotice={flashNotice}
        />
      ) : null}

      {tab === "preferences" ? (
        <PreferenceSettings
          state={enterprise.state}
          demoMode={demoMode}
          mutate={enterprise.mutate}
          onNotice={flashNotice}
          appearance={settings.appearance}
          onReset={resetLocalPillar}
        />
      ) : null}

      {tab === "notifications" ? (
        <div>
          <NotificationReadinessSummary notifications={settings.notifications} />
          <NotificationSection
            icon={<Bell size={16} />}
            title="In-app"
            detail="Workspace alerts and review status updates."
            channel={settings.notifications.inApp}
            disabled={!demoMode}
            onChange={(patch) => updateDemoNotificationChannel("inApp", patch)}
          />
          <NotificationSection
            icon={<Mail size={16} />}
            title="Email"
            detail={`Review updates sent to ${workspace.session.email}.`}
            channel={settings.notifications.email}
            disabled={!demoMode}
            onChange={(patch) => updateDemoNotificationChannel("email", patch)}
          >
            <label className="mt-4 flex items-center justify-between gap-3 pl-0 text-xs sm:pl-11">
              <span className="text-[var(--muted)]">Digest schedule</span>
              <select
                value={settings.notifications.email.digest}
                disabled={!demoMode}
                onChange={(event) =>
                  updateDemoNotificationChannel("email", {
                    digest: event.target.value as "instant" | "hourly" | "daily",
                  })
                }
                className="input max-w-40"
              >
                <option value="instant">Instant</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
            </label>
          </NotificationSection>
          <NotificationSection
            icon={<Smartphone size={16} />}
            title="Text message"
            detail="High-priority decisions and delivery alerts."
            channel={settings.notifications.sms}
            disabled={!demoMode}
            onChange={(patch) => {
              if (patch.enabled && !normalizeE164Phone(settings.notifications.sms.phone)) {
                setSmsError("Add a valid text notification number before enabling this channel.");
                flashNotice("Text messages remain off until a valid number is saved", "error");
                return;
              }
              setSmsError("");
              updateDemoNotificationChannel("sms", patch);
            }}
          >
            <form
              key={settings.notifications.sms.phone}
              onSubmit={(event) => {
                event.preventDefault();
                if (!demoMode) return;
                const data = new FormData(event.currentTarget);
                const rawPhone = String(data.get("phone") ?? "").trim();
                if (!rawPhone) {
                  setSmsError("");
                  updateDemoNotificationChannel("sms", { phone: "", enabled: false });
                  flashNotice("Text notification number removed; channel disabled");
                  return;
                }
                const phone = normalizeE164Phone(rawPhone);
                if (!phone) {
                  setSmsError("Use an international number such as +13125550142.");
                  flashNotice("Text notification number was not saved", "error");
                  return;
                }
                setSmsError("");
                updateDemoNotificationChannel("sms", {
                  phone,
                });
                flashNotice("Text notification number saved");
              }}
              className="mt-4 flex flex-col gap-2 pl-0 sm:flex-row sm:pl-11"
            >
              <input
                name="phone"
                type="tel"
                defaultValue={settings.notifications.sms.phone}
                placeholder="+1 555 000 0000"
                className="input min-w-0 flex-1"
                aria-invalid={Boolean(smsError)}
                aria-describedby="sms-phone-help"
                autoComplete="tel"
                inputMode="tel"
                disabled={!demoMode}
                onChange={() => {
                  if (smsError) setSmsError("");
                }}
              />
              <button type="submit" className="btn btn-secondary" disabled={!demoMode}>
                <Save size={14} /> Save number
              </button>
            </form>
            <p
              id="sms-phone-help"
              className={`mt-2 pl-0 text-xs sm:pl-11 ${smsError ? "text-[var(--red)]" : "text-[var(--muted)]"}`}
              role={smsError ? "alert" : undefined}
            >
              {smsError || "Use an international number beginning with +. Clearing it also disables text messages."}
            </p>
          </NotificationSection>
          <NotificationSection
            icon={<MessagesSquare size={16} />}
            title="iMessage relay"
            detail={`${settings.notifications.imessage.relayName} - ${
              settings.notifications.imessage.status === "ready"
                ? "connected"
                : settings.notifications.imessage.status === "dry_run"
                  ? "dry run"
                  : "not connected"
            }`}
            channel={settings.notifications.imessage}
            disabled={!demoMode}
            onChange={(patch) => {
              if (patch.enabled && settings.notifications.imessage.status === "not_connected") {
                updateDemoNotificationChannel("imessage", {
                  ...patch,
                  status: "dry_run",
                });
                return;
              }
              updateDemoNotificationChannel("imessage", patch);
            }}
          >
            <div className="mt-4 flex items-center justify-between gap-3 pl-0 sm:pl-11">
              <span className="text-xs text-[var(--muted)]">
                {settings.notifications.imessage.status === "dry_run"
                  ? "Outbound messages are logged locally only."
                  : "No outbound relay is authorized."}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!demoMode}
                onClick={() =>
                  updateDemoNotificationChannel("imessage", {
                    enabled: settings.notifications.imessage.status !== "dry_run",
                    status:
                      settings.notifications.imessage.status === "dry_run"
                        ? "not_connected"
                        : "dry_run",
                  })
                }
              >
                {settings.notifications.imessage.status === "dry_run"
                  ? "Disable dry run"
                  : "Enable dry run"}
              </button>
            </div>
          </NotificationSection>
        </div>
      ) : null}

      {tab === "brand" ? (
        <BrandSettings
          key={`${enterprise.state.activeWorkspaceId}-${brandResetEpoch}`}
          state={enterprise.state}
          demoMode={demoMode}
          legacyBrand={settings.brand}
          coverPath={settings.brand.coverPath}
          avatarPath={settings.profile.avatarPath}
          onCompanyAssetChange={(patch) => {
            if (patch.coverPath !== undefined) updateDemoBrand({ coverPath: patch.coverPath });
            if (patch.avatarPath !== undefined) updateDemoProfile({ avatarPath: patch.avatarPath });
          }}
          onPublished={publishBrand}
          onNotice={flashNotice}
        />
      ) : null}
    </SettingsFrame>
  );
}
