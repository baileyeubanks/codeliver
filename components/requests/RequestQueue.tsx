"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Inbox } from "lucide-react";
import {
  acceptDemoRequest,
  addDemoRequestMessage,
  advanceDemoRequest,
  declineDemoRequest,
  useDemoWorkspace,
  type DemoRequest,
} from "@/lib/demo/workspace-store";
import {
  REQUEST_KIND_LABELS,
  REQUEST_KINDS,
  REQUEST_PRIORITIES,
  REQUEST_PRIORITY_LABELS,
  type RequestKind,
  type RequestPriority,
} from "@/lib/requests/model.ts";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/requests/lifecycle.ts";
import { filterQueueRows, queueRowsFrom, type QueueRow } from "@/lib/requests/views.ts";
import StatusChip from "./StatusChip";
import RequestThread from "./RequestThread";

const SELECT_CLASS =
  "min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)]";

function QueueRowButton({
  row,
  selected,
  onSelect,
}: {
  row: QueueRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`queue-row-${row.id}`}
      data-origin={row.origin}
      className={`block min-h-11 w-full rounded-[var(--radius-sm)] border px-3 py-2 text-left ${
        selected
          ? "border-[var(--accent)] bg-[var(--cvp-blue-tint)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-active)]"
      }`}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={row.status} />
        <span className="text-[10px] font-bold uppercase text-[var(--muted)]">
          {REQUEST_KIND_LABELS[row.kind]}
        </span>
        <span
          className={`text-[10px] font-bold uppercase ${
            row.priority === "rush" ? "text-[var(--red)]" : "text-[var(--dim)]"
          }`}
        >
          {REQUEST_PRIORITY_LABELS[row.priority]}
        </span>
        {row.origin === "library_cutdown" ? (
          <span
            data-testid="library-intake-badge"
            className="rounded-full bg-[var(--surface-2)] px-2 text-[10px] font-bold uppercase text-[var(--muted)]"
          >
            Library intake
          </span>
        ) : null}
      </span>
      <span className="mt-1 block truncate text-xs font-bold text-[var(--ink)]">{row.title}</span>
      <span className="mt-0.5 block text-[10px] text-[var(--dim)]">
        {row.requester}
        {row.dueDate ? ` · due ${row.dueDate}` : ""}
        {row.platform ? ` · ${row.platform}` : ""}
      </span>
    </button>
  );
}

