"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  CircleHelp,
  DatabaseZap,
  Film,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Upload,
  User,
  WifiOff,
} from "lucide-react";
import CommandPalette, { type CommandPaletteItem } from "./navigation/CommandPalette";
import { useOverlay } from "./overlay/useOverlay";
import CoProductionBrand from "./brand/CoProductionBrand";
import WorkspaceNavigation from "./navigation/WorkspaceNavigation";
import WorkspaceRail from "./navigation/WorkspaceRail";
import GlobalUploadDialog from "./navigation/GlobalUploadDialog";
import { NAVIGATION_ICONS } from "./navigation/navigation-icons";
import {
  roleCan,
  visibleNavigation,
  withWorkspaceQuery,
  type WorkspaceRole,
} from "./navigation/navigation-model";
import { useOnlineStatus } from "./navigation/useEnvironmentStatus";
import { buildSettingsHref } from "./auth/settings-route";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useDemoSuffix } from "@/lib/demo/mode";
import { signOutDemoSession, setDemoSessionRole, useDemoWorkspace } from "@/lib/demo/workspace-store";
import { orderProjectsByActivity } from "@/lib/demo/recent-projects.ts";
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

type RemoteSession = {
  email: string;
  displayName: string | null;
  role: WorkspaceRole;
};

type RemoteNotification = {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
};

const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "producer", "editor", "reviewer", "viewer"];

