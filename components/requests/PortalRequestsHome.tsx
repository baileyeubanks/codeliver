"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import PortalShell from "@/components/portal/PortalShell";
import { useDemoMode } from "@/lib/demo/mode";
import {
  addDemoRequestMessage,
  useDemoWorkspace,
  type DemoRequest,
} from "@/lib/demo/workspace-store";
import { resolveClientIdentity } from "@/lib/portal/views.ts";
import { REQUEST_KIND_LABELS, REQUEST_PRIORITY_LABELS } from "@/lib/requests/model.ts";
import StatusChip from "./StatusChip";
import RequestThread from "./RequestThread";

function OwnRequestCard({
  request,
  expanded,
  onToggle,
}: {
  request: DemoRequest;
  expanded: boolean;
  onToggle: () => void;
}) {
  const workspace = useDemoWorkspace();
  const messages = useMemo(
    () => workspace.requestMessages.filter((message) => message.request_id === request.id),
    [workspace.requestMessages, request.id],
  );

  return (
    <article
      data-testid={`portal-request-${request.id}`}
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`portal-request-toggle-${request.id}`}
        className="block min-h-11 w-full text-left"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={request.status} />
          <span className="text-[10px] font-bold uppercase text-[var(--muted)]">
            {REQUEST_KIND_LABELS[request.kind]}
          </span>
          <span className="text-[10px] font-bold uppercase text-[var(--dim)]">
            {REQUEST_PRIORITY_LABELS[request.priority]}
          </span>
          <span className="text-[10px] text-[var(--dim)]">due {request.requested_due_date}</span>
        </span>
        <span className="mt-1 block text-sm font-bold text-[var(--ink)]">{request.title}</span>
      </button>

      {request.status === "declined" && request.decline_note ? (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--red-dim)] px-3 py-2 text-xs text-[var(--red)]">
          Declined by the team: {request.decline_note}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <RequestThread
            messages={messages}
            audience="client"
            onPost={({ body }) =>
              addDemoRequestMessage(request.id, { authorRole: "client", visibility: "client", body })
            }
          />
        </div>
      ) : null}
    </article>
  );
}

/** P27 client surface: the client's own requests with live status chips and
 * the client-visible thread. Internal team notes are filtered out upstream. */
export default function PortalRequestsHome() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const identity = useMemo(
    () =>
      resolveClientIdentity(
        workspace.shareLinks,
        workspace.contacts,
        workspace.organizations,
      ),
    [workspace.shareLinks, workspace.contacts, workspace.organizations],
  );
  const clientName = identity.organizationName ?? "Client portal";
  const userName = identity.contactName ?? "Client reviewer";
  const newHref = demoMode ? "/portal/requests/new?demo=1" : "/portal/requests/new";

  return (
    <PortalShell clientName={clientName} userName={userName}>
      <div className="mx-auto w-full max-w-3xl px-4 py-5" data-testid="portal-requests">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase text-[var(--dim)]">Requests</p>
            <h1 className="text-[22px] font-bold leading-tight text-[var(--ink)]">Your requests</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Ask for edits, cutdowns, resizes, captions, refreshes, or files — then follow the
              status here.
            </p>
          </div>
          <Link
            href={newHref}
            data-testid="new-request-link"
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
          >
            <Plus size={14} aria-hidden="true" />
            New request
          </Link>
        </div>

        {workspace.requests.length === 0 ? (
          <div
            data-testid="portal-requests-empty"
            className="grid min-h-[200px] place-items-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center"
          >
            <div className="max-w-xs">
              <h2 className="text-sm font-bold text-[var(--ink)]">No requests yet</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Record your first request and it will appear here with its live status.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2" data-testid="portal-requests-list">
            {workspace.requests.map((request) => (
              <OwnRequestCard
                key={request.id}
                request={request}
                expanded={expandedId === request.id}
                onToggle={() =>
                  setExpandedId((current) => (current === request.id ? null : request.id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
