"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, CheckCircle2, CircleAlert, Mail, MessagesSquare, Save, Smartphone } from "lucide-react";
import { BRAND_GOVERNANCE_STORAGE_KEY, type ResolvedBrandValues } from "@contentco-op/brand";
import BrandSettings from "@/components/auth/BrandSettings";
import {
  AccountSettings,
  OrganizationSettings,
  PreferenceSettings,
  SecuritySettings,
} from "@/components/auth/IdentitySettings";
import SettingsFrame, {
  SettingsSection,
  SettingsToggle,
  StatusBadge,
  type SettingsTab,
} from "@/components/auth/SettingsFrame";
import StudioSystemsSettings from "@/components/auth/StudioSystemsSettings";
import { resolveSettingsTab } from "@/components/auth/settings-route";
import { resetBrandGovernanceDemoCache } from "@/components/auth/useBrandGovernanceDemo";
import { useEnterpriseIdentityDemo } from "@/components/auth/useEnterpriseIdentityDemo";
import NotificationPreferences from "@/components/notifications/NotificationPreferences";
import { useDemoMode } from "@/lib/demo/mode";
import { normalizeE164Phone } from "@/lib/notifications/phone-number";
import {
  resetDemoWorkspace,
  updateDemoBrand,
  updateDemoNotificationChannel,
  useDemoWorkspace,
  type DemoNotificationChannel,
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

function channelStatusLabel(enabled: boolean) {
  return enabled ? "Enabled" : "Off";
}

export default function SettingsPage() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const enterprise = useEnterpriseIdentityDemo(demoMode);
  const [tab, setTab] = useState<SettingsTab>("account");
  const [notice, setNotice] = useState("");
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

  function flashNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3200);
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
  const smsReady = Boolean(normalizeE164Phone(settings.notifications.sms.phone));
  const imessageStatus = settings.notifications.imessage.status;
  const notificationReadiness = demoMode
    ? [
        {
          id: "in-app",
          label: "In-app",
          value: channelStatusLabel(settings.notifications.inApp.enabled),
          detail: "Workspace audit and review events",
          icon: Bell,
          good: settings.notifications.inApp.enabled,
        },
        {
          id: "email",
          label: "Email",
          value: channelStatusLabel(settings.notifications.email.enabled),
          detail: `${settings.notifications.email.digest} digest for ${workspace.session.email}`,
          icon: Mail,
          good: settings.notifications.email.enabled,
        },
        {
          id: "text",
          label: "Text",
          value: settings.notifications.sms.enabled
            ? "Enabled"
            : smsReady
              ? "Ready"
              : "Needs number",
          detail: smsReady ? settings.notifications.sms.phone : "Valid +number required",
          icon: Smartphone,
          good: settings.notifications.sms.enabled && smsReady,
        },
        {
          id: "imessage",
          label: "iMessage",
          value: imessageStatus === "ready"
            ? "Connected"
            : imessageStatus === "dry_run"
              ? "Dry run"
              : "Not connected",
          detail: settings.notifications.imessage.relayName,
          icon: MessagesSquare,
          good: imessageStatus === "ready",
        },
      ]
    : [
        {
          id: "in-app",
          label: "In-app",
          value: "Managed",
          detail: "Saved per user through notification preferences",
          icon: Bell,
          good: true,
        },
        {
          id: "email",
          label: "Email",
          value: "Provider checked",
          detail: "Adapter readiness loads from the preferences API",
          icon: Mail,
          good: true,
        },
        {
          id: "text",
          label: "Text",
          value: "Consent required",
          detail: "Preview-only until a provider and phone consent exist",
          icon: Smartphone,
          good: false,
        },
        {
          id: "imessage",
          label: "iMessage",
          value: "Preview only",
          detail: "No outbound relay is authorized by default",
          icon: MessagesSquare,
          good: false,
        },
      ];

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
          <SettingsSection
            title="Notification authority"
            detail="Each channel is permission-aware. Dry-run and unconfigured channels are visible so the workspace never implies a message was sent when no provider is connected."
            action={<StatusBadge tone={demoMode ? "info" : "good"}>{demoMode ? "Local controls" : "API backed"}</StatusBadge>}
          >
            <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--border)]">
              <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
                {notificationReadiness.map(({ id: readinessId, label, value, detail, icon: Icon, good }) => (
                  <article
                    key={readinessId}
                    className="grid min-h-[78px] grid-cols-[24px_minmax(0,1fr)] gap-2 bg-[var(--surface)] px-3 py-3"
                  >
                    <span className={good ? "mt-0.5 text-[var(--green)]" : "mt-0.5 text-[var(--muted)]"}>
                      {good ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase text-[var(--muted)]">
                        {label}
                      </span>
                      <strong className="mt-1 block truncate text-sm text-[var(--ink)]">
                        {value}
                      </strong>
                      <small className="mt-1 block truncate text-[10px] leading-4 text-[var(--muted)]">
                        {detail}
                      </small>
                    </span>
                  </article>
                ))}
              </div>
            </div>
          </SettingsSection>
          {demoMode ? (
            <>
              <NotificationSection
                icon={<Bell size={16} />}
                title="In-app"
                detail="Workspace alerts and review status updates."
                channel={settings.notifications.inApp}
                disabled={false}
                onChange={(patch) => updateDemoNotificationChannel("inApp", patch)}
              />
              <NotificationSection
                icon={<Mail size={16} />}
                title="Email"
                detail={`Review updates sent to ${workspace.session.email}.`}
                channel={settings.notifications.email}
                disabled={false}
                onChange={(patch) => updateDemoNotificationChannel("email", patch)}
              >
                <label className="mt-4 flex items-center justify-between gap-3 pl-0 text-xs sm:pl-11">
                  <span className="text-[var(--muted)]">Digest schedule</span>
                  <select
                    value={settings.notifications.email.digest}
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
                disabled={false}
                onChange={(patch) => {
                  if (patch.enabled && !normalizeE164Phone(settings.notifications.sms.phone)) {
                    setSmsError("Add a valid text notification number before enabling this channel.");
                    flashNotice("Text messages remain off until a valid number is saved");
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
                      flashNotice("Text notification number was not saved");
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
                    onChange={() => {
                      if (smsError) setSmsError("");
                    }}
                  />
                  <button type="submit" className="btn btn-secondary">
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
                disabled={false}
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
            </>
          ) : (
            <SettingsSection
              title="Managed preferences"
              detail="Saved per-event preferences are read from and written to the authenticated notification preferences API."
              action={<StatusBadge tone="good">Persisted</StatusBadge>}
            >
              <NotificationPreferences />
            </SettingsSection>
          )}
        </div>
      ) : null}

      {tab === "brand" ? (
        <BrandSettings
          key={`${enterprise.state.activeWorkspaceId}-${brandResetEpoch}`}
          state={enterprise.state}
          demoMode={demoMode}
          legacyBrand={settings.brand}
          onPublished={publishBrand}
          onNotice={flashNotice}
        />
      ) : null}

      {tab === "systems" ? (
        <StudioSystemsSettings demoMode={demoMode} onNotice={flashNotice} />
      ) : null}
    </SettingsFrame>
  );
}
