"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  CircleHelp,
  Film,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  User,
  WifiOff,
} from "lucide-react";
import CommandPalette, { type CommandPaletteItem } from "./navigation/CommandPalette";
import CoProductionBrand from "./brand/CoProductionBrand";
import NotificationBell from "./notifications/NotificationBell";
import WorkspaceNavigation from "./navigation/WorkspaceNavigation";
import { NAVIGATION_ICONS } from "./navigation/navigation-icons";
import {
  roleCan,
  visibleNavigation,
  withWorkspaceQuery,
  type WorkspaceRole,
} from "./navigation/navigation-model";
import { useOnlineStatus } from "./navigation/useEnvironmentStatus";
import { buildSettingsHref } from "./auth/settings-route";
import { useIdentityContext } from "./auth/useIdentityContext";
import { useAuthSession } from "./auth/useAuthSession";
import useAuthHostContext from "./auth/useAuthHostContext";
import { useDemoSuffix } from "@/lib/demo/mode";
import { signOutDemoSession, useDemoWorkspace } from "@/lib/demo/workspace-store";
import styles from "./Shell.module.css";

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    approved_asset: "approved a deliverable",
    added_comment: "added a review comment",
    uploaded_new_version: "uploaded a new version",
    created_review_link: "created a review link",
    archived_asset: "archived a deliverable",
    trashed_asset: "moved a deliverable to Trash",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function commandHref(href: string, querySuffix: string) {
  return href.includes("demo=1") ? href : withWorkspaceQuery(href, querySuffix);
}

