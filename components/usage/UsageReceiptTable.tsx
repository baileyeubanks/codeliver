import { CheckCircle2, Clock3, ReceiptText, RotateCcw, XCircle } from "lucide-react";
import type { UsageReceipt } from "@/lib/metering";

interface UsageReceiptTableProps {
  receipts: readonly UsageReceipt[];
}

function statusIcon(receipt: UsageReceipt) {
  if (receipt.kind === "commit" && receipt.committedCoUnits > 0) {
    return <CheckCircle2 size={15} className="text-[var(--green)]" aria-hidden="true" />;
  }
  if (receipt.kind === "reservation") {
    return <Clock3 size={15} className="text-[var(--accent)]" aria-hidden="true" />;
  }
  if (receipt.kind === "release" || receipt.kind === "expiration") {
    return <RotateCcw size={15} className="text-[var(--yellow)]" aria-hidden="true" />;
  }
  return <XCircle size={15} className="text-[var(--muted)]" aria-hidden="true" />;
}

export function UsageReceiptTable({ receipts }: UsageReceiptTableProps) {
  return (
    <section aria-label="Usage receipts" className="overflow-hidden border border-[var(--border)] bg-[var(--surface)]" style={{ borderRadius: "var(--radius-sm)" }}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <ReceiptText size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[var(--ink)]">Usage receipts</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] uppercase text-[var(--dim)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Operation</th>
              <th className="px-3 py-2.5 font-medium">Committed</th>
              <th className="px-3 py-2.5 font-medium">Provider cost</th>
              <th className="px-3 py-2.5 font-medium">Rate version</th>
              <th className="px-4 py-2.5 text-right font-medium">Occurred</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No usage receipts
                </td>
              </tr>
            ) : (
              receipts.map((receipt) => (
                <tr key={receipt.id} className="text-[var(--muted)]">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-[var(--ink)]">
                      {statusIcon(receipt)}
                      {receipt.outcome.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 capitalize">{receipt.operation.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 font-medium text-[var(--ink)]">
                    {receipt.committedCoUnits.toLocaleString()} CU
                  </td>
                  <td className="px-3 py-3">
                    {receipt.providerCost
                      ? `${(receipt.providerCost.calculatedCostMicros / 1_000_000).toFixed(4)} ${receipt.providerCost.currency}`
                      : "-"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px]">{receipt.rateVersion}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {new Date(receipt.occurredAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