function asWorkspaceRole(value: unknown): WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole) ? (value as WorkspaceRole) : "viewer";
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const demoSuffix = useDemoSuffix();
  const demoWorkspace = useDemoWorkspace();
  const online = useOnlineStatus();
  const [commandOpen, setCommandOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null);
  const [remoteNotifications, setRemoteNotifications] = useState<RemoteNotification[]>([]);
  const [storageDegraded, setStorageDegraded] = useState(false);
  const isProjectCockpit = /^\/projects\/(?!new$|archive$|trash$)[^/]+$/.test(pathname);
  // Remote identity and role come from the authenticated session; until it
  // resolves (or if it fails) the shell stays fail-closed at viewer.
  const workspaceRole: WorkspaceRole = demoSuffix
    ? (demoWorkspace.session.role ?? "owner")
    : (remoteSession?.role ?? "viewer");
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const [notificationsOverlayRef, notificationsOverlayStyle] = useOverlay({
    open: notificationsOpen,
    onClose: () => setNotificationsOpen(false),
    anchorRef: notificationButtonRef,
    align: "end",
    offset: 12,
  });
  const [accountOverlayRef, accountOverlayStyle] = useOverlay({
    open: accountOpen,
    onClose: () => setAccountOpen(false),
    anchorRef: accountButtonRef,
    align: "end",
    offset: 12,
  });
  const profileName = demoSuffix
    ? `${demoWorkspace.settings.profile.firstName} ${demoWorkspace.settings.profile.lastName}`.trim()
    : (remoteSession?.displayName ?? remoteSession?.email ?? "Workspace member");
  const profileEmail = demoSuffix ? demoWorkspace.session.email : (remoteSession?.email ?? "");
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CC";

  const recentProjects = useMemo(() => {
    if (!demoSuffix) return [];
    return orderProjectsByActivity(demoWorkspace.projects, demoWorkspace.activity);
  }, [demoSuffix, demoWorkspace]);

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
    // The workspace wears the contentco-op.com cream editorial law; dark is
    // opt-in for stage surfaces only, never the shell.
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.reducedMotion = demoSuffix && demoWorkspace.settings.appearance.reducedMotion
      ? "true"
      : "false";
  }, [demoSuffix, demoWorkspace.settings.appearance, isProjectCockpit]);

  useEffect(() => {
    if (demoSuffix || isProjectCockpit) return;
    const controller = new AbortController();

    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload?.authenticated || typeof payload.email !== "string") return;
        setRemoteSession({
          email: payload.email,
          displayName: typeof payload.display_name === "string" ? payload.display_name : null,
          role: asWorkspaceRole(payload.workspace_role),
        });
      })
      .catch(() => {});

    void fetch("/api/notifications?limit=3", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!Array.isArray(payload?.items)) return;
        setRemoteNotifications(
          payload.items
            .filter((item: { id?: unknown; title?: unknown }) =>
              typeof item?.id === "string" && typeof item?.title === "string")
            .map((item: { id: string; title: string; body?: unknown; read?: unknown }) => ({
              id: item.id,
              title: item.title,
              body: typeof item.body === "string" ? item.body : null,
              read: item.read === true,
            })),
        );
      })
      .catch(() => {});

    return () => controller.abort();
  }, [demoSuffix, isProjectCockpit]);

  // Readiness probe: when the storage/data layer cannot answer honestly,
  // say so in the shell instead of letting saves fail silently.
  useEffect(() => {
    if (isProjectCockpit) return;
    const controller = new AbortController();
    void fetch("/api/health/ready", { cache: "no-store", signal: controller.signal })
      .then((response) => setStorageDegraded(!response.ok))
      .catch(() => setStorageDegraded(true));
    return () => controller.abort();
  }, [isProjectCockpit]);

  useEffect(() => {
    if (isProjectCockpit) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Popover Escape/outside-click dismissal is owned by useOverlay's
      // dismiss stack; only the command-palette shortcut lives here.
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setAccountOpen(false);
        setNotificationsOpen(false);
        setNavigationOpen(false);
        setCommandOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProjectCockpit]);

  async function handleLogout() {
    if (demoSuffix) {
      signOutDemoSession();
      window.location.href = "/login?demo=1";
      return;
    }
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (isProjectCockpit) {
    return <div className="min-h-screen bg-[#121417]">{children}</div>;
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
          <Link href={withWorkspaceQuery("/", demoSuffix)} aria-label="Co‑VideoPro home">
            <CoProductionBrand className={styles.brandLockup} priority />
          </Link>
        </div>

        <WorkspaceNavigation
          pathname={pathname}
          querySuffix={demoSuffix}
          role={workspaceRole}
          drawerOpen={navigationOpen}
          projects={recentProjects}
          onOpenDrawer={() => {
            setAccountOpen(false);
            setNotificationsOpen(false);
            setNavigationOpen(true);
          }}
          onCloseDrawer={() => setNavigationOpen(false)}
          onOpenCommandPalette={() => setCommandOpen(true)}
        />

        <button
          ref={commandButtonRef}
          className={`workspace-search ${styles.searchButton}`}
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label="Search commands, projects, and media"
          title="Search workspace"
        >
          <Search size={18} />
          <span>Search commands, projects, and media</span>
        </button>

        <div className="workspace-actions">
          {demoSuffix ? (
            <button
              className="btn btn-primary workspace-upload-button"
              type="button"
              onClick={() => {
                setAccountOpen(false);
                setNotificationsOpen(false);
                setUploadOpen(true);
              }}
              aria-label="Upload media to a project"
            >
              <Upload size={15} /> <span className="workspace-upload-label">Upload</span>
            </button>
          ) : null}
          <a
            className="workspace-icon-button workspace-help"
            href="mailto:hello@contentco-op.com?subject=Co-Production%20Pro%20feedback"
            aria-label="Email help and feedback"
            title="Help and feedback"
          >
            <CircleHelp size={19} />
          </a>

          <div className="workspace-popover-anchor">
            <button
              ref={notificationButtonRef}
              className="workspace-icon-button"
              type="button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              aria-controls="workspace-notifications"
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setAccountOpen(false);
              }}
            >
              <Bell size={19} />
            </button>
            {notificationsOpen ? (
              <div
                ref={notificationsOverlayRef}
                style={notificationsOverlayStyle}
                id="workspace-notifications"
                className="workspace-popover workspace-notifications"
                role="region"
                aria-label="Notifications"
              >
                <header>
                  <strong>Notifications</strong>
                  <Link href={withWorkspaceQuery("/activity", demoSuffix)}>View all</Link>
                </header>
                {demoSuffix ? (
                  <>
                    {demoWorkspace.activity.slice(0, 3).map((item) => (
                      <Link
                        key={item.id}
                        href={withWorkspaceQuery("/activity", demoSuffix)}
                        onClick={() => setNotificationsOpen(false)}
                      >
                        <span>{item.actor_name} {activityLabel(item.action)}</span>
                        <small>{item.details.asset_title ?? "Co‑VideoPro workspace"}</small>
                      </Link>
                    ))}
                    {demoWorkspace.activity.length === 0 ? <p>No new notifications.</p> : null}
                  </>
                ) : (
                  <>
                    {remoteNotifications.map((item) => (
                      <Link
                        key={item.id}
                        href="/activity"
                        onClick={() => setNotificationsOpen(false)}
                        data-read={item.read}
                      >
                        <span>{item.title}</span>
                        <small>{item.body ?? "Co‑VideoPro workspace"}</small>
                      </Link>
                    ))}
                    {remoteNotifications.length === 0 ? <p>No new notifications.</p> : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="workspace-popover-anchor">
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
              <span>{profileInitials}</span>
              <ChevronDown size={14} />
            </button>
            {accountOpen ? (
              <div
                ref={accountOverlayRef}
                style={accountOverlayStyle}
                id="workspace-account-menu"
                className="workspace-popover workspace-account-menu"
                role="navigation"
                aria-label="Account"
              >
                <header>
                  <strong>{profileName}</strong>
                  <small>{profileEmail}</small>
                </header>
                <em className={styles.accountRole}>Workspace {workspaceRole}</em>
                {demoSuffix ? (
                  <label className={styles.accountRole} style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
                    View as
                    <select
                      value={workspaceRole}
                      onChange={(event) => setDemoSessionRole(event.target.value as typeof workspaceRole)}
                      aria-label="Preview workspace role"
                    >
                      <option value="owner">owner</option>
                      <option value="producer">producer</option>
                      <option value="editor">editor</option>
                      <option value="reviewer">reviewer</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </label>
                ) : null}
                <Link href={buildSettingsHref("account", Boolean(demoSuffix))} onClick={() => setAccountOpen(false)}>
                  <User size={15} /> Profile
                </Link>
                <Link href={buildSettingsHref("preferences", Boolean(demoSuffix))} onClick={() => setAccountOpen(false)}>
                  <Settings size={15} /> Preferences
                </Link>
                <button type="button" onClick={handleLogout}><LogOut size={15} /> Log out</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="workspace-body">
        <WorkspaceRail
          pathname={pathname}
          querySuffix={demoSuffix}
          role={workspaceRole}
          projects={recentProjects}
        />

        <main id="workspace-content" className={`workspace-main ${styles.main}`} tabIndex={-1}>
          {!online ? (
            <div className={styles.offlineNotice} role="status">
              <WifiOff size={15} /> Offline. Changes that require the server are paused.
            </div>
          ) : null}
          {storageDegraded ? (
            <div className={styles.offlineNotice} role="status">
              <DatabaseZap size={15} /> Backend storage is unreachable — work stays in this browser until the readiness probe recovers.
            </div>
          ) : null}
          <div className={styles.content}>{children}</div>
        </main>
      </div>

      {uploadOpen && demoSuffix ? (
        <GlobalUploadDialog querySuffix={demoSuffix} onClose={() => setUploadOpen(false)} />
      ) : null}

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