function customBrandSource(source: string | undefined) {
  return source && !source.startsWith("/brand/co-videopro-") ? source : undefined;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const demoSuffix = useDemoSuffix();
  const demoMode = Boolean(demoSuffix);
  const demoWorkspace = useDemoWorkspace(demoMode);
  const hostContext = useAuthHostContext();
  const authSession = useAuthSession(!demoMode);
  const clientPortal =
    !demoMode &&
    (hostContext.kind === "client" || authSession.session?.surfaceRole === "client");
  const identity = useIdentityContext(
    !demoMode && authSession.session?.surfaceRole === "staff",
  );
  const online = useOnlineStatus();
  const [commandOpen, setCommandOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const isProjectCockpit = /^\/projects\/(?!new$|archive$|trash$)[^/]+$/.test(pathname);
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceRole: WorkspaceRole = demoMode
    ? "owner"
    : clientPortal || authSession.session?.surfaceRole !== "staff"
      ? "client"
      : identity.role;
  const managedName = `${identity.context?.profile.firstName ?? ""} ${
    identity.context?.profile.lastName ?? ""
  }`.trim();
  const profileName = demoMode
    ? `${demoWorkspace.settings.profile.firstName} ${demoWorkspace.settings.profile.lastName}`.trim()
    : clientPortal
      ? authSession.loading
        ? "Loading account"
        : "Client reviewer"
      : managedName || (identity.loading ? "Loading account" : "Signed-in user");
  const profileEmail = demoMode
    ? demoWorkspace.session.email
    : clientPortal
      ? authSession.session?.email ?? "Account authority unavailable"
      : identity.context?.actor.email ?? authSession.session?.email ?? "Account authority unavailable";
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CC";
  const profileAvatarPath = demoMode ? demoWorkspace.settings.profile.avatarPath : "";
  const brandLogoPath = customBrandSource(
    demoMode ? demoWorkspace.settings.brand.logoPath : undefined,
  );

  const commandItems = useMemo<CommandPaletteItem[]>(() => {
    const navigationCommands = visibleNavigation(workspaceRole).flatMap((section) =>
      section.items.map((item) => ({
        id: `navigation-${item.id}`,
        label: item.label,
        description: item.description,
        keywords: [item.shortLabel, section.label],
        section: section.label,
        href: withWorkspaceQuery(item.href, demoSuffix),
        icon: NAVIGATION_ICONS[item.icon],
      })),
    );

    const projectCommands: CommandPaletteItem[] = demoSuffix
      ? demoWorkspace.projects.map((project) => ({
          id: `project-${project.id}`,
          label: project.name,
          description: "Open project cockpit",
          keywords: ["project", "production", "cockpit"],
          section: "Projects",
          href: withWorkspaceQuery(`/projects/${project.id}`, demoSuffix),
          icon: BriefcaseBusiness,
        }))
      : [];

    const assetCommands: CommandPaletteItem[] = demoSuffix
      ? demoWorkspace.assets.map((asset) => ({
          id: `asset-${asset.id}`,
          label: asset.title,
          description: demoWorkspace.projects.find((project) => project.id === asset.project_id)?.name
            ?? "Project media",
          keywords: [asset.file_type, asset.status, "media", "asset"],
          section: "Media",
          href: commandHref(asset.href ?? `/projects/${asset.project_id}`, demoSuffix),
          icon: Film,
        }))
      : [];

    const createCommand: CommandPaletteItem[] = roleCan(workspaceRole, "projects:create")
      ? [{
          id: "create-project",
          label: "New project",
          description: "Create a production workspace",
          keywords: ["add", "new", "project"],
          section: "Actions",
          href: withWorkspaceQuery("/projects/new", demoSuffix),
          icon: Plus,
        }]
      : [];

    return [...createCommand, ...navigationCommands, ...projectCommands, ...assetCommands];
  }, [demoSuffix, demoWorkspace.assets, demoWorkspace.projects, workspaceRole]);

  useEffect(() => {
    const useDarkMode = demoMode
      ? demoWorkspace.settings.appearance.darkMode
      : identity.context?.preferences.theme === "dark";
    document.documentElement.dataset.theme = isProjectCockpit || !useDarkMode ? "light" : "dark";
    const reduceMotion = demoMode
      ? demoWorkspace.settings.appearance.reducedMotion
      : identity.context?.preferences.reduceMotion;
    document.documentElement.dataset.reducedMotion = reduceMotion
      ? "true"
      : "false";
  }, [demoMode, demoWorkspace.settings.appearance, identity.context?.preferences, isProjectCockpit]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
      if (notificationRef.current && !notificationRef.current.contains(target)) setNotificationsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (isProjectCockpit) return;

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setAccountOpen(false);
        setNotificationsOpen(false);
        setNavigationOpen(false);
        setCommandOpen(true);
        return;
      }

      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      } else if (notificationsOpen) {
        setNotificationsOpen(false);
        notificationButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accountOpen, isProjectCockpit, notificationsOpen]);

  async function handleLogout() {
    if (demoSuffix) {
      signOutDemoSession();
      window.location.href = "/login?demo=1";
      return;
    }
    setLogoutError("");
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    if (!response?.ok) {
      setLogoutError("Sign out did not complete. Try again.");
      return;
    }
    window.location.href = "/login";
  }

  if (isProjectCockpit) {
    return <div className="min-h-screen bg-white">{children}</div>;
  }

  return (
    <div className={`workspace-shell ${styles.shell}`} data-online={online}>
      <a className={styles.skipLink} href="#workspace-content">Skip to workspace content</a>

      <header className="workspace-header">
        <div className="workspace-brand">
          <button
            className={`workspace-menu-trigger ${styles.menuButton}`}
            type="button"
            aria-label="Open workspace navigation"
            aria-expanded={navigationOpen}
            onClick={() => {
              setAccountOpen(false);
              setNotificationsOpen(false);
              setNavigationOpen(true);
            }}
          >
            <Menu size={19} />
          </button>
          <Link
            href={withWorkspaceQuery(clientPortal ? "/reviews" : "/projects", demoSuffix)}
            aria-label={clientPortal ? "Co-VideoPro review inbox" : "Co-VideoPro projects"}
          >
            <CoProductionBrand
              className={styles.brandLockup}
              source={brandLogoPath}
              variant={brandLogoPath ? "horizontal" : "wordmark"}
              priority
            />
            <span className={styles.mobileWordmark} aria-hidden="true">co-videopro</span>
          </Link>
        </div>

        <Suspense fallback={null}>
          <WorkspaceNavigation
            pathname={pathname}
            querySuffix={demoSuffix}
            role={workspaceRole}
            drawerOpen={navigationOpen}
            projects={demoSuffix ? demoWorkspace.projects : []}
            onOpenDrawer={() => {
              setAccountOpen(false);
              setNotificationsOpen(false);
              setNavigationOpen(true);
            }}
            onCloseDrawer={() => setNavigationOpen(false)}
            onOpenCommandPalette={() => setCommandOpen(true)}
          />
        </Suspense>

        <button
          ref={commandButtonRef}
          className={`workspace-search ${styles.searchButton}`}
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label={clientPortal ? "Search reviews" : "Search commands, projects, and media"}
          title={clientPortal ? "Search reviews" : "Search workspace"}
        >
          <Search size={18} />
          <span>{clientPortal ? "Search reviews" : "Search commands, projects, and media"}</span>
        </button>

        <div className="workspace-actions">
          <a
            className="workspace-icon-button workspace-help"
            href="mailto:hello@contentco-op.com?subject=Co-VideoPro%20feedback"
            aria-label="Email help and feedback"
            title="Help and feedback"
          >
            <CircleHelp size={19} />
          </a>

          {demoMode ? <div className="workspace-popover-anchor" ref={notificationRef}>
            <button
              ref={notificationButtonRef}
              className="workspace-icon-button"
              type="button"
              aria-label="Recent activity"
              aria-expanded={notificationsOpen}
              aria-controls="workspace-activity"
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setAccountOpen(false);
              }}
            >
              <Bell size={19} />
              {demoMode && demoWorkspace.activity.length > 0 ? <i /> : null}
            </button>
            {notificationsOpen ? (
              <div id="workspace-activity" className="workspace-popover workspace-notifications" role="region" aria-label="Recent activity">
                <header>
                  <strong>Recent activity</strong>
                  <Link href={withWorkspaceQuery("/activity", demoSuffix)}>View all</Link>
                </header>
                {demoWorkspace.activity.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={withWorkspaceQuery("/activity", demoSuffix)}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    <span>{item.actor_name} {activityLabel(item.action)}</span>
                    <small>{item.details.asset_title ?? "Co-VideoPro workspace"}</small>
                  </Link>
                ))}
                {demoWorkspace.activity.length === 0 ? <p>No recent activity.</p> : null}
              </div>
            ) : null}
          </div> : !clientPortal && authSession.session?.surfaceRole === "staff" ? <NotificationBell /> : null}

          <div className="workspace-popover-anchor" ref={accountRef}>
            <button
              ref={accountButtonRef}
              className="workspace-account-button"
              type="button"
              aria-label="Open account menu"
              aria-expanded={accountOpen}
              aria-controls="workspace-account-menu"
              onClick={() => {
                setAccountOpen((open) => !open);
                setNotificationsOpen(false);
              }}
            >
              <span>
                {profileAvatarPath ? (
                  <Image src={profileAvatarPath} alt="" width={32} height={32} unoptimized />
                ) : profileInitials}
              </span>
              <ChevronDown size={14} />
            </button>
            {accountOpen ? (
              <div
                id="workspace-account-menu"
                className="workspace-popover workspace-account-menu"
                role="navigation"
                aria-label="Account"
              >
                <header>
                  <strong>{profileName}</strong>
                  <small>{profileEmail}</small>
                </header>
                <em className={styles.accountRole}>
                  {clientPortal ? "Client reviewer" : `Workspace ${workspaceRole}`}
                </em>
                {!clientPortal ? <Link href={buildSettingsHref("account", Boolean(demoSuffix))} onClick={() => setAccountOpen(false)}>
                  <User size={15} /> Profile
                </Link> : null}
                {!clientPortal ? <Link href={buildSettingsHref("preferences", Boolean(demoSuffix))} onClick={() => setAccountOpen(false)}>
                  <Settings size={15} /> Preferences
                </Link> : null}
                <button type="button" onClick={handleLogout}><LogOut size={15} /> Log out</button>
                {logoutError || authSession.error || (!clientPortal && identity.error) ? (
                  <small role="alert">
                    {logoutError || authSession.error || identity.error}
                  </small>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main id="workspace-content" className={`workspace-main ${styles.main}`} tabIndex={-1}>
        {!online ? (
          <div className={styles.offlineNotice} role="status">
            <WifiOff size={15} /> Offline. Changes that require the server are paused.
          </div>
        ) : null}
        <div className={styles.content}>{children}</div>
      </main>

      {commandOpen ? (
        <CommandPalette
          open
          items={commandItems}
          onClose={() => setCommandOpen(false)}
          returnFocusRef={commandButtonRef}
        />
      ) : null}
    </div>
  );
}
