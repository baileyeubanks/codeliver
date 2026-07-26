import {
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Link2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { formatMoney, type ProjectRecap } from "@/lib/reporting/recap.ts";

function statusBadgeClass(status: string): string {
  if (status === "delivered" || status === "approved" || status === "done" || status === "paid") {
    return "badge badge-approved";
  }
  if (status === "pending") return "badge badge-working";
  return "badge badge-in-review";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * P28: presentational project recap. All numbers come from buildProjectRecap
 * over the workspace record — nothing is invented here. The budget block is
 * internal-only (standing rule: margin is never client-visible).
 */
export default function RecapPanel({
  recap,
  onPrint,
}: {
  recap: ProjectRecap;
  onPrint: () => void;
}) {
  return (
    <div className="flex flex-col gap-5" data-testid="recap-panel">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">
          Rolled up from the project record — deliverables, plan, approvals, and payments.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--dim)]">Open print dialog to save as PDF.</span>
          <button
            type="button"
            onClick={onPrint}
            data-testid="print-recap"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)]"
          >
            <Printer size={15} />
            Print recap
          </button>
        </div>
      </div>

      <section aria-label="Deliverables" data-testid="recap-deliverables"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <FileCheck2 size={16} className="text-[var(--accent)]" />
            Deliverables
          </h2>
          <strong className="text-sm text-[var(--ink)]" data-testid="recap-deliverables-count">
            {recap.deliverables.completed} of {recap.deliverables.total} delivered
          </strong>
        </header>
        {recap.deliverables.items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No deliverables on record for this project yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {recap.deliverables.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--ink)]">{item.name}</span>
                  <span className="block text-xs text-[var(--muted)]">{item.specLabel}</span>
                </span>
                <span className="flex items-center gap-2">
                  {item.deliveredAt ? (
                    <span className="text-xs text-[var(--muted)]">{dateLabel(item.deliveredAt)}</span>
                  ) : null}
                  <span className={statusBadgeClass(item.status)}>{statusLabel(item.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Milestone timeline" data-testid="recap-timeline"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <CalendarCheck2 size={16} className="text-[var(--accent)]" />
          Milestone timeline
        </h2>
        {recap.timeline.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No milestones or dated tasks on the plan yet.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <caption className="sr-only">
                Planned versus actual dates for project milestones and dated tasks
              </caption>
              <thead>
                <tr>
                  <th scope="col">Milestone</th>
                  <th scope="col">Planned</th>
                  <th scope="col">Actual</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {recap.timeline.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Milestone" className="text-sm">{entry.title}</td>
                    <td data-label="Planned" className="text-xs">{entry.plannedDate ?? "—"}</td>
                    <td data-label="Actual" className="text-xs">{entry.actualDate ?? "—"}</td>
                    <td data-label="Status">
                      {entry.onTime === null ? (
                        <span className={statusBadgeClass(entry.status)}>{statusLabel(entry.status)}</span>
                      ) : entry.onTime ? (
                        <span className="badge badge-approved">
                          <CheckCircle2 size={10} className="mr-1" /> on time
                        </span>
                      ) : (
                        <span className="badge badge-in-review">
                          <Clock3 size={10} className="mr-1" /> slipped
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Approvals history" data-testid="recap-approvals"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <ShieldCheck size={16} className="text-[var(--accent)]" />
          Approvals history
        </h2>
        {recap.approvals.length === 0 && recap.approvalEvents.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No approval activity on record yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {recap.approvals.length > 0 ? (
              <ul className="divide-y divide-[var(--border)]">
                {recap.approvals.map((stage) => (
                  <li key={stage.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--ink)]">
                        {stage.name}
                        {stage.assetTitle ? ` — ${stage.assetTitle}` : ""}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">
                        {stage.approvedCount} of {stage.reviewerCount} reviewers approved
                        {stage.approvedNames.length > 0 ? ` (${stage.approvedNames.join(", ")})` : ""}
                      </span>
                    </span>
                    <span className={statusBadgeClass(stage.status)}>{statusLabel(stage.status)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {recap.approvalEvents.map((event) => (
              <p key={event.id} className="text-xs text-[var(--muted)]">
                <strong className="text-[var(--ink)]">{event.actor}</strong> approved
                {event.detail ? ` ${event.detail}` : " an asset"} · {dateLabel(event.at)}
              </p>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Budget summary (internal only)" data-testid="recap-budget"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <CircleDollarSign size={16} className="text-[var(--accent)]" />
            Budget summary
          </h2>
          <span className="badge badge-working" data-testid="recap-budget-internal">
            Internal only — never client-facing
          </span>
        </header>
        {recap.budget.proposalTitle === null ? (
          <p className="text-sm text-[var(--muted)]">No proposal on record for this project yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--muted)]">
              {recap.budget.proposalTitle} (v{recap.budget.proposalVersion})
              {recap.budget.approvedAt ? ` · approved ${dateLabel(recap.budget.approvedAt)}` : ""}
            </p>
            <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Estimated cost", value: formatMoney(recap.budget.costCents), testid: "budget-cost" },
                { label: "Internal markup", value: formatMoney(recap.budget.marginCents), testid: "budget-margin" },
                { label: "Client total", value: formatMoney(recap.budget.totalCents), testid: "budget-total" },
                { label: "Outstanding", value: formatMoney(recap.budget.outstandingCents), testid: "budget-outstanding" },
              ].map((item) => (
                <div key={item.label}
                  className="rounded-md border border-[var(--border)] px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim)]">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold text-[var(--ink)]" data-testid={item.testid}>
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="divide-y divide-[var(--border)]">
              {recap.budget.milestones.map((milestone) => (
                <li key={milestone.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-sm text-[var(--ink)]">{milestone.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--ink)]">
                      {formatMoney(milestone.amountCents)}
                    </span>
                    <span className={statusBadgeClass(milestone.status)}>
                      {milestone.status === "paid" && milestone.paidAt
                        ? `paid ${dateLabel(milestone.paidAt)}`
                        : statusLabel(milestone.status)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {recap.budget.optionalCents > 0 ? (
              <p className="text-xs text-[var(--muted)]">
                Optional scope not yet approved: {formatMoney(recap.budget.optionalCents)}.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section aria-label="Final delivery links" data-testid="recap-links"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <Link2 size={16} className="text-[var(--accent)]" />
          Final delivery links
        </h2>
        {recap.finalLinks.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No active review links for this project.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {recap.finalLinks.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--ink)]">{link.message}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{link.url}</span>
                </span>
                <span className="badge badge-working">{link.permission}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
