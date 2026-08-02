import { AlertTriangle, Gauge, ShieldCheck } from "lucide-react";
import type { BudgetUsageSnapshot } from "@/lib/metering";

interface BudgetStatusProps {
  title: string;
  snapshot: BudgetUsageSnapshot;
}

function tone(utilizationBasisPoints: number) {
  if (utilizationBasisPoints >= 10_000) return "text-[var(--red)] bg-[var(--red)]";
  if (utilizationBasisPoints >= 8_000) return "text-[var(--yellow)] bg-[var(--yellow)]";
  return "text-[var(--green)] bg-[var(--green)]";
}

export function BudgetStatus({ title, snapshot }: BudgetStatusProps) {
  const utilization = Math.min(10_000, snapshot.utilizationBasisPoints);
  const percentage = Math.min(100, Math.round(utilization / 100));
  const isLimited = snapshot.remainingEffectiveCoUnits === 0;
  const stateTone = tone(snapshot.utilizationBasisPoints);

  return (
    <section
      aria-label={`${title} budget`}
      className="border border-[var(--border)] bg-[var(--surface)] p-4"
      style={{ borderRadius: "var(--radius-sm)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {isLimited ? (
            <AlertTriangle size={16} className="shrink-0 text-[var(--red)]" aria-hidden="true" />
          ) : (
            <Gauge size={16} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
          )}
          <h3 className="truncate text-sm font-semibold text-[var(--ink)]">{title}</h3>
        </div>
        <span className={`text-xs font-semibold ${stateTone.split(" ")[0]}`}>{percentage}%</span>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden bg-[var(--surface-2)]"
        style={{ borderRadius: "var(--radius-sm)" }}
        aria-label={`${percentage}% of included budget used`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className={`h-full ${stateTone.split(" ")[1]}`}
          style={{ width: `${percentage}%`, transition: "width 160ms ease" }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-[var(--dim)]">Available</dt>
          <dd className="mt-0.5 font-semibold text-[var(--ink)]">
            {snapshot.remainingEffectiveCoUnits.toLocaleString()} CU
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dim)]">Reserved</dt>
          <dd className="mt-0.5 font-semibold text-[var(--ink)]">
            {snapshot.reservedCoUnits.toLocaleString()} CU
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dim)]">Committed</dt>
          <dd className="mt-0.5 font-semibold text-[var(--ink)]">
            {snapshot.committedCoUnits.toLocaleString()} CU
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dim)]">Policy</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-medium text-[var(--muted)]">
            <ShieldCheck size={13} aria-hidden="true" />
            {snapshot.budget.overageConsent ? "Capped overage" : "Overage off"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
