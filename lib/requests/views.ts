/* P27: Request Center — read-side views.                                    */
/* Message visibility (internal notes never reach the client audience) and   */
/* the internal queue projection, which merges typed requests with the       */
/* P26 library cutdown intake. Pure; UI and store share these projections.   */

import type { RequestKind, RequestPriority } from "./model.ts";
import type { RequestStatus } from "./lifecycle.ts";

export type RequestAudience = "client" | "team";
export type MessageVisibility = "client" | "internal";

/** Internal notes are team-only by construction — the client audience can
 * never select them, no matter what the UI asks for. */
export function visibleRequestMessages<T extends { visibility: MessageVisibility }>(
  messages: T[],
  audience: RequestAudience,
): T[] {
  if (audience === "client") return messages.filter((message) => message.visibility === "client");
  return messages;
}

export interface QueueRequestRef {
  id: string;
  kind: RequestKind;
  title: string;
  priority: RequestPriority;
  status: RequestStatus;
  requester_name: string;
  requested_due_date: string;
  platform: string | null;
  created_at: string;
}

export interface QueueLibraryCutdownRef {
  id: string;
  asset_id: string;
  asset_title: string;
  platform: string;
  duration_seconds: number;
  note: string;
  status: "recorded";
  created_at: string;
}

export interface QueueRow {
  id: string;
  /** request = typed intake; library_cutdown = recorded from the P26 library. */
  origin: "request" | "library_cutdown";
  kind: RequestKind;
  title: string;
  priority: RequestPriority;
  status: RequestStatus;
  requester: string;
  dueDate: string | null;
  platform: string | null;
  createdAt: string;
}

/** Merge typed requests with library cutdown requests into one queue, newest
 * first. Library rows stay honest about their origin so the UI can badge them
 * and withhold triage actions (they are intake records, not typed requests). */
export function queueRowsFrom(input: {
  requests: QueueRequestRef[];
  libraryCutdowns: QueueLibraryCutdownRef[];
}): QueueRow[] {
  const requestRows: QueueRow[] = input.requests.map((request) => ({
    id: request.id,
    origin: "request",
    kind: request.kind,
    title: request.title,
    priority: request.priority,
    status: request.status,
    requester: request.requester_name,
    dueDate: request.requested_due_date,
    platform: request.platform,
    createdAt: request.created_at,
  }));
  const cutdownRows: QueueRow[] = input.libraryCutdowns.map((cutdown) => ({
    id: cutdown.id,
    origin: "library_cutdown",
    kind: "social_cutdown",
    title: `Social cutdown — ${cutdown.asset_title}`,
    priority: "standard",
    status: "submitted",
    requester: "Client (library)",
    dueDate: null,
    platform: cutdown.platform,
    createdAt: cutdown.created_at,
  }));
  return [...requestRows, ...cutdownRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface QueueFilter {
  status: RequestStatus | "all";
  kind: RequestKind | "all";
  priority: RequestPriority | "all";
}

export function filterQueueRows(rows: QueueRow[], filter: QueueFilter): QueueRow[] {
  return rows.filter((row) => {
    if (filter.status !== "all" && row.status !== filter.status) return false;
    if (filter.kind !== "all" && row.kind !== filter.kind) return false;
    if (filter.priority !== "all" && row.priority !== filter.priority) return false;
    return true;
  });
}
