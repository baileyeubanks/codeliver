"use client";

import { useMemo, useState } from "react";
import { Check, FileText, Lightbulb, ListChecks, PackageCheck, Plus, X } from "lucide-react";
import {
  addPlanItem,
  saveBrief,
  saveDeliverable,
  saveProposal,
  setBriefStatus,
  setDeliverableStatus,
  setPlanItemStatus,
  setProposalStatus,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
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
            <p className="cockpit-rail-empty">Approved by {proposal.approved_by} on {proposal.approved_at ? new Date(proposal.approved_at).toLocaleDateString() : "—"}.</p>
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