function WorkOrderPanel({ request }: { request: DemoRequest }) {
  const workspace = useDemoWorkspace();
  const order = workspace.workOrders.find((candidate) => candidate.id === request.work_order_id);
  if (!order) return null;
  const projectName = order.project_id
    ? workspace.projects.find((project) => project.id === order.project_id)?.name
    : null;
  return (
    <section
      aria-label="Scoped work order"
      data-testid="work-order-panel"
      className="rounded-[var(--radius-sm)] border border-[var(--border-active)] bg-[var(--cvp-blue-tint)] px-3 py-2"
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink)]">
        <CheckCircle2 size={14} className="text-[var(--green)]" aria-hidden="true" />
        Work order created (local preview)
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">
        {order.scope_note} {projectName ? `Attached to ${projectName}.` : "Standalone work order."}{" "}
        Recorded in this demo workspace only — nothing was dispatched.
      </p>
      <ul className="mt-2 space-y-1">
        {order.deliverables.map((deliverable) => (
          <li
            key={deliverable.id}
            data-testid="work-order-deliverable"
            className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-2 py-1 text-[11px] font-bold text-[var(--ink)]"
          >
            {deliverable.title}
            {deliverable.platform ? ` · ${deliverable.platform}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestDetail({ request }: { request: DemoRequest }) {
  const workspace = useDemoWorkspace();
  const [accepting, setAccepting] = useState(false);
  const [target, setTarget] = useState("standalone");
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const messages = useMemo(
    () => workspace.requestMessages.filter((message) => message.request_id === request.id),
    [workspace.requestMessages, request.id],
  );

  const canTriage = request.status === "submitted" || request.status === "triaged";
  const nextAdvance: Partial<Record<RequestStatus, "in_progress" | "delivered" | "closed">> = {
    accepted: "in_progress",
    in_progress: "delivered",
    delivered: "closed",
  };
  const advanceTo = nextAdvance[request.status];

  function handleAccept() {
    const result = acceptDemoRequest(request.id, {
      projectId: target === "standalone" ? null : target,
    });
    if (!result.ok) {
      setActionError(result.reason ?? "The request could not be accepted.");
      return;
    }
    setActionError(null);
    setAccepting(false);
  }

  function handleDecline() {
    const result = declineDemoRequest(request.id, declineNote);
    if (!result.ok) {
      setActionError(result.reason ?? "The request could not be declined.");
      return;
    }
    setActionError(null);
    setDeclining(false);
    setDeclineNote("");
  }

  return (
    <div className="space-y-3" data-testid={`queue-detail-${request.id}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={request.status} />
        <span className="text-[10px] font-bold uppercase text-[var(--muted)]">
          {REQUEST_KIND_LABELS[request.kind]}
        </span>
        <span className="text-[10px] text-[var(--dim)]">
          {request.requester_name} · due {request.requested_due_date}
        </span>
      </div>
      <h2 className="text-sm font-bold text-[var(--ink)]">{request.title}</h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {request.source_asset_title ? (
          <>
            <dt className="font-bold uppercase text-[var(--dim)]">Source asset</dt>
            <dd className="text-[var(--ink)]">{request.source_asset_title}</dd>
          </>
        ) : null}
        {request.platform ? (
          <>
            <dt className="font-bold uppercase text-[var(--dim)]">Platform</dt>
            <dd className="text-[var(--ink)]">{request.platform}</dd>
          </>
        ) : null}
        {request.duration_seconds ? (
          <>
            <dt className="font-bold uppercase text-[var(--dim)]">Duration</dt>
            <dd className="text-[var(--ink)]">{request.duration_seconds}s</dd>
          </>
        ) : null}
        {request.aspect_ratios.length > 0 ? (
          <>
            <dt className="font-bold uppercase text-[var(--dim)]">Aspect ratios</dt>
            <dd className="text-[var(--ink)]">{request.aspect_ratios.join(", ")}</dd>
          </>
        ) : null}
        {request.asset_reference ? (
          <>
            <dt className="font-bold uppercase text-[var(--dim)]">Asset reference</dt>
            <dd className="text-[var(--ink)]">{request.asset_reference}</dd>
          </>
        ) : null}
        {request.notes ? (
          <>
            <dt className="font-bold uppercase text-[var(--dim)]">Notes</dt>
            <dd className="text-[var(--ink)]">{request.notes}</dd>
          </>
        ) : null}
      </dl>

      {request.status === "declined" && request.decline_note ? (
        <p className="rounded-[var(--radius-sm)] bg-[var(--red-dim)] px-3 py-2 text-xs text-[var(--red)]">
          Declined: {request.decline_note}
        </p>
      ) : null}

      {request.work_order_id ? <WorkOrderPanel request={request} /> : null}

      {actionError ? (
        <p role="alert" data-testid="triage-error" className="text-xs font-bold text-[var(--red)]">
          {actionError}
        </p>
      ) : null}

      {canTriage ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setAccepting((current) => !current);
                setDeclining(false);
              }}
              aria-expanded={accepting}
              data-testid="accept-button"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => {
                setDeclining((current) => !current);
                setAccepting(false);
              }}
              aria-expanded={declining}
              data-testid="decline-button"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-xs font-bold text-[var(--red)]"
            >
              Decline
            </button>
          </div>

          {accepting ? (
            <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase text-[var(--muted)]">
                Conversion target
                <select
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  data-testid="conversion-target"
                  className={`mt-1 w-full ${SELECT_CLASS}`}
                >
                  <option value="standalone">Standalone work order</option>
                  {workspace.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      Attach to project: {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleAccept}
                data-testid="create-work-order"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
              >
                Create work order
              </button>
            </div>
          ) : null}

          {declining ? (
            <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase text-[var(--muted)]">
                Note to the client (required)
                <textarea
                  value={declineNote}
                  onChange={(event) => setDeclineNote(event.target.value)}
                  rows={2}
                  data-testid="decline-note"
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs normal-case text-[var(--ink)]"
                />
              </label>
              <button
                type="button"
                onClick={handleDecline}
                data-testid="decline-submit"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--red)] px-3 text-xs font-bold text-[var(--red)]"
              >
                Confirm decline
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {advanceTo ? (
        <button
          type="button"
          onClick={() => advanceDemoRequest(request.id, advanceTo)}
          data-testid="advance-button"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--border-active)] px-3 text-xs font-bold text-[var(--accent)]"
        >
          {advanceTo === "in_progress"
            ? "Start work"
            : advanceTo === "delivered"
              ? "Mark delivered"
              : "Close request"}
        </button>
      ) : null}

      <RequestThread
        messages={messages}
        audience="team"
        onPost={({ body, visibility }) =>
          addDemoRequestMessage(request.id, { authorRole: "team", visibility, body })
        }
      />
    </div>
  );
}

