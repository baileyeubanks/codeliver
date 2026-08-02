"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  MessageSquare,
  Power,
  Shield,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import {
  setDemoShareLinkActive,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { toClientSiteUrl, toDemoSiteUrl } from "@/lib/surface-origins";
import ClientReviewInbox from "@/components/review/ClientReviewInbox";
import { useAuthSession } from "@/components/auth/useAuthSession";
import useAuthHostContext from "@/components/auth/useAuthHostContext";
import styles from "./ReviewsPage.module.css";

interface ShareLink {
  id: string;
  asset_id?: string;
  asset_title?: string;
  project_name?: string;
  token?: string;
  type: string;
  created_at: string;
  created_by_name?: string;
  reviewer_name?: string | null;
  reviewer_email?: string | null;
  message?: string;
  media_count?: number;
  invited_count?: number;
  allow_comments?: boolean;
  allow_downloads?: boolean;
  password_protected?: boolean | null;
  require_name?: boolean;
  expires_at?: string | null;
  max_views?: number | null;
  batch_id?: string | null;
  is_active?: boolean;
  public_url?: string | null;
  asset_ids?: string[];
  permission?: "view" | "comment" | "approve";
}

const SHARE_INDEX_CONCURRENCY = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readItems(payload: unknown, source: string): Record<string, unknown>[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error(`${source} returned an invalid response`);
  }

  return payload.items.filter(isRecord);
}

function normalizeRemoteShareLink(
  invite: Record<string, unknown>,
  assetId: string,
  currentUserId: string | null,
): ShareLink | null {
  if (typeof invite.id !== "string" || typeof invite.created_at !== "string") {
    return null;
  }

  const permission =
    invite.permissions === "approve" ||
    invite.permissions === "comment" ||
    invite.permissions === "view"
      ? invite.permissions
      : "view";
  const reviewerName =
    typeof invite.reviewer_name === "string" && invite.reviewer_name.trim()
      ? invite.reviewer_name.trim()
      : null;
  const reviewerEmail =
    typeof invite.reviewer_email === "string" && invite.reviewer_email.trim()
      ? invite.reviewer_email.trim()
      : null;
  const token = typeof invite.token === "string" ? invite.token : "";
  const version = isRecord(invite.version) ? invite.version : null;
  const versionNumber =
    version && typeof version.version_number === "number"
      ? version.version_number
      : null;
  const isActive = invite.active !== false && invite.authority_status === "active";

  return {
    id: invite.id,
    asset_id: assetId,
    token,
    type: "review",
    created_at: invite.created_at,
    created_by_name:
      currentUserId && invite.created_by === currentUserId ? "You" : "Team member",
    reviewer_name: reviewerName,
    reviewer_email: reviewerEmail,
    message: reviewerName || reviewerEmail
      ? `Review for ${reviewerName ?? reviewerEmail}`
      : versionNumber
        ? `Version ${versionNumber} review`
        : "Review link",
    media_count: 1,
    invited_count: reviewerEmail ? 1 : 0,
    allow_comments: permission !== "view",
    allow_downloads: invite.download_enabled === true,
    password_protected:
      typeof invite.password_protected === "boolean"
        ? invite.password_protected
        : null,
    expires_at: typeof invite.expires_at === "string" ? invite.expires_at : null,
    max_views: typeof invite.max_views === "number" ? invite.max_views : null,
    is_active: isActive,
    public_url: token ? `/review/${encodeURIComponent(token)}` : null,
    asset_ids: [assetId],
    permission,
  };
}

