import { REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/requests/lifecycle.ts";

const STATUS_STYLES: Record<RequestStatus, string> = {
  submitted: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
  triaged: "border-[var(--border-active)] bg-[var(--cvp-blue-tint)] text-[var(--accent)]",
  accepted: "border-[var(--border-active)] bg-[var(--accent-dim)] text-[var(--accent)]",
  declined: "border-transparent bg-[var(--red-dim)] text-[var(--red)]",
  in_progress: "border-[var(--border-active)] bg-[var(--cvp-blue-tint)] text-[var(--ink)]",
  delivered: "border-transparent bg-[var(--accent-dim)] text-[var(--green)]",
  closed: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--dim)]",
};

export default function StatusChip({ status }: { status: RequestStatus }) {
  return (
    <span
      data-testid={`status-chip-${status}`}
      className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[10px] font-bold uppercase ${STATUS_STYLES[status]}`}
    >
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
