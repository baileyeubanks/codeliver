import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { afterEach } from "node:test";
import { fileURLToPath } from "node:url";
import { useNotificationStore } from "../lib/stores/notificationStore.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const originalFetch = globalThis.fetch;

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function notification(id: string, read = false) {
  return {
    id,
    user_id: "user-1",
    type: "comment_added" as const,
    title: "New comment",
    body: "A reviewer left feedback.",
    data: { project_id: "project-1", asset_id: "asset-1" },
    read,
    created_at: "2026-07-15T12:00:00.000Z",
  };
}

function resetStore(items = [notification("notification-1")]) {
  useNotificationStore.setState({
    notifications: items,
    unreadCount: items.filter((item) => !item.read).length,
    loading: false,
    open: false,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetStore([]);
});

test("single notification reads remain optimistic only after durable confirmation", async () => {
  resetStore();
  const requests: Array<{ method: string; body: string | null }> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push({
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    return jsonResponse({ ok: true });
  };

  const persisted = await useNotificationStore.getState().markRead("notification-1");

  assert.equal(persisted, true);
  assert.equal(useNotificationStore.getState().notifications[0]?.read, true);
  assert.equal(useNotificationStore.getState().unreadCount, 0);
  assert.deepEqual(requests, [{
    method: "PATCH",
    body: JSON.stringify({ id: "notification-1", read: true }),
  }]);
});

test("failed single reads roll back, refetch, and report failure", async () => {
  resetStore();
  const methods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return jsonResponse({ error: "unavailable" }, 503);
  };

  const persisted = await useNotificationStore.getState().markRead("notification-1");

  assert.equal(persisted, false);
  assert.equal(useNotificationStore.getState().notifications[0]?.read, false);
  assert.equal(useNotificationStore.getState().unreadCount, 1);
  assert.deepEqual(methods, ["PATCH", "GET"]);
});

test("failed mark-all writes restore every prior unread notification", async () => {
  resetStore([notification("notification-1"), notification("notification-2", true)]);
  globalThis.fetch = async () => jsonResponse({ ok: false });

  const persisted = await useNotificationStore.getState().markAllRead();
  const state = useNotificationStore.getState();

  assert.equal(persisted, false);
  assert.deepEqual(state.notifications.map((item) => item.read), [false, true]);
  assert.equal(state.unreadCount, 1);
});

test("failed refreshes preserve the last known notification state", async () => {
  resetStore();
  globalThis.fetch = async () => jsonResponse({ error: "unavailable" }, 503);

  const refreshed = await useNotificationStore.getState().fetchNotifications();

  assert.equal(refreshed, false);
  assert.equal(useNotificationStore.getState().notifications[0]?.id, "notification-1");
  assert.equal(useNotificationStore.getState().loading, false);
});

test("realtime inserts are idempotent by notification id", () => {
  resetStore();
  useNotificationStore.getState().addNotification({
    ...notification("notification-1"),
    title: "Updated comment",
  });

  const state = useNotificationStore.getState();
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0]?.title, "Updated comment");
  assert.equal(state.unreadCount, 1);
});

test("the bell uses realtime authority and scopes cockpit counts to project notifications", () => {
  const bell = source("components/notifications/NotificationBell.tsx");
  const cockpit = source("components/projects/ProjectCockpit.tsx");

  assert.match(bell, /useRealtimeNotifications\(\)/);
  assert.match(bell, /belongsToProject\(notification, projectId\)/);
  assert.match(bell, /scopedNotifications\.filter\(\(notification\) => !notification\.read\)/);
  assert.match(cockpit, /<NotificationBell[\s\S]*?projectId=\{project\.id\}/);
  assert.doesNotMatch(cockpit, /projectActivity\.slice\(0, 3\)/);
});

test("realtime failure falls back to bounded visibility-aware polling", () => {
  const realtime = source("lib/hooks/useRealtimeNotifications.ts");

  assert.match(realtime, /MIN_POLL_INTERVAL_MS = 15_000/);
  assert.match(realtime, /MAX_POLL_INTERVAL_MS = 120_000/);
  assert.match(realtime, /event: "INSERT"/);
  assert.match(realtime, /event: "UPDATE"/);
  assert.match(realtime, /fetchNotifications\(\{ silent: true \}\)/);
  assert.match(realtime, /status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT" \|\| status === "CLOSED"/);
  assert.match(realtime, /document\.visibilityState === "hidden"/);
  assert.match(realtime, /window\.addEventListener\("online", refreshFallback\)/);
});

test("unread notification navigation waits for persistence and exposes failure", () => {
  const item = source("components/notifications/NotificationItem.tsx");
  const awaitIndex = item.indexOf("await onMarkRead(notification.id)");
  const failureIndex = item.indexOf("if (!persisted)");
  const navigationIndex = item.indexOf("router.push(destination)");

  assert.ok(awaitIndex >= 0);
  assert.ok(failureIndex > awaitIndex);
  assert.ok(navigationIndex > failureIndex);
  assert.match(item, /Could not mark as read\. Try again\./);
});

test("mobile recent projects honor the query-owned project selection", () => {
  const navigation = source("components/navigation/WorkspaceNavigation.tsx");

  assert.match(navigation, /const searchParams = useSearchParams\(\)/);
  assert.match(navigation, /pathname === "\/projects" \? searchParams\.get\("project"\) : null/);
  assert.match(navigation, /data-active=\{activeProjectId === project\.id\}/);
});