async function loadRemoteShareLinks(
  signal: AbortSignal,
  currentUserId: string,
): Promise<ShareLink[]> {
  const projectsResponse = await fetch("/api/projects", {
    cache: "no-store",
    signal,
  });

  if (!projectsResponse.ok) {
    throw new Error("Review access could not be verified");
  }

  const projects = readItems(await projectsResponse.json(), "Projects");
  const assetIds = Array.from(
    new Set(
      projects.flatMap((project) =>
        Array.isArray(project.assets)
          ? project.assets
              .filter(isRecord)
              .map((asset) => asset.id)
              .filter((id): id is string => typeof id === "string" && id.length > 0)
          : [],
      ),
    ),
  );
  const links: ShareLink[] = [];

  for (let offset = 0; offset < assetIds.length; offset += SHARE_INDEX_CONCURRENCY) {
    const chunk = assetIds.slice(offset, offset + SHARE_INDEX_CONCURRENCY);
    const chunkLinks = await Promise.all(
      chunk.map(async (assetId) => {
        const response = await fetch(
          `/api/assets/${encodeURIComponent(assetId)}/share`,
          { cache: "no-store", signal },
        );
        if (!response.ok) throw new Error("A review handoff could not be loaded");

        return readItems(await response.json(), "Share links")
          .map((invite) => normalizeRemoteShareLink(invite, assetId, currentUserId))
          .filter((link): link is ShareLink => link !== null);
      }),
    );
    links.push(...chunkLinks.flat());
  }

  return links.sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function resolvePublicLink(value: string, demoMode: boolean, runtimeOrigin: string | null): string | null {
  if (!runtimeOrigin) return null;
  try {
    if (demoMode) return toDemoSiteUrl(value, runtimeOrigin);
    return toClientSiteUrl(value, runtimeOrigin);
  } catch {
    return null;
  }
}

function permissionLabel(permission: ShareLink["permission"]) {
  switch (permission) {
    case "approve":
      return "Approval";
    case "comment":
      return "Comment";
    case "view":
      return "View only";
    default:
      return "Review";
  }
}

function scopeLabel(link: ShareLink) {
  const count = link.media_count ?? link.asset_ids?.length ?? 0;
  if (count <= 0) return "No media attached";
  return `${count} media item${count === 1 ? "" : "s"}${link.batch_id ? " in batch" : ""}`;
}

function expiryLabel(expiresAt: string | null | undefined) {
  if (!expiresAt) return "No expiration";
  return new Date(expiresAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function viewCapLabel(maxViews: number | null | undefined) {
  return maxViews ? `${maxViews} view cap` : "No view cap";
}

function linkTitle(link: ShareLink) {
  return link.message || link.asset_title || link.project_name || "External review link";
}

function recipientLabel(link: ShareLink) {
  return link.reviewer_name || link.reviewer_email || "Open access";
}

function passwordProtectionLabel(value: ShareLink["password_protected"]) {
  if (value === true) return "Password required";
  if (value === false) return "No password required";
  return "Password status unavailable";
}

function ReviewPageStateSurface({
  kind,
}: {
  kind: "loading" | "unavailable";
}) {
  const loading = kind === "loading";

  return (
    <div className={styles.page}>
      <section
        className={styles.stateSurface}
        data-state={kind}
        role={loading ? "status" : "alert"}
        aria-live={loading ? "polite" : "assertive"}
        aria-busy={loading}
      >
        <header>
          <span>External review</span>
          <h1>Review links</h1>
        </header>
        <div className={styles.statePanel}>
          <div className={styles.stateMessage}>
            <span className={styles.stateIcon} aria-hidden="true">
              {loading ? <Link2 size={20} /> : <Shield size={20} />}
            </span>
            <div>
              <strong>
                {loading ? "Loading review links" : "Reviews are unavailable"}
              </strong>
              <span>
                {loading
                  ? "Verifying your workspace and review authority."
                  : "Your account session could not be verified."}
              </span>
            </div>
          </div>
          {loading ? (
            <div className={styles.stateLoadingRows} aria-hidden="true">
              {[1, 2, 3].map((item) => <i key={item} />)}
            </div>
          ) : (
            <div className={styles.stateAuthority}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Staff workspace access is required to manage review links.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function ReviewsPage() {
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const hostContext = useAuthHostContext();
  const authSession = useAuthSession(!demoMode);
  const clientPortal =
    !demoMode &&
    (hostContext.kind === "client" || authSession.session?.surfaceRole === "client");
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [remoteLinks, setRemoteLinks] = useState<ShareLink[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState("");
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runtimeOrigin, setRuntimeOrigin] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShareLink | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const links: ShareLink[] = demoMode ? demoWorkspace.shareLinks : remoteLinks;
  const loading = demoMode ? false : remoteLoading;
  const querySuffix = demoMode ? "?demo=1" : "";

  useEffect(() => {
    setRuntimeOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (
      demoMode ||
      authSession.loading ||
      authSession.session?.surfaceRole !== "staff"
    ) {
      return;
    }

    const controller = new AbortController();
    setRemoteLoading(true);
    loadRemoteShareLinks(controller.signal, authSession.session.id)
      .then((items) => {
        setRemoteLinks(items);
        setRemoteError("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRemoteLinks([]);
        setRemoteError(error instanceof Error ? error.message : "Review links could not be loaded");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemoteLoading(false);
      });

    return () => controller.abort();
  }, [authSession.loading, authSession.session, demoMode]);

  useEffect(() => {
    if (!detail) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [detail]);

  const filtered = tab === "mine"
    ? links.filter((link) => link.created_by_name === "You")
    : links;
  const summary = useMemo(() => {
    const now = Date.now();
    const week = 7 * 86400000;
    return {
      active: links.filter((link) => link.is_active !== false).length,
      approvals: links.filter((link) => link.permission === "approve").length,
      invited: links.reduce((total, link) => total + (link.invited_count ?? 0), 0),
      expiring: links.filter((link) => {
        if (!link.expires_at || link.is_active === false) return false;
        const remaining = new Date(link.expires_at).getTime() - now;
        return remaining > 0 && remaining <= week;
      }).length,
    };
  }, [links]);
  const detailPublicUrl = detail?.public_url
    ? resolvePublicLink(detail.public_url, demoMode, runtimeOrigin)
    : null;

  if (clientPortal) {
    return <ClientReviewInbox />;
  }

  if (!demoMode && authSession.loading) {
    return <ReviewPageStateSurface kind="loading" />;
  }

  if (!demoMode && authSession.session?.surfaceRole !== "staff") {
    return <ReviewPageStateSurface kind="unavailable" />;
  }

  async function copyLink(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1800);
    } catch {
      setRemoteError("The review URL could not be copied from this browser");
    }
  }

  async function toggleLink(link: ShareLink) {
    if (demoMode) {
      setDemoShareLinkActive(link.id, link.is_active === false);
      setDetail((current) => current?.id === link.id
        ? { ...current, is_active: current.is_active === false }
        : current);
      return;
    }

    if (link.is_active === false || !link.asset_id || mutatingId) return;
    setMutatingId(link.id);
    setRemoteError("");
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(link.asset_id)}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Review link could not be revoked");
      setRemoteLinks((current) => current.map((item) =>
        item.id === link.id ? { ...item, is_active: false } : item,
      ));
      setDetail((current) => current?.id === link.id
        ? { ...current, is_active: false }
        : current);
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : "Review link could not be revoked");
    } finally {
      setMutatingId(null);
    }
  }

  function publicUrlFor(link: ShareLink) {
    return link.public_url
      ? resolvePublicLink(link.public_url, demoMode, runtimeOrigin)
      : null;
  }

  function renderEmpty() {
    return (
      <div className={styles.emptyState}>
        <Link2 size={22} aria-hidden="true" />
        <strong>No review links in this view</strong>
        <span>Share media from a project cockpit to create one.</span>
        <Link href={`/projects${querySuffix}`}>Open projects</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.desktopComposition}>
        <header className={styles.pageHeader}>
          <div>
            <span>External review</span>
            <div><h1>Review links</h1><p>{summary.active} active · {summary.approvals} require approval</p></div>
          </div>
          <Link href={`/projects${querySuffix}`}>Open project cockpit</Link>
        </header>

        <section className={styles.metricStrip} aria-label="Review-link status">
          <div><Link2 size={16} /><span><small>Active links</small><strong>{summary.active}</strong></span></div>
          <div><ShieldCheck size={16} /><span><small>Approval routes</small><strong>{summary.approvals}</strong></span></div>
          <div><UserRound size={16} /><span><small>Invited reviewers</small><strong>{summary.invited}</strong></span></div>
          <div><CalendarClock size={16} /><span><small>Expiring soon</small><strong>{summary.expiring}</strong></span></div>
        </section>

        <div className={styles.toolbar}>
          <div role="tablist" aria-label="Review link views">
            <button role="tab" aria-selected={tab === "all"} data-active={tab === "all"} onClick={() => setTab("all")}>All <span>{links.length}</span></button>
            <button role="tab" aria-selected={tab === "mine"} data-active={tab === "mine"} onClick={() => setTab("mine")}>Created by me</button>
          </div>
          <span>{filtered.length} shown</span>
        </div>

        {remoteError ? <div role="alert" className={styles.alert}>{remoteError}</div> : null}

        <section className={styles.tableSurface} aria-label="Review links">
          {loading ? (
            <div className={styles.loadingRows}>{[1, 2, 3, 4].map((item) => <i key={item} />)}</div>
          ) : filtered.length === 0 ? renderEmpty() : (
            <table>
              <thead><tr><th>Review</th><th>Permission</th><th>Recipient</th><th>Created</th><th>Readiness</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {filtered.map((link) => {
                  const publicUrl = publicUrlFor(link);
                  const active = link.is_active !== false;
                  return (
                    <tr key={link.id}>
                      <td>
                        <button className={styles.reviewIdentity} type="button" onClick={() => setDetail(link)}>
                          <span><Link2 size={15} /></span>
                          <span><strong>{linkTitle(link)}</strong><small>{link.project_name || scopeLabel(link)}</small></span>
                        </button>
                      </td>
                      <td><span className={styles.permission} data-permission={link.permission ?? "comment"}>{permissionLabel(link.permission)}</span></td>
                      <td><span className={styles.recipient}><strong>{recipientLabel(link)}</strong><small>{link.invited_count ?? 0} invited</small></span></td>
                      <td><span className={styles.created}><strong>{timeAgo(link.created_at)}</strong><small>{link.created_by_name || "Workspace member"}</small></span></td>
                      <td><span className={styles.readiness} data-active={active}><i />{active ? "Ready" : "Revoked"}</span></td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" onClick={() => publicUrl && copyLink(publicUrl, link.id)} disabled={!publicUrl} aria-label="Copy review link" title="Copy review link">{copiedId === link.id ? <Check size={15} /> : <Copy size={15} />}</button>
                          {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" aria-label="Open review link" title="Open review link"><ExternalLink size={15} /></a> : null}
                          <button type="button" onClick={() => toggleLink(link)} disabled={mutatingId === link.id || (!demoMode && !active)} aria-label={active ? "Revoke review link" : "Review link revoked"} title={!demoMode && !active ? "Revoked links cannot be restored; create a new link instead" : "Revoke review link"}><Power size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.governanceStrip} aria-label="Review-link authority">
          <div><Shield size={15} /><span><strong>Version bound</strong><small>Every link resolves one review version</small></span></div>
          <div><Link2 size={15} /><span><strong>Opaque tokens</strong><small>Secrets stay outside list responses</small></span></div>
          <div><Power size={15} /><span><strong>Explicit revocation</strong><small>Production links are replaced, not restored</small></span></div>
        </section>
      </div>

      <div className={styles.mobileComposition}>
        <header className={styles.mobileHeader}><span>External review</span><h1>Review links</h1><p>{summary.active} active · {summary.approvals} approvals</p></header>
        <section className={styles.mobileMetrics} aria-label="Review-link status">
          <div><small>Active</small><strong>{summary.active}</strong></div>
          <div><small>Approval</small><strong>{summary.approvals}</strong></div>
          <div><small>Invited</small><strong>{summary.invited}</strong></div>
          <div><small>Expiring</small><strong>{summary.expiring}</strong></div>
        </section>
        <div className={styles.mobileTabs} role="tablist" aria-label="Review link views">
          <button role="tab" aria-selected={tab === "all"} data-active={tab === "all"} onClick={() => setTab("all")}>All <span>{links.length}</span></button>
          <button role="tab" aria-selected={tab === "mine"} data-active={tab === "mine"} onClick={() => setTab("mine")}>Mine</button>
        </div>
        {remoteError ? <div role="alert" className={styles.alert}>{remoteError}</div> : null}
        <section className={styles.mobileList} aria-label="Review links">
          {loading ? <div className={styles.loadingRows}>{[1, 2, 3].map((item) => <i key={item} />)}</div> : null}
          {!loading && filtered.length === 0 ? renderEmpty() : null}
          {!loading && filtered.map((link) => {
            const publicUrl = publicUrlFor(link);
            const active = link.is_active !== false;
            return (
              <article key={link.id}>
                <div className={styles.mobileRowTop}>
                  <button type="button" onClick={() => setDetail(link)}><strong>{linkTitle(link)}</strong><small>{link.project_name || scopeLabel(link)}</small></button>
                  <span className={styles.readiness} data-active={active}><i />{active ? "Ready" : "Revoked"}</span>
                </div>
                <div className={styles.mobileMeta}>
                  <span><small>Permission</small><strong>{permissionLabel(link.permission)}</strong></span>
                  <span><small>Recipient</small><strong>{recipientLabel(link)}</strong></span>
                  <span><small>Created</small><strong>{timeAgo(link.created_at)}</strong></span>
                </div>
                <div className={styles.mobileActions}>
                  <button type="button" onClick={() => publicUrl && copyLink(publicUrl, link.id)} disabled={!publicUrl}>{copiedId === link.id ? <Check size={15} /> : <Copy size={15} />} {copiedId === link.id ? "Copied" : "Copy"}</button>
                  {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open</a> : null}
                  <button type="button" onClick={() => toggleLink(link)} disabled={mutatingId === link.id || (!demoMode && !active)}><Power size={15} /> {active ? "Revoke" : "Revoked"}</button>
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {detail ? (
        <div className={styles.drawerOverlay} role="presentation" onMouseDown={() => setDetail(null)}>
          <aside className={styles.detailDrawer} role="dialog" aria-modal="true" aria-labelledby="review-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>Review authority</span><h2 id="review-detail-title">{linkTitle(detail)}</h2></div>
              <button ref={closeRef} type="button" onClick={() => setDetail(null)} aria-label="Close share link details" title="Close"><X size={18} /></button>
            </header>
            <div className={styles.drawerBody}>
              <section className={styles.drawerStatus}>
                <span className={styles.readiness} data-active={detail.is_active !== false}><i />{detail.is_active !== false ? "Ready to review" : "Revoked"}</span>
                <small>{scopeLabel(detail)}</small>
              </section>
              <dl>
                <div><dt>Permission</dt><dd>{permissionLabel(detail.permission)}</dd></div>
                <div><dt>Recipient</dt><dd>{recipientLabel(detail)}</dd></div>
                <div><dt>Created</dt><dd>{timeAgo(detail.created_at)} by {detail.created_by_name || "Workspace member"}</dd></div>
                <div><dt>Expiration</dt><dd>{expiryLabel(detail.expires_at)}</dd></div>
                <div><dt>View policy</dt><dd>{viewCapLabel(detail.max_views)}</dd></div>
              </dl>
              <section className={styles.permissionGrid} aria-label="Permission and readiness">
                <div><Shield size={15} /><span><strong>{permissionLabel(detail.permission)} access</strong><small>{detail.require_name ? "Name required" : "Anonymous access allowed"}</small></span></div>
                <div><MessageSquare size={15} /><span><strong>{detail.allow_comments !== false ? "Comments enabled" : "Comments disabled"}</strong><small>{expiryLabel(detail.expires_at)}</small></span></div>
                <div><Download size={15} /><span><strong>{detail.allow_downloads ? "Downloads enabled" : "Downloads disabled"}</strong><small>{passwordProtectionLabel(detail.password_protected)}</small></span></div>
                <div><Eye size={15} /><span><strong>{scopeLabel(detail)}</strong><small>{viewCapLabel(detail.max_views)}</small></span></div>
              </section>
              {detailPublicUrl ? <label className={styles.urlField}><span>Share link</span><input readOnly value={detailPublicUrl} /></label> : null}
            </div>
            <footer>
              <button type="button" onClick={() => detailPublicUrl && copyLink(detailPublicUrl, detail.id)} disabled={!detailPublicUrl}>{copiedId === detail.id ? <Check size={15} /> : <Copy size={15} />} {copiedId === detail.id ? "Copied" : "Copy link"}</button>
              {detailPublicUrl ? <a href={detailPublicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open review</a> : null}
              <button type="button" data-danger="true" onClick={() => toggleLink(detail)} disabled={mutatingId === detail.id || (!demoMode && detail.is_active === false)}><Power size={15} /> {detail.is_active === false ? "Revoked" : "Revoke"}</button>
            </footer>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
