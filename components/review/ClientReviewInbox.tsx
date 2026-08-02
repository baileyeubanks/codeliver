"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Eye,
  Film,
  History,
  Inbox,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type {
  ClientReviewAccessStatus,
  ClientReviewInbox as ClientReviewInboxDTO,
  ClientReviewInboxItem,
} from "@/lib/client-review-inbox";
import styles from "./ClientReviewInbox.module.css";

type InboxTab = "open" | "history";
type LoadState = "loading" | "ready" | "error";

const ACCESS_LABELS: Record<ClientReviewAccessStatus, string> = {
  open: "Open",
  expired: "Expired",
  revoked: "Revoked",
  view_limit_reached: "View limit reached",
};

const PERMISSION_LABELS: Record<ClientReviewInboxItem["permission"], string> = {
  view: "View only",
  comment: "Comment",
  approve: "Approve",
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInboxItem(value: unknown): value is ClientReviewInboxItem {
  if (!isRecord(value)) return false;
  const permission = value.permission;
  const accessStatus = value.accessStatus;
  const validDate = (candidate: unknown) =>
    typeof candidate === "string" && Number.isFinite(Date.parse(candidate));

  return Boolean(
    typeof value.id === "string" &&
      typeof value.assetId === "string" &&
      typeof value.versionId === "string" &&
      typeof value.assetTitle === "string" &&
      typeof value.assetStatus === "string" &&
      (value.projectId === null || typeof value.projectId === "string") &&
      (value.projectName === null || typeof value.projectName === "string") &&
      (value.reviewerName === null || typeof value.reviewerName === "string") &&
      (permission === "view" || permission === "comment" || permission === "approve") &&
      validDate(value.createdAt) &&
      (value.expiresAt === null || validDate(value.expiresAt)) &&
      (accessStatus === "open" ||
        accessStatus === "expired" ||
        accessStatus === "revoked" ||
        accessStatus === "view_limit_reached") &&
      (value.reviewHref === null || typeof value.reviewHref === "string")
  );
}

function isInboxPayload(value: unknown): value is ClientReviewInboxDTO {
  if (!isRecord(value)) return false;

  const items = value.items;
  const summary = value.summary;
  if (!Array.isArray(items) || !isRecord(summary)) {
    return false;
  }

  if (!items.every(isInboxItem)) return false;
  if (
    !["total", "open", "history", "approvals"].every(
      (key) =>
        Number.isSafeInteger(summary[key]) && Number(summary[key]) >= 0,
    )
  ) {
    return false;
  }

  const open = items.filter((item) => item.accessStatus === "open");
  return (
    summary.total === items.length &&
    summary.open === open.length &&
    summary.history === items.length - open.length &&
    summary.approvals ===
      open.filter((item) => item.permission === "approve").length
  );
}

function isSameOriginReviewHref(value: string | null): value is string {
  if (!value?.startsWith("/")) return false;

  try {
    const base = new URL("https://review-inbox.local");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin && resolved.pathname.startsWith("/review/");
  } catch {
    return false;
  }
}

async function loadInbox(signal: AbortSignal): Promise<ClientReviewInboxDTO> {
  const response = await fetch("/api/client/reviews", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) throw new Error("Client reviews request failed");

  const payload: unknown = await response.json();
  if (!isInboxPayload(payload)) throw new Error("Invalid client reviews response");
  return payload;
}

function formatDate(value: string) {
  return DATE_FORMATTER.format(new Date(value));
}

function PermissionIcon({ permission }: { permission: ClientReviewInboxItem["permission"] }) {
  if (permission === "approve") return <CheckCircle2 size={13} aria-hidden="true" />;
  if (permission === "comment") return <MessageSquareText size={13} aria-hidden="true" />;
  return <Eye size={13} aria-hidden="true" />;
}

function ReviewAssignment({ item }: { item: ClientReviewInboxItem }) {
  const reviewHref = item.accessStatus === "open" && isSameOriginReviewHref(item.reviewHref)
    ? item.reviewHref
    : null;
  const canOpen = reviewHref !== null;
  const expirationLabel = item.accessStatus === "expired" ? "Expired" : "Expires";
  const content = (
    <>
      <div className={styles.assignmentTop}>
        <span className={styles.assetIcon} aria-hidden="true">
          <Film size={18} />
        </span>
        <div className={styles.assignmentCopy}>
          <p>{item.projectName ?? "Review assignment"}</p>
          <h3>{item.assetTitle}</h3>
        </div>
        <div className={styles.labels} aria-label="Review access">
          <span className={styles.permissionLabel}>
            <PermissionIcon permission={item.permission} />
            {PERMISSION_LABELS[item.permission]}
          </span>
          <span className={`${styles.statusLabel} ${styles[item.accessStatus]}`}>
            {ACCESS_LABELS[item.accessStatus]}
          </span>
        </div>
      </div>

      <div className={styles.assignmentFooter}>
        <div className={styles.assignmentDates}>
          <span>
            <CalendarDays size={13} aria-hidden="true" />
            Shared {formatDate(item.createdAt)}
          </span>
          {item.expiresAt ? (
            <span>
              <Clock3 size={13} aria-hidden="true" />
              {expirationLabel} {formatDate(item.expiresAt)}
            </span>
          ) : null}
        </div>
        <span className={canOpen ? styles.openAction : styles.disabledAction}>
          {canOpen ? (
            <>
              Open review <ArrowRight size={15} aria-hidden="true" />
            </>
          ) : (
            <>
              <LockKeyhole size={14} aria-hidden="true" /> Unavailable
            </>
          )}
        </span>
      </div>
    </>
  );

  return (
    <li>
      {reviewHref !== null ? (
        <Link
          className={`${styles.assignment} ${styles.assignmentLink}`}
          href={reviewHref}
          prefetch={false}
        >
          {content}
        </Link>
      ) : (
        <div
          className={`${styles.assignment} ${styles.assignmentDisabled}`}
          aria-disabled="true"
        >
          {content}
        </div>
      )}
    </li>
  );
}

function EmptyState({ tab, hasAnyItems }: { tab: InboxTab; hasAnyItems: boolean }) {
  const EmptyIcon = tab === "open" ? Inbox : History;
  const title = !hasAnyItems
    ? "No reviews assigned"
    : tab === "open"
      ? "No open reviews"
      : "No review history";
  const detail = !hasAnyItems
    ? "New assignments will appear here."
    : tab === "open"
      ? "You're all caught up."
      : "Closed assignments will appear here.";

  return (
    <div className={styles.emptyState}>
      <span className={styles.stateIcon} aria-hidden="true">
        <EmptyIcon size={20} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.loadingState} role="status">
      <span className={styles.srOnly}>Loading review assignments</span>
      <div className={styles.summary} aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <span className={styles.summarySkeletonItem} key={item}>
            <i className={`${styles.skeleton} ${styles.skeletonCount}`} />
            <i className={`${styles.skeleton} ${styles.skeletonLabel}`} />
          </span>
        ))}
      </div>
      <div className={styles.tabsSkeleton} aria-hidden="true">
        <i className={styles.skeleton} />
        <i className={styles.skeleton} />
      </div>
      <div className={styles.assignmentList} aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div className={styles.assignmentSkeleton} key={item}>
            <i className={`${styles.skeleton} ${styles.skeletonIcon}`} />
            <span>
              <i className={`${styles.skeleton} ${styles.skeletonEyebrow}`} />
              <i className={`${styles.skeleton} ${styles.skeletonTitle}`} />
              <i className={`${styles.skeleton} ${styles.skeletonMeta}`} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClientReviewInbox() {
  const instanceId = useId();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [inbox, setInbox] = useState<ClientReviewInboxDTO | null>(null);
  const [activeTab, setActiveTab] = useState<InboxTab>("open");
  const [requestVersion, setRequestVersion] = useState(0);
  const openTabRef = useRef<HTMLButtonElement>(null);
  const historyTabRef = useRef<HTMLButtonElement>(null);
  const titleId = `${instanceId}-title`;
  const openTabId = `${instanceId}-open-tab`;
  const historyTabId = `${instanceId}-history-tab`;
  const openPanelId = `${instanceId}-open-panel`;
  const historyPanelId = `${instanceId}-history-panel`;

  useEffect(() => {
    const controller = new AbortController();

    loadInbox(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setInbox(payload);
        setLoadState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setInbox(null);
        setLoadState("error");
      });

    return () => controller.abort();
  }, [requestVersion]);

  function retry() {
    setInbox(null);
    setLoadState("loading");
    setRequestVersion((version) => version + 1);
  }

  function selectTab(tab: InboxTab, focus = false) {
    setActiveTab(tab);
    if (focus) {
      const target = tab === "open" ? openTabRef.current : historyTabRef.current;
      target?.focus();
    }
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    let nextTab: InboxTab | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextTab = activeTab === "open" ? "history" : "open";
    } else if (event.key === "Home") {
      nextTab = "open";
    } else if (event.key === "End") {
      nextTab = "history";
    }

    if (!nextTab) return;
    event.preventDefault();
    selectTab(nextTab, true);
  }

  const openItems = inbox?.items.filter((item) => item.accessStatus === "open") ?? [];
  const historyItems = inbox?.items.filter((item) => item.accessStatus !== "open") ?? [];

  return (
    <section
      className={styles.inbox}
      aria-labelledby={titleId}
      aria-busy={loadState === "loading"}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Client workspace</p>
          <h1 id={titleId}>Review inbox</h1>
          <p className={styles.intro}>Assignments shared with you.</p>
        </div>
      </header>

      {loadState === "loading" ? <LoadingState /> : null}

      {loadState === "error" ? (
        <div className={styles.errorState} role="alert">
          <span className={`${styles.stateIcon} ${styles.errorIcon}`} aria-hidden="true">
            <CircleAlert size={20} />
          </span>
          <div>
            <h2>Reviews could not load</h2>
            <p>Check your connection and try again.</p>
          </div>
          <button type="button" onClick={retry}>
            <RefreshCw size={15} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : null}

      {loadState === "ready" && inbox ? (
        <>
          <dl className={styles.summary} aria-label="Review summary">
            <div>
              <dt>All</dt>
              <dd>{inbox.summary.total}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{inbox.summary.open}</dd>
            </div>
            <div>
              <dt>Approvals</dt>
              <dd>{inbox.summary.approvals}</dd>
            </div>
            <div>
              <dt>History</dt>
              <dd>{inbox.summary.history}</dd>
            </div>
          </dl>

          <div className={styles.tabs} role="tablist" aria-label="Review assignments">
            <button
              ref={openTabRef}
              id={openTabId}
              className={activeTab === "open" ? styles.activeTab : undefined}
              type="button"
              role="tab"
              aria-selected={activeTab === "open"}
              aria-controls={openPanelId}
              tabIndex={activeTab === "open" ? 0 : -1}
              onClick={() => selectTab("open")}
              onKeyDown={handleTabKeyDown}
            >
              <Inbox size={15} aria-hidden="true" />
              Open
              <span>{inbox.summary.open}</span>
            </button>
            <button
              ref={historyTabRef}
              id={historyTabId}
              className={activeTab === "history" ? styles.activeTab : undefined}
              type="button"
              role="tab"
              aria-selected={activeTab === "history"}
              aria-controls={historyPanelId}
              tabIndex={activeTab === "history" ? 0 : -1}
              onClick={() => selectTab("history")}
              onKeyDown={handleTabKeyDown}
            >
              <History size={15} aria-hidden="true" />
              History
              <span>{inbox.summary.history}</span>
            </button>
          </div>

          <div
            id={openPanelId}
            className={styles.panel}
            role="tabpanel"
            aria-labelledby={openTabId}
            hidden={activeTab !== "open"}
          >
            {openItems.length > 0 ? (
              <ul className={styles.assignmentList}>
                {openItems.map((item) => <ReviewAssignment item={item} key={item.id} />)}
              </ul>
            ) : (
              <EmptyState tab="open" hasAnyItems={inbox.summary.total > 0} />
            )}
          </div>

          <div
            id={historyPanelId}
            className={styles.panel}
            role="tabpanel"
            aria-labelledby={historyTabId}
            hidden={activeTab !== "history"}
          >
            {historyItems.length > 0 ? (
              <ul className={styles.assignmentList}>
                {historyItems.map((item) => <ReviewAssignment item={item} key={item.id} />)}
              </ul>
            ) : (
              <EmptyState tab="history" hasAnyItems={inbox.summary.total > 0} />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
