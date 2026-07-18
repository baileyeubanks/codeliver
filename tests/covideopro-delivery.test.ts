import assert from "node:assert/strict";
import test from "node:test";
import { qcChecklistFor, qcProgress } from "../lib/covideopro/qc.ts";
import { buildDeliveryManifest } from "../lib/covideopro/manifest.ts";
import type { Deliverable } from "../lib/covideopro/record.ts";

function deliverable(overrides: Partial<Deliverable> = {}): Deliverable {
  return {
    id: "d1", project_id: "p", name: "MASTER_16x9.mov",
    spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9", captions: true, audio: "stereo 48kHz", watermark: false },
    source_version_id: "v1", status: "qc", qc_checks: [], qc_notes: "", delivered_at: null,
    created_at: "", updated_at: "", created_by: "u",
    ...overrides,
  };
}

test("the checklist derives from the spec — captions and watermark gates only when specced", () => {
  const withCaptions = qcChecklistFor(deliverable());
  assert.deepEqual(withCaptions.map((check) => check.id), ["spec-lock", "resolution", "codec", "aspect", "captions", "audio", "playthrough"]);

  const lean = qcChecklistFor(deliverable({ spec: { resolution: "1080x1920", codec: "H.264", aspect: "9:16", captions: false, audio: "stereo 48kHz", watermark: false } }));
  assert.deepEqual(lean.map((check) => check.id), ["spec-lock", "resolution", "codec", "aspect", "audio", "playthrough"]);

  const watermarked = qcChecklistFor(deliverable({ spec: { resolution: "1920x1080", codec: "H.264", aspect: "16:9", captions: false, audio: "stereo", watermark: true } }));
  assert.ok(watermarked.some((check) => check.id === "watermark"));
});

test("progress counts only checklist ids and completes when every gate passes", () => {
  const item = deliverable({ qc_checks: ["resolution", "bogus-id"] });
  assert.deepEqual(qcProgress(item), { total: 7, passed: 1, complete: false });

  const cleared = deliverable({ qc_checks: qcChecklistFor(item).map((check) => check.id) });
  assert.deepEqual(qcProgress(cleared), { total: 7, passed: 7, complete: true });
});

test("the manifest proves spec, conveyor state, and QC per deliverable", () => {
  const manifest = buildDeliveryManifest({
    projectName: "ICA",
    generatedAt: "2026-07-17T18:00:00.000Z",
    deliverables: [
      deliverable({ id: "d1", name: "ICA_MASTER.mov", status: "delivered", delivered_at: "2026-03-09T19:30:00.000Z", qc_checks: qcChecklistFor(deliverable()).map((check) => check.id) }),
      deliverable({ id: "d2", name: "ICA_SOCIAL.mp4", status: "qc", qc_checks: ["resolution"] }),
    ],
  });
  assert.match(manifest, /DELIVERY MANIFEST — ICA/);
  assert.match(manifest, /ICA_MASTER\.mov/);
  assert.match(manifest, /Status: DELIVERED/);
  assert.match(manifest, /QC: 7\/7 checks passed — CLEAR/);
  assert.match(manifest, /QC: 1\/7 checks passed — INCOMPLETE/);
  assert.match(manifest, /Delivered: 2026-03-09T19:30:00\.000Z/);
});
