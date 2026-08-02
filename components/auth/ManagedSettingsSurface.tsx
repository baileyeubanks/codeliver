"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import NotificationPreferences from "@/components/notifications/NotificationPreferences";
import ManagedIdentitySettings from "./ManagedIdentitySettings";
import SettingsFrame, {
  type SettingsNotice,
  type SettingsNoticeTone,
  type SettingsTab,
} from "./SettingsFrame";
import { resolveSettingsTab } from "./settings-route";
import { useIdentityContext } from "./useIdentityContext";

export default function ManagedSettingsSurface() {
  const identity = useIdentityContext(true);
  const [tab, setTab] = useState<SettingsTab>("account");
  const [notice, setNotice] = useState<SettingsNotice | null>(null);
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
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4200);
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

  return (
    <SettingsFrame
      activeTab={tab}
      onTabChange={changeTab}
      notice={notice}
      demoMode={false}
      highContrast={identity.context?.profile.highContrast ?? false}
    >
      {tab === "notifications" ? (
        <NotificationPreferences />
      ) : identity.loading ? (
        <div className="flex min-h-48 items-center justify-center text-[var(--muted)]">
          <Loader2 size={20} className="animate-spin" aria-label="Loading account settings" />
        </div>
      ) : identity.context ? (
        <ManagedIdentitySettings
          tab={tab}
          context={identity.context}
          mutate={identity.mutate}
          onNotice={flashNotice}
        />
      ) : (
        <div className="flex min-h-48 flex-col items-start justify-center gap-4" role="alert">
          <p className="m-0 text-sm text-[var(--red)]">
            {identity.error ?? "Account settings are temporarily unavailable"}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void identity.reload()}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      )}
    </SettingsFrame>
  );
}
