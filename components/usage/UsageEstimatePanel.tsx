import { CircleAlert, Coins, LockKeyhole, Sparkles } from "lucide-react";
import type { UsageQuote } from "@/lib/metering";

interface UsageEstimatePanelProps {
  quote: UsageQuote;
}

function formatCredits(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 3,
    maximumFractionDigits: 3,
  });
}

export function UsageEstimatePanel({ quote }: UsageEstimatePanelProps) {
  const isFree = quote.meterClass === "free_collaboration";
  const separateMeter = quote.meterClass === "storage" || quote.meterClass === "egress";

  return (
    <section
      aria-label="Usage estimate"
      className="border border-[var(--border)] bg-[var(--surface)] p-4"
      style={{ borderRadius: "var(--radius-sm)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            {isFree ? (
              <LockKeyhole size={16} className="text-[var(--green)]" aria-hidden="true" />
            ) : (
              <Sparkles size={16} className="text-[var(--accent)]" aria-hidden="true" />
            )}
            <span>{isFree ? "Free collaboration" : quote.operation.replaceAll("_", " ")}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">{quote.assumptions.at(-1)}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-sm font-semibold text-[var(--ink)]">
            <Coins size={15} className="text-[var(--accent)]" aria-hidden="true" />
            {isFree || separateMeter
              ? "0 Co-Credits"
              : `${formatCredits(quote.coCredits.likely)} Co-Credits`}
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">{quote.rateVersion}</p>
        </div>
      </div>

      {!isFree && !separateMeter && (
        <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border)] border-y border-[var(--border)]">
          {([
            ["Minimum", quote.coUnits.min],
            ["Likely", quote.coUnits.likely],
            ["Maximum", quote.coUnits.max],
          ] as const).map(([label, units]) => (
            <div key={label} className="min-w-0 px-3 py-2 first:pl-0 last:pr-0">
              <p className="text-[11px] font-medium uppercase text-[var(--dim)]">{label}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                {units.toLocaleString()} CU
              </p>
            </div>
          ))}
        </div>
      )}

      {quote.overage.required && (
        <div
          className="mt-3 flex items-start gap-2 border-l-2 border-[var(--yellow)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]"
          role="status"
        >
          <CircleAlert size={15} className="mt-0.5 shrink-0 text-[var(--yellow)]" aria-hidden="true" />
          <span>
            {quote.overage.allowedAtQuoteTime
              ? `Maximum estimate uses ${quote.overage.additionalCoUnits.toLocaleString()} approved overage CU.`
              : "Maximum estimate exceeds the current confirmed budget. Overage remains off until an owner records consent."}
          </span>
        </div>
      )}

      {separateMeter && (
        <p className="mt-3 border-l-2 border-[var(--border)] pl-3 text-xs text-[var(--muted)]">
          Storage and egress are tracked separately and never drain AI Co-Credits.
        </p>
      )}
    </section>
  );
}