/**
 * Internal request queue: every client request (typed intake + library
 * cutdown intake), filterable, with triage, conversion, and the thread.
 */
export default function RequestQueue() {
  const workspace = useDemoWorkspace();
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [kind, setKind] = useState<RequestKind | "all">("all");
  const [priority, setPriority] = useState<RequestPriority | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      filterQueueRows(
        queueRowsFrom({
          requests: workspace.requests,
          libraryCutdowns: workspace.libraryCutdownRequests,
        }),
        { status, kind, priority },
      ),
    [workspace.requests, workspace.libraryCutdownRequests, status, kind, priority],
  );

  const selectedRequest = selectedId
    ? workspace.requests.find((request) => request.id === selectedId)
    : null;
  const selectedRow = selectedId ? rows.find((row) => row.id === selectedId) : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6" data-testid="request-queue">
      <div className="mb-4 border-b border-[var(--border)] pb-4">
        <p className="mb-1 text-[10px] font-bold uppercase text-[var(--dim)]">Client intake</p>
        <h1 className="text-[22px] font-bold leading-tight text-[var(--ink)]">Request center</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Triage client requests, convert the accepted ones into scoped work orders, and keep the
          per-request conversation in one thread.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Queue filters">
        <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as RequestStatus | "all")}
            aria-label="Filter by status"
            data-testid="filter-status"
            className={`ml-1 ${SELECT_CLASS}`}
          >
            <option value="all">All</option>
            {REQUEST_STATUSES.map((option) => (
              <option key={option} value={option}>
                {REQUEST_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
          Kind
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as RequestKind | "all")}
            aria-label="Filter by kind"
            data-testid="filter-kind"
            className={`ml-1 ${SELECT_CLASS}`}
          >
            <option value="all">All</option>
            {REQUEST_KINDS.map((option) => (
              <option key={option} value={option}>
                {REQUEST_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as RequestPriority | "all")}
            aria-label="Filter by priority"
            data-testid="filter-priority"
            className={`ml-1 ${SELECT_CLASS}`}
          >
            <option value="all">All</option>
            {REQUEST_PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {REQUEST_PRIORITY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Request queue list" className="space-y-2">
          {rows.length === 0 ? (
            <div
              data-testid="queue-empty"
              className="grid min-h-[200px] place-items-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center"
            >
              <div className="max-w-xs">
                <Inbox size={20} className="mx-auto text-[var(--accent)]" aria-hidden="true" />
                <h2 className="mt-3 text-sm font-bold text-[var(--ink)]">No matching requests</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Adjust the filters, or wait for the client to record a request from their portal.
                </p>
              </div>
            </div>
          ) : (
            rows.map((row) => (
              <QueueRowButton
                key={row.id}
                row={row}
                selected={row.id === selectedId}
                onSelect={() => setSelectedId(row.id)}
              />
            ))
          )}
        </section>

        <section
          aria-label="Request detail"
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
        >
          {selectedRequest ? (
            <RequestDetail request={selectedRequest} />
          ) : selectedRow?.origin === "library_cutdown" ? (
            <div data-testid="queue-detail-library">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip status="submitted" />
                <span className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  Social cutdown
                </span>
                <span
                  data-testid="library-intake-badge"
                  className="rounded-full bg-[var(--surface-2)] px-2 text-[10px] font-bold uppercase text-[var(--muted)]"
                >
                  Library intake
                </span>
              </div>
              <h2 className="mt-2 text-sm font-bold text-[var(--ink)]">{selectedRow.title}</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Recorded from the asset library cutdown dialog (local preview). Typed triage and
                work-order conversion are available for requests submitted through the request
                form; this intake row is reference-only.
              </p>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]" data-testid="queue-detail-empty">
              Select a request to triage it, convert it, or open the thread.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
