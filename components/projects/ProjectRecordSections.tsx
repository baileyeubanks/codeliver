"use client";

import { useMemo, useState } from "react";
import { Check, FileText, Flag, Lightbulb, ListChecks, PackageCheck, Plus, X } from "lucide-react";
import {
  addPlanItem,
  addRevisionRequest,
  addSelect,
  createMilestoneCheckout,
  createSequenceFromSelects,
  dispatchNotificationOutbox,
  generateCallSheet,
  recordMilestonePayment,
  renderSequenceToAsset,
  saveBrief,
  saveDeliverable,
  saveProposal,
  setBriefStatus,
  setDeliverableStatus,
  setLocationAgreementStatus,
  setPlanItemStatus,
  setProductionDayStatus,
  setProposalStatus,
  setReleaseStatus,
  setRevisionRequestStatus,
  setSequenceStatus,
  updateSelectRange,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { seedTranscriptSegments } from "@/lib/demo/record-seed";
import { formatCents } from "@/lib/covideopro/payments.ts";
import { proposeRadioCut } from "@/lib/covideopro/reasoning.ts";
import { captionsFilename, segmentsToSrt, segmentsToVtt } from "@/lib/covideopro/captions.ts";
import SequenceTimeline from "@/components/projects/SequenceTimeline";
import {
  currentBrief,
  currentProposal,
  estimateLineTotal,
  proposalEstimateTotal,
  type EstimateCategory,
  type PlanItem,
} from "@/lib/covideopro/record.ts";

interface SectionProps {
  projectId: string;
  demoMode: boolean;
  onNotice: (message: string) => void;
}

function SectionEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state" style={{ minHeight: 160 }}>
      <div className="empty-state-icon"><FileText size={20} /></div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-text">{body}</p>
    </div>
  );
}

/* ------------------------------- Creative ---------------------------------- */

export function CreativeSection({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();
  const briefs = useMemo(
    () => workspace.briefs.filter((brief) => brief.project_id === projectId).sort((a, b) => b.version - a.version),
    [workspace.briefs, projectId],
  );
  const brief = currentBrief(briefs);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ objectives: "", audience: "", message: "", references: "", deliverables: "" });

  if (!demoMode) return <SectionEmpty title="Creative brief" body="Briefs are available in the local workspace." />;

  function startEdit() {
    setForm({
      objectives: brief?.objectives ?? "",
      audience: brief?.audience ?? "",
      message: brief?.message ?? "",
      references: brief?.references.join("\n") ?? "",
      deliverables: brief?.deliverables_notes ?? "",
    });
    setEditing(true);
  }

  function save() {
    const result = saveBrief({
      projectId,
      objectives: form.objectives,
      audience: form.audience,
      message: form.message,
      references: form.references.split("\n").map((line) => line.trim()).filter(Boolean),
      deliverablesNotes: form.deliverables,
    });
    if (!result.ok) {
      onNotice(result.reason);
      return;
    }
    setEditing(false);
    onNotice(brief ? `Brief v${brief.version + 1} drafted.` : "Brief v1 drafted.");
  }

  function transition(to: "in_review" | "approved" | "draft") {
    if (!brief) return;
    const result = setBriefStatus(brief.id, to);
    onNotice(result.ok ? `Brief ${to.replace("_", " ")}.` : result.reason);
  }

  return (
    <>
      <header>
        <div>
          <h2>Creative brief</h2>
          <p>Objectives, audience, and message — versioned, reviewable, and tied to the project record.</p>
        </div>
        {!editing ? (
          <button type="button" onClick={startEdit}><Lightbulb size={16} /> {brief ? "Revise brief" : "Draft brief"}</button>
        ) : null}
      </header>

      {editing ? (
        <section className="cockpit-record-form" aria-label="Brief editor">
          <label>Objectives
            <textarea className="input" rows={3} value={form.objectives} onChange={(event) => setForm((current) => ({ ...current, objectives: event.target.value }))} placeholder="What must this production achieve?" />
          </label>
          <div className="cockpit-record-form-grid">
            <label>Audience
              <textarea className="input" rows={2} value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} placeholder="Who is it for?" />
            </label>
            <label>Core message
              <textarea className="input" rows={2} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="The one thing it must say" />
            </label>
          </div>
          <label>References (one per line)
            <textarea className="input" rows={2} value={form.references} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} />
          </label>
          <label>Deliverables notes
            <textarea className="input" rows={2} value={form.deliverables} onChange={(event) => setForm((current) => ({ ...current, deliverables: event.target.value }))} />
          </label>
          <div className="cockpit-record-form-actions">
            <button type="button" onClick={save}><Check size={15} /> Save {brief ? `as v${brief.version + 1}` : "v1"}</button>
            <button type="button" onClick={() => setEditing(false)}><X size={15} /> Cancel</button>
          </div>
        </section>
      ) : brief ? (
        <section className="cockpit-record-card" aria-label="Current brief">
          <header className="cockpit-record-card-head">
            <strong>v{brief.version}</strong>
            <span className="demo-pill">{brief.status.replace("_", " ")}</span>
            <span className="cockpit-record-actions">
              {brief.status === "draft" ? <button type="button" onClick={() => transition("in_review")}>Submit for review</button> : null}
              {brief.status === "in_review" ? (
                <>
                  <button type="button" onClick={() => transition("approved")}>Approve brief</button>
                  <button type="button" onClick={() => transition("draft")}>Back to draft</button>
                </>
              ) : null}
            </span>
          </header>
          <dl className="cockpit-record-dl">
            <div><dt>Objectives</dt><dd>{brief.objectives || "—"}</dd></div>
            <div><dt>Audience</dt><dd>{brief.audience || "—"}</dd></div>
            <div><dt>Message</dt><dd>{brief.message || "—"}</dd></div>
            {brief.references.length > 0 ? <div><dt>References</dt><dd>{brief.references.join(" · ")}</dd></div> : null}
            {brief.deliverables_notes ? <div><dt>Deliverables</dt><dd>{brief.deliverables_notes}</dd></div> : null}
          </dl>
          {briefs.length > 1 ? (
            <p className="cockpit-rail-empty">
              History: {briefs.map((candidate) => `v${candidate.version} (${candidate.status.replace("_", " ")})`).join(" → ")}
            </p>
          ) : null}
        </section>
      ) : (
        <SectionEmpty title="No brief yet" body="Draft the creative brief to anchor development — objectives, audience, and message in one versioned record." />
      )}
    </>
  );
}

