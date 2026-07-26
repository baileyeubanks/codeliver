/**
 * Co‑ProVideo — delivery QC checklist (T12).
 *
 * QC is a gate, not a suggestion: a deliverable cannot leave QC until every
 * check on its spec-derived checklist has passed. The checklist is derived
 * deterministically from the frozen spec — captions and watermark gates only
 * exist when the spec calls for them. Passed check ids live on the
 * deliverable (`qc_checks`), so the manifest can prove what was verified.
 */

import type { Deliverable } from "./record.ts";

export interface QcCheck {
  id: string;
  label: string;
}

export function qcChecklistFor(deliverable: Pick<Deliverable, "spec">): QcCheck[] {
  const checks: QcCheck[] = [
    { id: "spec-lock", label: "Spec frozen to the source version" },
    { id: "resolution", label: `Resolution matches ${deliverable.spec.resolution}` },
    { id: "codec", label: `Codec matches ${deliverable.spec.codec}` },
    { id: "aspect", label: `Frame matches ${deliverable.spec.aspect}` },
  ];
  if (deliverable.spec.captions) {
    checks.push({ id: "captions", label: "Captions present and inside the safe area" });
  }
  checks.push({ id: "audio", label: `Audio conforms — ${deliverable.spec.audio}` });
  if (deliverable.spec.watermark) {
    checks.push({ id: "watermark", label: "Watermark applied per the project rule" });
  }
  checks.push({ id: "playthrough", label: "Plays start to end — no dead pixels, no render errors" });
  return checks;
}

export interface QcProgress {
  total: number;
  passed: number;
  complete: boolean;
}

export function qcProgress(deliverable: Pick<Deliverable, "spec" | "qc_checks">): QcProgress {
  const checklist = qcChecklistFor(deliverable);
  const passed = checklist.filter((check) => deliverable.qc_checks.includes(check.id)).length;
  return { total: checklist.length, passed, complete: passed === checklist.length };
}
