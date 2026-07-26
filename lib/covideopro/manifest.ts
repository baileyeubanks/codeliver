/**
 * Co‑ProVideo — delivery manifest (T12).
 *
 * The manifest is the shipment's truth on paper: every deliverable with its
 * frozen spec, conveyor state, QC proof, and delivery timestamp. Generated
 * deterministically from the record — printable, copyable, never stored.
 */

import type { Deliverable } from "./record.ts";
import { qcProgress } from "./qc.ts";

export function buildDeliveryManifest(input: {
  projectName: string;
  deliverables: readonly Deliverable[];
  generatedAt: string;
}): string {
  const lines: string[] = [
    `DELIVERY MANIFEST — ${input.projectName}`,
    `Generated ${input.generatedAt} · ${input.deliverables.length} deliverable${input.deliverables.length === 1 ? "" : "s"}`,
    "",
  ];

  for (const [index, deliverable] of input.deliverables.entries()) {
    const qc = qcProgress(deliverable);
    lines.push(`${index + 1}. ${deliverable.name}`);
    lines.push(`   Status: ${deliverable.status.toUpperCase()}`);
    lines.push(`   Spec: ${deliverable.spec.resolution} · ${deliverable.spec.codec} · ${deliverable.spec.aspect}${deliverable.spec.captions ? " · captioned" : ""}${deliverable.spec.watermark ? " · watermarked" : ""} · ${deliverable.spec.audio}`);
    lines.push(`   QC: ${qc.passed}/${qc.total} checks passed${qc.complete ? " — CLEAR" : " — INCOMPLETE"}`);
    if (deliverable.qc_notes) lines.push(`   QC notes: ${deliverable.qc_notes}`);
    if (deliverable.delivered_at) lines.push(`   Delivered: ${deliverable.delivered_at}`);
    lines.push("");
  }

  lines.push("Generated from the Project Operating Record — Co‑ProVideo by Content Co-op.");
  return lines.join("\n");
}