/* ------------------------------- Proposal ---------------------------------- */

const ESTIMATE_CATEGORIES: EstimateCategory[] = ["crew", "equipment", "travel", "post", "deliverable", "other"];

export function ProposalSection({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();
  const proposals = useMemo(
    () => workspace.proposals.filter((proposal) => proposal.project_id === projectId).sort((a, b) => b.version - a.version),
    [workspace.proposals, projectId],
  );
  const proposal = currentProposal(proposals);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: "", narrative: "" });
  const [lineForm, setLineForm] = useState({ category: "crew" as EstimateCategory, description: "", quantity: "1", unitRate: "", markup: "0", optional: false });

  if (!demoMode) return <SectionEmpty title="Proposal" body="Proposals are available in the local workspace." />;

  const draftLines = proposal?.estimate_lines ?? [];
  const requiredTotal = proposalEstimateTotal(draftLines);
  const optionalTotal = proposalEstimateTotal(draftLines.filter((line) => line.optional));

  function startEdit() {
    setForm({ title: proposal?.title ?? "", narrative: proposal?.narrative ?? "" });
    setEditing(true);
  }

  function save() {
    const result = saveProposal({
      projectId,
      title: form.title,
      narrative: form.narrative,
      estimateLines: proposal?.estimate_lines ?? [],
      validUntil: proposal?.valid_until,
    });
    if (!result.ok) {
      onNotice(result.reason);
      return;
    }
    setEditing(false);
    onNotice(proposal ? `Proposal v${proposal.version + 1} drafted.` : "Proposal v1 drafted.");
  }

  function addLine() {
    if (!proposal) {
      onNotice("Draft the proposal first, then add estimate lines.");
      return;
    }
    const quantity = Number(lineForm.quantity);
    const unitRate = Number(lineForm.unitRate);
    const markup = Number(lineForm.markup);
    if (!lineForm.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitRate) || unitRate < 0) {
      onNotice("Estimate line needs a description, positive quantity, and a non-negative rate.");
      return;
    }
    const result = saveProposal({
      projectId,
      title: proposal.title,
      narrative: proposal.narrative,
      estimateLines: [
        ...proposal.estimate_lines,
        { id: `el-${Date.now()}`, category: lineForm.category, description: lineForm.description.trim(), quantity, unit_rate: unitRate, markup_pct: Number.isFinite(markup) ? markup : 0, optional: lineForm.optional },
      ],
      validUntil: proposal.valid_until,
    });
    if (!result.ok) {
      onNotice(result.reason);
      return;
    }
    setLineForm({ category: "crew", description: "", quantity: "1", unitRate: "", markup: "0", optional: false });
    onNotice("Estimate line added (new proposal version).");
  }

  function transition(to: "in_review" | "sent" | "approved") {
    if (!proposal) return;
    const project = workspace.projects.find((candidate) => candidate.id === projectId);
    const contact = workspace.contacts.find((candidate) => candidate.organization_id === project?.organization_id && candidate.is_primary);
    const result = setProposalStatus(proposal.id, to, to === "approved" ? contact?.email ?? "" : undefined);
    onNotice(result.ok ? `Proposal ${to.replace("_", " ")}.` : result.reason);
  }

  return (
    <>
      <header>
        <div>
          <h2>Proposal & estimate</h2>
          <p>Versioned commercial scope. Approval advances the project to pre-production.</p>
        </div>
        {!editing ? (
          <button type="button" onClick={startEdit}><FileText size={16} /> {proposal ? "Revise proposal" : "Draft proposal"}</button>
        ) : null}
      </header>

      {editing ? (
        <section className="cockpit-record-form" aria-label="Proposal editor">
          <label>Title
            <input className="input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Roadshow 2026 — Opening Film Package" />
          </label>
          <label>Narrative
            <textarea className="input" rows={4} value={form.narrative} onChange={(event) => setForm((current) => ({ ...current, narrative: event.target.value }))} placeholder="Scope, approach, what's included, assumptions…" />
          </label>
          <div className="cockpit-record-form-actions">
            <button type="button" onClick={save}><Check size={15} /> Save version</button>
            <button type="button" onClick={() => setEditing(false)}><X size={15} /> Cancel</button>
          </div>
        </section>
      ) : proposal ? (
        <section className="cockpit-record-card" aria-label="Current proposal">
          <header className="cockpit-record-card-head">
            <strong>v{proposal.version} — {proposal.title}</strong>
            <span className="demo-pill">{proposal.status.replace("_", " ")}</span>
            <span className="cockpit-record-actions">
              {proposal.status === "draft" ? <button type="button" onClick={() => transition("in_review")}>Send to internal review</button> : null}
              {proposal.status === "in_review" ? <button type="button" onClick={() => transition("sent")}>Mark sent to client</button> : null}
              {proposal.status === "sent" ? <button type="button" onClick={() => transition("approved")}>Record client approval</button> : null}
            </span>
          </header>
          {proposal.narrative ? <p className="cockpit-record-narrative">{proposal.narrative}</p> : null}

          <table className="cockpit-record-table">
            <thead>
              <tr><th>Category</th><th>Description</th><th>Qty</th><th>Rate</th><th>Markup</th><th>Total</th></tr>
            </thead>
            <tbody>
              {proposal.estimate_lines.map((line) => (
                <tr key={line.id} data-optional={line.optional || undefined}>
                  <td>{line.category}</td>
                  <td>{line.description}{line.optional ? " (optional)" : ""}</td>
                  <td>{line.quantity}</td>
                  <td>${line.unit_rate.toLocaleString()}</td>
                  <td>{line.markup_pct}%</td>
                  <td>${estimateLineTotal(line).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>Required total</td><td>${requiredTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td></tr>
              {optionalTotal > 0 ? <tr><td colSpan={5}>Optional add-ons</td><td>${optionalTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td></tr> : null}
            </tfoot>
          </table>

          {proposal.approved_by ? (
            <>
              <p className="cockpit-rail-empty">Approved by {proposal.approved_by} on {proposal.approved_at ? new Date(proposal.approved_at).toLocaleDateString() : "—"}.</p>
              <MilestonesBlock proposalId={proposal.id} onNotice={onNotice} />
            </>
          ) : null}

          {proposal.status === "draft" ? (
            <form className="cockpit-record-form" aria-label="Add estimate line" onSubmit={(event) => { event.preventDefault(); addLine(); }}>
              <div className="cockpit-record-form-grid five">
                <select className="input" value={lineForm.category} onChange={(event) => setLineForm((current) => ({ ...current, category: event.target.value as EstimateCategory }))} aria-label="Category">
                  {ESTIMATE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <input className="input" placeholder="Description" value={lineForm.description} onChange={(event) => setLineForm((current) => ({ ...current, description: event.target.value }))} aria-label="Description" />
                <input className="input" placeholder="Qty" inputMode="numeric" value={lineForm.quantity} onChange={(event) => setLineForm((current) => ({ ...current, quantity: event.target.value }))} aria-label="Quantity" />
                <input className="input" placeholder="Rate $" inputMode="decimal" value={lineForm.unitRate} onChange={(event) => setLineForm((current) => ({ ...current, unitRate: event.target.value }))} aria-label="Unit rate" />
                <input className="input" placeholder="Markup %" inputMode="numeric" value={lineForm.markup} onChange={(event) => setLineForm((current) => ({ ...current, markup: event.target.value }))} aria-label="Markup percent" />
              </div>
              <div className="cockpit-record-form-actions">
                <button type="submit"><Plus size={15} /> Add line</button>
                <label className="cockpit-record-check"><input type="checkbox" checked={lineForm.optional} onChange={(event) => setLineForm((current) => ({ ...current, optional: event.target.checked }))} /> Optional line</label>
              </div>
            </form>
          ) : null}
        </section>
      ) : (
        <SectionEmpty title="No proposal yet" body="Draft a proposal with a real estimate — versioned lines, approval gates, and a direct handoff to pre-production." />
      )}
    </>
  );
}

/* --------------------------------- Plan ------------------------------------ */

const PLAN_NEXT: Record<PlanItem["status"], PlanItem["status"] | null> = {
  pending: "in_progress",
  in_progress: "done",
  done: null,
  blocked: "in_progress",
};

export function PlanSection({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();
  const items = useMemo(
    () => workspace.planItems
      .filter((item) => item.project_id === projectId)
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")),
    [workspace.planItems, projectId],
  );
  const [form, setForm] = useState({ kind: "task" as PlanItem["kind"], title: "", date: "", assignee: "" });

  if (!demoMode) return <SectionEmpty title="Plan" body="Planning is available in the local workspace." />;

  function addItem() {
    const result = addPlanItem({
      projectId,
      kind: form.kind,
      title: form.title,
      date: form.date || null,
      assignee: form.assignee || null,
    });
    if (!result.ok) {
      onNotice(result.reason);
      return;
    }
    setForm({ kind: "task", title: "", date: "", assignee: "" });
    onNotice("Plan item added.");
  }

  const groups: Array<{ kind: PlanItem["kind"]; label: string }> = [
    { kind: "production_day", label: "Production days" },
    { kind: "milestone", label: "Milestones" },
    { kind: "task", label: "Tasks" },
  ];

  return (
    <>
      <header>
        <div>
          <h2>Production plan</h2>
          <p>Shoot days, milestones, and tasks with explicit status — the pre-production truth for this record.</p>
        </div>
      </header>

      <form className="cockpit-record-form" aria-label="Add plan item" onSubmit={(event) => { event.preventDefault(); addItem(); }}>
        <div className="cockpit-record-form-grid">
          <select className="input" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as PlanItem["kind"] }))} aria-label="Kind">
            <option value="task">Task</option>
            <option value="milestone">Milestone</option>
            <option value="production_day">Production day</option>
          </select>
          <input className="input" placeholder="Title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} aria-label="Title" />
          <input className="input" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} aria-label="Date" />
          <input className="input" placeholder="Assignee" value={form.assignee} onChange={(event) => setForm((current) => ({ ...current, assignee: event.target.value }))} aria-label="Assignee" />
        </div>
        <div className="cockpit-record-form-actions">
          <button type="submit"><Plus size={15} /> Add {form.kind.replace("_", " ")}</button>
        </div>
      </form>

      {groups.map((group) => {
        const groupItems = items.filter((item) => item.kind === group.kind);
        return (
          <section key={group.kind} aria-label={group.label}>
            <h3 className="cockpit-record-group-title">{group.label} ({groupItems.length})</h3>
            <div className="cockpit-table-list">
              {groupItems.map((item) => {
                const next = PLAN_NEXT[item.status];
                return (
                  <article key={item.id}>
                    <span className="cockpit-list-icon"><ListChecks size={18} /></span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.date ?? "unscheduled"}{item.assignee ? ` · ${item.assignee}` : ""}{Object.keys(item.meta).length > 0 ? ` · ${Object.entries(item.meta).map(([key, value]) => `${key}: ${value}`).join(", ")}` : ""}</small>
                    </div>
                    <span className={item.status === "done" ? "status-active" : "status-pending"}>{item.status.replace("_", " ")}</span>
                    {next ? (
                      <button type="button" onClick={() => {
                        const result = setPlanItemStatus(item.id, next);
                        onNotice(result.ok ? `"${item.title}" → ${next.replace("_", " ")}.` : result.reason);
                      }}>
                        Mark {next.replace("_", " ")}
                      </button>
                    ) : <Check size={17} />}
                  </article>
                );
              })}
              {groupItems.length === 0 ? <p className="cockpit-rail-empty">No {group.label.toLowerCase()} yet.</p> : null}
            </div>
          </section>
        );
      })}

      <ProductionBlock projectId={projectId} demoMode={demoMode} onNotice={onNotice} />
    </>
  );
}

/* ------------------------------- Delivery ----------------------------------- */

export function DeliverySection({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();
  const deliverables = useMemo(
    () => workspace.deliverables.filter((deliverable) => deliverable.project_id === projectId),
    [workspace.deliverables, projectId],
  );
  const [form, setForm] = useState({ name: "", resolution: "1920x1080", codec: "H.264 12Mbps", aspect: "16:9" });

  if (!demoMode) return <SectionEmpty title="Delivery" body="Deliverables are available in the local workspace." />;

  function addDeliverable() {
    const result = saveDeliverable({
      projectId,
      name: form.name,
      spec: { resolution: form.resolution, codec: form.codec, aspect: form.aspect, captions: true, audio: "stereo 48kHz", watermark: false },
    });
    if (!result.ok) {
      onNotice(result.reason);
      return;
    }
    setForm({ name: "", resolution: "1920x1080", codec: "H.264 12Mbps", aspect: "16:9" });
    onNotice("Deliverable specced.");
  }

  const NEXT: Record<string, string | null> = { specced: "encoding", encoding: "qc", qc: "ready", ready: "delivered", delivered: null, expired: null };

  return (
    <>
      <header>
        <div>
          <h2>Delivery & QC</h2>
          <p>Deliverables with frozen specs, QC gates, and delivery state — the end of the record.</p>
        </div>
      </header>

      <form className="cockpit-record-form" aria-label="Spec deliverable" onSubmit={(event) => { event.preventDefault(); addDeliverable(); }}>
        <div className="cockpit-record-form-grid">
          <input className="input" placeholder="File name (e.g. PROJECT_MASTER_16x9.mov)" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} aria-label="Deliverable name" />
          <input className="input" placeholder="Resolution" value={form.resolution} onChange={(event) => setForm((current) => ({ ...current, resolution: event.target.value }))} aria-label="Resolution" />
          <input className="input" placeholder="Codec" value={form.codec} onChange={(event) => setForm((current) => ({ ...current, codec: event.target.value }))} aria-label="Codec" />
          <select className="input" value={form.aspect} onChange={(event) => setForm((current) => ({ ...current, aspect: event.target.value }))} aria-label="Aspect">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
          </select>
        </div>
        <div className="cockpit-record-form-actions">
          <button type="submit"><Plus size={15} /> Spec deliverable</button>
        </div>
      </form>

      <div className="cockpit-table-list">
        {deliverables.map((deliverable) => {
          const next = NEXT[deliverable.status];
          return (
            <article key={deliverable.id}>
              <span className="cockpit-list-icon"><PackageCheck size={18} /></span>
              <div>
                <strong>{deliverable.name}</strong>
                <small>
                  {deliverable.spec.resolution} · {deliverable.spec.codec} · {deliverable.spec.aspect}
                  {deliverable.spec.captions ? " · captioned" : ""}
                  {deliverable.qc_notes ? ` · ${deliverable.qc_notes}` : ""}
                </small>
              </div>
              <span className={deliverable.status === "delivered" ? "status-active" : "status-pending"}>{deliverable.status}</span>
              {next ? (
                <button type="button" onClick={() => {
                  const result = setDeliverableStatus(deliverable.id, next as never);
                  onNotice(result.ok ? `${deliverable.name} → ${next}.` : result.reason);
                }}>
                  Move to {next}
                </button>
              ) : <Check size={17} />}
            </article>
          );
        })}
        {deliverables.length === 0 ? <p className="cockpit-rail-empty">No deliverables specced yet.</p> : null}
      </div>
    </>
  );
}

/* ------------------------------- Sequences ---------------------------------- */

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SequencesSection({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();
  const sequences = useMemo(
    () => workspace.sequences.filter((sequence) => sequence.project_id === projectId),
    [workspace.sequences, projectId],
  );
  const selects = useMemo(
    () => workspace.selects.filter((select) => select.project_id === projectId),
    [workspace.selects, projectId],
  );
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [name, setName] = useState("");
  const [renderingId, setRenderingId] = useState<string | null>(null);

  if (!demoMode) return <SectionEmpty title="Sequences" body="Sequences are available in the local workspace." />;

  function togglePick(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function assemble() {
    const ordered = selects.filter((select) => picked.has(select.id)).map((select) => select.id);
    const result = createSequenceFromSelects({ projectId, name, selectIds: ordered });
    if (!result.ok) {
      onNotice(result.reason);
      return;
    }
    setPicked(new Set());
    setName("");
    onNotice("Sequence assembled from selects.");
  }

  function review(id: string) {
    const result = setSequenceStatus(id, "in_review");
    onNotice(result.ok ? "Sequence sent to review." : result.reason);
  }

  async function renderForReview(sequence: (typeof sequences)[number]) {
    setRenderingId(sequence.id);
    try {
      const result = await renderSequenceToAsset(sequence.id);
      onNotice(
        result.ok
          ? "Render complete — the review asset is in project Media, ready to share."
          : result.reason,
      );
    } finally {
      setRenderingId(null);
    }
  }

  function makeSelectFromSegment(assetId: string, segmentId: string, start: number, end: number, text: string) {
    const result = addSelect({
      projectId,
      assetId,
      inSeconds: start,
      outSeconds: end,
      label: text.length > 64 ? `${text.slice(0, 64)}…` : text,
      source: "transcript",
      transcriptSegmentIds: [segmentId],
    });
    onNotice(result.ok ? "Select created from transcript." : result.reason);
  }

  const transcriptAssets = workspace.assets
    .filter((asset) => asset.project_id === projectId && seedTranscriptSegments[asset.id]?.length)
    .map((asset) => ({ asset, segments: seedTranscriptSegments[asset.id] }));

  function proposeCut() {
    const pool = transcriptAssets.flatMap(({ asset, segments }) =>
      segments.map((segment) => ({ ...segment, assetId: asset.id })),
    );
    const proposal = proposeRadioCut(pool, 90);
    if (proposal.segmentIds.length === 0) {
      onNotice("No sound bites strong enough to propose a cut yet.");
      return;
    }
    const selectIds: string[] = [];
    for (const segmentId of proposal.segmentIds) {
      const segment = pool.find((candidate) => candidate.id === segmentId);
      if (!segment) continue;
      const result = addSelect({
        projectId,
        assetId: segment.assetId,
        inSeconds: segment.start_seconds,
        outSeconds: segment.end_seconds,
        label: segment.text.length > 64 ? `${segment.text.slice(0, 64)}…` : segment.text,
        source: "transcript",
        transcriptSegmentIds: [segmentId],
      });
      if (result.ok) selectIds.push(result.id);
    }
    const assembled = createSequenceFromSelects({ projectId, name: `Radio cut (reasoned, ${Math.round(proposal.totalSeconds)}s)`, selectIds });
    onNotice(
      assembled.ok
        ? `Radio cut proposed: ${selectIds.length} bites, avg score ${proposal.score}. Review the assembly above.`
        : assembled.reason,
    );
  }

  function downloadCaptions(assetTitle: string, format: "srt" | "vtt") {
    const segments = transcriptAssets.flatMap(({ segments }) => segments);
    if (segments.length === 0) {
      onNotice("No transcript segments to export.");
      return;
    }
    const content = format === "srt" ? segmentsToSrt(segments) : segmentsToVtt(segments);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = captionsFilename(assetTitle, format);
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice(`${format.toUpperCase()} captions exported from ${segments.length} segments.`);
  }

  function refineRange(selectId: string, field: "in" | "out", value: string, current: { in_seconds: number; out_seconds: number }) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      onNotice("Range values must be numbers (seconds).");
      return;
    }
    const result = updateSelectRange({
      selectId,
      inSeconds: field === "in" ? parsed : current.in_seconds,
      outSeconds: field === "out" ? parsed : current.out_seconds,
    });
    onNotice(result.ok ? "Select range refined." : result.reason);
  }

  return (
    <>
      <header>
        <div>
          <h2>Sequences</h2>
          <p>Real assemblies: clips with source and record times, built from transcript selects.</p>
        </div>
      </header>

      <section aria-label="Sequence list" className="cockpit-table-list">
        {sequences.map((sequence) => {
          const clips = workspace.sequenceClips.filter((clip) => clip.sequence_id === sequence.id);
          const duration = clips.reduce((max, clip) => Math.max(max, clip.timeline_out_seconds), 0);
          return (
            <div key={sequence.id}>
              <article style={{ gridTemplateColumns: "34px minmax(0,1fr) auto auto" }}>
                <span className="cockpit-list-icon"><ListChecks size={18} /></span>
                <div>
                  <strong>{sequence.name}</strong>
                  <small>
                    v{sequence.version} · {clips.length} clips · {formatSeconds(duration)} · {sequence.created_from === "transcript-assembly" ? "transcript assembly" : "manual"}
                  </small>
                </div>
                <span className={sequence.status === "approved" ? "status-active" : "status-pending"}>{sequence.status.replace("_", " ")}</span>
                <button type="button" disabled={renderingId === sequence.id || clips.length === 0} onClick={() => void renderForReview(sequence)}>
                  {renderingId === sequence.id ? "Rendering…" : "Render to review"}
                </button>
                {sequence.status === "draft" ? <button type="button" onClick={() => review(sequence.id)}>Send to review</button> : null}
              </article>
              <SequenceTimeline
                sequence={sequence}
                clips={clips}
                assets={workspace.assets}
                onNotice={onNotice}
              />
            </div>
          );
        })}
        {sequences.length === 0 ? <p className="cockpit-rail-empty">No sequences yet — assemble one from the selects below.</p> : null}
      </section>

      <h3 className="cockpit-record-group-title">Selects ({selects.length})</h3>
      <section aria-label="Selects" className="cockpit-table-list">
        {selects.map((select) => {
          const asset = workspace.assets.find((candidate) => candidate.id === select.asset_id);
          return (
            <article key={select.id} style={{ gridTemplateColumns: "auto 34px minmax(0,1fr) auto auto" }}>
              <input
                type="checkbox"
                checked={picked.has(select.id)}
                onChange={() => togglePick(select.id)}
                aria-label={`Include ${select.label} in sequence`}
              />
              <span className="cockpit-list-icon"><Check size={16} /></span>
              <div>
                <strong>{select.label}</strong>
                <small>{asset?.title ?? select.asset_id} · {formatSeconds(select.in_seconds)}→{formatSeconds(select.out_seconds)} · {select.source}</small>
              </div>
              <span className="cockpit-record-actions" style={{ marginLeft: 0 }}>
                <input
                  key={`in-${select.id}-${select.in_seconds}`}
                  className="input"
                  style={{ width: 64, minHeight: 26, fontSize: 10 }}
                  defaultValue={select.in_seconds}
                  inputMode="decimal"
                  aria-label="Select in-point (seconds)"
                  onBlur={(event) => refineRange(select.id, "in", event.target.value, select)}
                />
                <input
                  key={`out-${select.id}-${select.out_seconds}`}
                  className="input"
                  style={{ width: 64, minHeight: 26, fontSize: 10 }}
                  defaultValue={select.out_seconds}
                  inputMode="decimal"
                  aria-label="Select out-point (seconds)"
                  onBlur={(event) => refineRange(select.id, "out", event.target.value, select)}
                />
              </span>
            </article>
          );
        })}
        {selects.length === 0 ? <p className="cockpit-rail-empty">No selects yet — mark ranges from the transcript workbench or review timeline.</p> : null}
      </section>

      {transcriptAssets.length > 0 ? (
        <>
          <h3 className="cockpit-record-group-title">
            Transcript
            <button type="button" onClick={proposeCut} style={{ marginLeft: 10, padding: "4px 10px", border: "1px solid var(--cockpit-border)", borderRadius: 5, background: "#fff", color: "var(--cockpit-accent)", fontSize: 9, fontWeight: 650 }}>
              Propose 90s radio cut
            </button>
            <button type="button" onClick={() => downloadCaptions("transcript", "srt")} style={{ marginLeft: 6, padding: "4px 10px", border: "1px solid var(--cockpit-border)", borderRadius: 5, background: "#fff", color: "var(--cockpit-accent)", fontSize: 9, fontWeight: 650 }}>
              Export SRT
            </button>
            <button type="button" onClick={() => downloadCaptions("transcript", "vtt")} style={{ marginLeft: 6, padding: "4px 10px", border: "1px solid var(--cockpit-border)", borderRadius: 5, background: "#fff", color: "var(--cockpit-accent)", fontSize: 9, fontWeight: 650 }}>
              Export VTT
            </button>
          </h3>
          {transcriptAssets.map(({ asset, segments }) => (
            <section key={asset.id} aria-label={`Transcript for ${asset.title}`} className="cockpit-table-list">
              {segments.map((segment) => (
                <article key={segment.id} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <div>
                    <strong>{segment.speaker} · {formatSeconds(segment.start_seconds)}–{formatSeconds(segment.end_seconds)}</strong>
                    <small>{segment.text}</small>
                  </div>
                  <button type="button" onClick={() => makeSelectFromSegment(asset.id, segment.id, segment.start_seconds, segment.end_seconds, segment.text)}>
                    Make select
                  </button>
                </article>
              ))}
            </section>
          ))}
        </>
      ) : null}

      {selects.length > 0 ? (
        <form className="cockpit-record-form" aria-label="Assemble sequence" onSubmit={(event) => { event.preventDefault(); assemble(); }}>
          <div className="cockpit-record-form-grid">
            <input className="input" placeholder="Sequence name" value={name} onChange={(event) => setName(event.target.value)} aria-label="Sequence name" />
          </div>
          <div className="cockpit-record-form-actions">
            <button type="submit" disabled={picked.size === 0}><Plus size={15} /> Assemble from {picked.size} select{picked.size === 1 ? "" : "s"}</button>
          </div>
        </form>
      ) : null}
    </>
  );
}

/* ------------------------ Review consolidation ------------------------------- */

export function ReviewConsolidationSection({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();

  if (!demoMode) return null;

  const projectAssets = workspace.assets.filter((asset) => asset.project_id === projectId);
  const openCommentsByAsset = new Map<string, typeof workspace.reviewComments>();
  for (const comment of workspace.reviewComments) {
    if (comment.project_id !== projectId || comment.status !== "open") continue;
    const list = openCommentsByAsset.get(comment.asset_id) ?? [];
    list.push(comment);
    openCommentsByAsset.set(comment.asset_id, list);
  }
  const requests = workspace.revisionRequests
    .filter((request) => request.project_id === projectId)
    .sort((a, b) => b.round - a.round);

  const NEXT: Record<string, { to: "in_progress" | "addressed" | "verified"; label: string } | null> = {
    open: { to: "in_progress", label: "Start work" },
    in_progress: { to: "addressed", label: "Mark addressed" },
    addressed: { to: "verified", label: "Verify round" },
    verified: null,
  };

  return (
    <section aria-label="Revision consolidation" style={{ marginTop: 22 }}>
      <h3 className="cockpit-record-group-title">Revision rounds</h3>
      <div className="cockpit-table-list">
        {requests.map((request) => {
          const asset = projectAssets.find((candidate) => candidate.id === request.asset_id);
          const next = NEXT[request.status];
          const linkedOpen = workspace.reviewComments.filter(
            (comment) => request.comment_ids.includes(comment.id) && comment.status === "open",
          ).length;
          return (
            <article key={request.id} style={{ gridTemplateColumns: "34px minmax(0,1fr) auto auto" }}>
              <span className="cockpit-list-icon"><ListChecks size={18} /></span>
              <div>
                <strong>Round {request.round} — {asset?.title ?? request.asset_id}</strong>
                <small>{request.summary}</small>
                <small>{request.comment_ids.length} linked comments · {linkedOpen} still open</small>
              </div>
              <span className={request.status === "verified" ? "status-active" : "status-pending"}>{request.status.replace("_", " ")}</span>
              {next ? (
                <button type="button" onClick={() => {
                  const result = setRevisionRequestStatus(request.id, next.to, { waiveUnresolved: next.to === "verified" });
                  onNotice(result.ok ? `Round ${request.round} → ${next.to.replace("_", " ")}.` : result.reason);
                }}>
                  {next.label}
                </button>
              ) : <Check size={17} />}
            </article>
          );
        })}
        {requests.length === 0 ? <p className="cockpit-rail-empty">No revision rounds yet.</p> : null}
      </div>

      {[...openCommentsByAsset.entries()].map(([assetId, comments]) => {
        const asset = projectAssets.find((candidate) => candidate.id === assetId);
        return (
          <div key={assetId} className="cockpit-record-form" style={{ marginTop: 10 }}>
            <div className="cockpit-record-form-grid" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <p style={{ margin: 0, fontSize: 11, color: "var(--cockpit-copy)" }}>
                <strong>{asset?.title ?? assetId}</strong> — {comments.length} open comment{comments.length === 1 ? "" : "s"} scattered across the review. Consolidate them into one actionable round instead of email threads.
              </p>
              <div className="cockpit-record-form-actions">
                <button type="button" onClick={() => {
                  const result = addRevisionRequest({
                    projectId,
                    assetId,
                    summary: comments.map((comment) => comment.body).join(" · ").slice(0, 220),
                    commentIds: comments.map((comment) => comment.id),
                  });
                  onNotice(result.ok ? `Revision round consolidated for ${asset?.title ?? "asset"}.` : result.reason);
                }}>
                  <Plus size={15} /> Consolidate {comments.length} comments
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------- Payment milestones block ------------------------- */

function MilestonesBlock({ proposalId, onNotice }: { proposalId: string; onNotice: (message: string) => void }) {
  const workspace = useDemoWorkspace();
  const milestones = workspace.paymentMilestones.filter((milestone) => milestone.proposal_id === proposalId);
  if (milestones.length === 0) return null;

  return (
    <section aria-label="Payment milestones" className="cockpit-record-card" style={{ marginTop: 4 }}>
      <header className="cockpit-record-card-head">
        <strong>Payment milestones</strong>
        <span className="demo-pill">offline checkout (mock)</span>
      </header>
      <div className="cockpit-table-list" style={{ marginTop: 0 }}>
        {milestones.map((milestone) => (
          <article key={milestone.id} style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}>
            <div>
              <strong>{milestone.kind === "deposit" ? "Deposit" : "Balance"} — {formatCents(milestone.amount_cents, milestone.currency)}</strong>
              <small>
                {milestone.checkout_url ? (
                  <a href={milestone.checkout_url} target="_blank" rel="noreferrer">checkout link ({milestone.checkout_provider})</a>
                ) : "no checkout link"}
                {milestone.paid_at ? ` · paid ${new Date(milestone.paid_at).toLocaleDateString()} (${milestone.method})` : ""}
              </small>
            </div>
            <span className={milestone.status === "paid" ? "status-active" : "status-pending"}>{milestone.status.replace("_", " ")}</span>
            {milestone.status === "pending" ? (
              <button type="button" onClick={() => {
                const result = createMilestoneCheckout(milestone.id);
                onNotice(result.ok ? "Checkout link created (mock provider — no live charge)." : result.reason);
              }}>
                Create checkout link
              </button>
            ) : null}
            {milestone.status === "pending" || milestone.status === "checkout_created" ? (
              <button type="button" onClick={() => {
                const result = recordMilestonePayment(milestone.id, milestone.status === "pending" ? "manual" : "checkout");
                onNotice(result.ok ? "Payment recorded." : result.reason);
              }}>
                Record payment
              </button>
            ) : <Check size={17} />}
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------- Notification outbox block ------------------------ */

export function NotificationOutboxSection({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();

  if (!demoMode) return null;

  const items = workspace.notificationOutbox
    .filter((item) => item.project_id === projectId)
    .slice(0, 12);
  const queuedCount = items.filter((item) => item.status === "queued").length;

  return (
    <section aria-label="Notification outbox" style={{ marginTop: 22 }}>
      <h3 className="cockpit-record-group-title">
        Notification outbox {queuedCount > 0 ? `(${queuedCount} queued)` : ""}
      </h3>
      {queuedCount > 0 ? (
        <div className="cockpit-record-form-actions" style={{ marginBottom: 8 }}>
          <button type="button" onClick={() => {
            const { processed } = dispatchNotificationOutbox();
            onNotice(processed > 0 ? `Processed ${processed} notification(s) through the dry-run lane.` : "Nothing queued.");
          }}>
            Process outbox (dry-run)
          </button>
        </div>
      ) : null}
      <div className="cockpit-table-list">
        {items.map((item) => (
          <article key={item.id} style={{ gridTemplateColumns: "34px minmax(0,1fr) auto" }}>
            <span className="cockpit-list-icon"><FileText size={16} /></span>
            <div>
              <strong>{item.subject}</strong>
              <small>{item.channel} → {item.recipient} · {item.attempt_count} attempt{item.attempt_count === 1 ? "" : "s"}{item.last_error ? ` · ${item.last_error}` : ""}</small>
            </div>
            <span className={item.status === "dry_run_sent" ? "status-active" : "status-pending"}>
              {item.status === "dry_run_sent" ? "dry-run sent" : item.status.replace("_", " ")}
            </span>
          </article>
        ))}
        {items.length === 0 ? <p className="cockpit-rail-empty">No notifications yet — creating a review link with channels queues them here.</p> : null}
      </div>
    </section>
  );
}

/* ------------------------------ Production --------------------------------- */

const PD_NEXT: Record<string, string | null> = {
  scheduled: "in_progress",
  in_progress: "wrapped",
  wrapped: null,
  cancelled: "scheduled",
};

const AGREEMENT_NEXT: Record<string, string | null> = {
  none: "drafted",
  drafted: "sent",
  sent: "signed",
  signed: null,
};

const RELEASE_NEXT: Record<string, string | null> = {
  unsent: "sent",
  sent: "signed",
  signed: null,
};

export function ProductionBlock({ projectId, demoMode, onNotice }: SectionProps) {
  const workspace = useDemoWorkspace();
  if (!demoMode) return null;

  const days = workspace.productionDays
    .filter((day) => day.project_id === projectId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const crew = workspace.crewMembers.filter((member) => member.project_id === projectId);
  const locations = workspace.locations.filter((location) => location.project_id === projectId);
  const releases = workspace.releases.filter((release) => release.project_id === projectId);
  const sheets = workspace.callSheets.filter((sheet) => sheet.project_id === projectId);
  const unsigned = releases.filter((release) => release.status !== "signed");

  if (days.length === 0 && crew.length === 0 && releases.length === 0) return null;

  return (
    <section aria-label="Production" style={{ marginTop: 22 }}>
      <h3 className="cockpit-record-group-title">Production days ({days.length})</h3>
      <div className="cockpit-table-list">
        {days.map((day) => {
          const daySheets = sheets.filter((sheet) => sheet.production_day_id === day.id).sort((a, b) => b.version - a.version);
          const latest = daySheets[0];
          return (
            <article key={day.id} style={{ gridTemplateColumns: "34px minmax(0,1fr) auto auto auto" }}>
              <span className="cockpit-list-icon"><ListChecks size={18} /></span>
              <div>
                <strong>{day.date} · {day.type}</strong>
                <small>call {day.call ?? "—"} · wrap {day.wrap ?? "—"}{day.notes ? ` · ${day.notes}` : ""}</small>
              </div>
              <span className={day.status === "wrapped" ? "status-active" : "status-pending"}>{day.status.replace("_", " ")}</span>
              {PD_NEXT[day.status] ? (
                <button type="button" onClick={() => {
                  const result = setProductionDayStatus(day.id, PD_NEXT[day.status] as never);
                  onNotice(result.ok ? `${day.date} → ${PD_NEXT[day.status]?.replace("_", " ")}.` : result.reason);
                }}>
                  Mark {PD_NEXT[day.status]?.replace("_", " ")}
                </button>
              ) : null}
              {day.status === "scheduled" || day.status === "in_progress" ? (
                <button type="button" onClick={() => {
                  const result = generateCallSheet(day.id);
                  onNotice(result.ok ? `Call sheet v${latest ? latest.version + 1 : 1} generated for ${day.date}.` : result.reason);
                }}>
                  {latest ? `Regenerate call sheet (v${latest.version + 1})` : "Generate call sheet"}
                </button>
              ) : <span />}
              {latest ? (
                <details style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                  <summary style={{ cursor: "pointer", fontSize: 10, color: "var(--cockpit-accent)" }}>
                    Call sheet v{latest.version} · generated {new Date(latest.generated_at).toLocaleString()}
                  </summary>
                  <pre style={{ margin: "8px 0 0", padding: 12, background: "#0b0f14", color: "#dbe6f4", borderRadius: 8, fontSize: 10.5, lineHeight: 1.55, overflowX: "auto", whiteSpace: "pre-wrap" }}>{latest.content}</pre>
                </details>
              ) : null}
            </article>
          );
        })}
        {days.length === 0 ? <p className="cockpit-rail-empty">No production days scheduled.</p> : null}
      </div>

      {releases.length > 0 ? (
        <>
          <h3 className="cockpit-record-group-title">
            Releases {unsigned.length > 0 ? `— ⚠ ${unsigned.length} unsigned` : "— all signed"}
          </h3>
          <div className="cockpit-table-list">
            {releases.map((release) => (
              <article key={release.id} style={{ gridTemplateColumns: "34px minmax(0,1fr) auto auto" }}>
                <span className="cockpit-list-icon"><FileText size={16} /></span>
                <div>
                  <strong>{release.person_name}</strong>
                  <small>{release.type} · {release.language}{release.signed_at ? ` · signed ${new Date(release.signed_at).toLocaleDateString()}` : ""}</small>
                </div>
                <span className={release.status === "signed" ? "status-active" : "status-pending"}>{release.status}</span>
                {RELEASE_NEXT[release.status] ? (
                  <button type="button" onClick={() => {
                    const result = setReleaseStatus(release.id, RELEASE_NEXT[release.status] as never);
                    onNotice(result.ok ? `${release.person_name} → ${RELEASE_NEXT[release.status]}.` : result.reason);
                  }}>
                    Mark {RELEASE_NEXT[release.status]}
                  </button>
                ) : <Check size={17} />}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {locations.length > 0 ? (
        <>
          <h3 className="cockpit-record-group-title">Locations & agreements</h3>
          <div className="cockpit-table-list">
            {locations.map((location) => (
              <article key={location.id} style={{ gridTemplateColumns: "34px minmax(0,1fr) auto auto" }}>
                <span className="cockpit-list-icon"><Flag size={16} /></span>
                <div>
                  <strong>{location.name}</strong>
                  <small>
                    {location.access_window ?? "window TBD"}
                    {location.restricted.length > 0 ? ` · NOT cleared: ${location.restricted.join(", ")}` : ""}
                  </small>
                </div>
                <span className={location.agreement_status === "signed" ? "status-active" : "status-pending"}>{location.agreement_status}</span>
                {AGREEMENT_NEXT[location.agreement_status] ? (
                  <button type="button" onClick={() => {
                    const result = setLocationAgreementStatus(location.id, AGREEMENT_NEXT[location.agreement_status] as never);
                    onNotice(result.ok ? `${location.name} agreement → ${AGREEMENT_NEXT[location.agreement_status]}.` : result.reason);
                  }}>
                    Mark {AGREEMENT_NEXT[location.agreement_status]}
                  </button>
                ) : <Check size={17} />}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {crew.length > 0 ? (
        <>
          <h3 className="cockpit-record-group-title">Unit ({crew.length})</h3>
          <div className="cockpit-table-list">
            {crew.map((member) => (
              <article key={member.id} style={{ gridTemplateColumns: "34px minmax(0,1fr) auto" }}>
                <span className="cockpit-list-icon"><Check size={16} /></span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.role} · {member.days} day{member.days === 1 ? "" : "s"} · {member.rate_basis.replace("_", " ")}{member.contact ? ` · ${member.contact}` : ""}</small>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
