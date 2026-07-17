"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Check,
  FileText,
  Inbox,
  Plus,
  X,
} from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import {
  addInquiry,
  convertInquiryToProject,
  setInquiryStatus,
  setProposalStatus,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { proposalEstimateTotal, type Inquiry } from "@/lib/covideopro/record.ts";
import { withWorkspaceQuery } from "@/components/navigation/navigation-model";

const INQUIRY_STATUS_LABEL: Record<Inquiry["status"], string> = {
  new: "New",
  triaged: "Triaged",
  qualified: "Qualified",
  converted: "Converted",
  declined: "Declined",
};

export default function OpportunitiesPage() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const searchParams = useSearchParams();
  const demoSuffix = demoMode ? "?demo=1" : "";
  const [composeOpen, setComposeOpen] = useState(searchParams.get("compose") === "inquiry");
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertName, setConvertName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ summary: "", source: "website", organization: "", contactName: "", contactEmail: "" });

  const openInquiries = useMemo(
    () => workspace.inquiries.filter((inquiry) => inquiry.status !== "converted" && inquiry.status !== "declined"),
    [workspace.inquiries],
  );
  const pipelineProposals = useMemo(
    () => workspace.proposals.filter((proposal) => proposal.status !== "superseded"),
    [workspace.proposals],
  );

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3600);
  }

  function submitInquiry() {
    const result = addInquiry({
      summary: form.summary,
      source: form.source,
      organizationName: form.organization || undefined,
      contactName: form.contactName || undefined,
      contactEmail: form.contactEmail || undefined,
    });
    if (!result.ok) {
      flash(result.reason);
      return;
    }
    setForm({ summary: "", source: "website", organization: "", contactName: "", contactEmail: "" });
    setComposeOpen(false);
    flash("Inquiry captured.");
  }

  function actOnInquiry(id: string, action: "triaged" | "qualified" | "declined") {
    const result = setInquiryStatus(id, action);
    flash(result.ok ? `Inquiry ${action}.` : result.reason);
  }

  function convert(id: string) {
    const result = convertInquiryToProject(id, convertName);
    if (!result.ok) {
      flash(result.reason);
      return;
    }
    setConvertingId(null);
    setConvertName("");
    flash("Project created from inquiry — open it from Projects.");
  }

  if (!demoMode) {
    return (
      <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
        <div className="empty-state" style={{ minHeight: 320 }}>
          <div className="empty-state-icon"><Inbox size={22} /></div>
          <h3 className="empty-state-title">Opportunities uses the local workspace</h3>
          <p className="empty-state-text">Connect this environment to your organization workspace to manage inquiries, clients, and proposals.</p>
          <div className="flex gap-3 mt-4 justify-center">
            <Link href="/projects" className="btn btn-primary">Open projects <ArrowRight size={15} /></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="min-w-0 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Opportunities</p>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Inquiries, clients, and proposal pipeline</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Where new work becomes a production. Qualify inquiries, keep client context, and move proposals to approval.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setComposeOpen((open) => !open)}>
          <Plus size={15} /> New inquiry
        </button>
      </header>

      {notice ? (
        <div className="demo-toast" role="status">{notice}</div>
      ) : null}

      {composeOpen ? (
        <section aria-label="New inquiry" className="mb-4 grid gap-2 rounded-lg border border-[var(--border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Capture an inquiry</h2>
          <textarea
            className="input flex-1"
            rows={2}
            placeholder="What are they asking for? Scope, dates, references…"
            value={form.summary}
            onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Source
              <select className="input" value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="repeat-client">Repeat client</option>
                <option value="direct">Direct outreach</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Organization
              <input className="input" placeholder="Company (optional)" value={form.organization} onChange={(event) => setForm((current) => ({ ...current, organization: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Contact name
              <input className="input" placeholder="Person (optional)" value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Contact email
              <input className="input" placeholder="email@company.com" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={submitInquiry}>Save inquiry</button>
            <button type="button" className="btn btn-ghost" onClick={() => setComposeOpen(false)}>Cancel</button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
        <section aria-label="Inquiries" className="grid content-start gap-2">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Inbox ({openInquiries.length})</h2>
          {openInquiries.length === 0 ? (
            <div className="empty-state" style={{ minHeight: 180 }}>
              <div className="empty-state-icon"><Inbox size={20} /></div>
              <h3 className="empty-state-title">Inbox zero</h3>
              <p className="empty-state-text">New inquiries land here for triage before they become productions.</p>
            </div>
          ) : (
            openInquiries.map((inquiry) => {
              const org = workspace.organizations.find((candidate) => candidate.id === inquiry.organization_id);
              const contact = workspace.contacts.find((candidate) => candidate.id === inquiry.contact_id);
              return (
                <article key={inquiry.id} className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                      <Building2 size={15} /> {org?.name ?? "Unknown organization"}
                    </span>
                    <span className="demo-pill">{INQUIRY_STATUS_LABEL[inquiry.status]}</span>
                  </header>
                  <p className="mt-2 text-sm text-[var(--ink)]">{inquiry.summary}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {contact ? `${contact.name} · ${contact.email} · ` : ""}via {inquiry.source} · {new Date(inquiry.received_at).toLocaleDateString()}
                  </p>
                  {convertingId === inquiry.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Project name"
                        value={convertName}
                        onChange={(event) => setConvertName(event.target.value)}
                      />
                      <button type="button" className="btn btn-primary" onClick={() => convert(inquiry.id)}>
                        <Check size={15} /> Create project
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setConvertingId(null)}>
                        <X size={15} /> Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {inquiry.status === "new" ? (
                        <button type="button" className="btn btn-secondary" onClick={() => actOnInquiry(inquiry.id, "triaged")}>Triage</button>
                      ) : null}
                      {inquiry.status === "triaged" ? (
                        <button type="button" className="btn btn-secondary" onClick={() => actOnInquiry(inquiry.id, "qualified")}>Qualify</button>
                      ) : null}
                      {inquiry.status === "qualified" ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            setConvertingId(inquiry.id);
                            setConvertName(org ? `${org.name} — New project` : "New project");
                          }}
                        >
                          Convert to project
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-ghost" onClick={() => actOnInquiry(inquiry.id, "declined")}>Decline</button>
                    </div>
                  )}
                </article>
              );
            })
          )}

          <h2 className="mt-2 text-sm font-semibold text-[var(--ink)]">Clients ({workspace.organizations.length})</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {workspace.organizations.map((organization) => {
              const contacts = workspace.contacts.filter((contact) => contact.organization_id === organization.id);
              const projects = workspace.projects.filter((project) => project.organization_id === organization.id);
              return (
                <article key={organization.id} className="rounded-lg border border-[var(--border)] bg-white p-3">
                  <p className="text-sm font-semibold text-[var(--ink)]">{organization.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{organization.industry ?? "—"}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {contacts.map((contact) => contact.name).join(", ") || "No contacts"}
                  </p>
                  {projects.length > 0 ? (
                    <p className="mt-1 text-xs">
                      {projects.map((project, index) => (
                        <span key={project.id}>
                          {index > 0 ? " · " : ""}
                          <Link className="text-[var(--accent)]" href={withWorkspaceQuery(`/projects/${project.id}`, demoSuffix)}>
                            {project.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <aside aria-label="Proposal pipeline" className="grid content-start gap-2">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Proposal pipeline</h2>
          {pipelineProposals.map((proposal) => {
            const project = workspace.projects.find((candidate) => candidate.id === proposal.project_id);
            const total = proposalEstimateTotal(proposal.estimate_lines);
            return (
              <article key={proposal.id} className="rounded-lg border border-[var(--border)] bg-white p-4">
                <header className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                    <FileText size={15} /> {proposal.title}
                  </span>
                  <span className="demo-pill">{proposal.status}</span>
                </header>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {project?.name} · v{proposal.version} · ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {proposal.valid_until ? ` · valid until ${proposal.valid_until}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {proposal.status === "draft" ? (
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      const result = setProposalStatus(proposal.id, "in_review");
                      flash(result.ok ? "Proposal in internal review." : result.reason);
                    }}>
                      Send to internal review
                    </button>
                  ) : null}
                  {proposal.status === "in_review" ? (
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      const result = setProposalStatus(proposal.id, "sent");
                      flash(result.ok ? "Proposal sent to client." : result.reason);
                    }}>
                      Mark as sent to client
                    </button>
                  ) : null}
                  {proposal.status === "sent" ? (
                    <button type="button" className="btn btn-primary" onClick={() => {
                      const primaryContact = workspace.contacts.find(
                        (contact) => contact.organization_id === project?.organization_id && contact.is_primary,
                      );
                      const result = setProposalStatus(proposal.id, "approved", primaryContact?.email ?? "");
                      flash(result.ok ? "Proposal approved — project can advance to pre-production." : result.reason);
                    }}>
                      Record client approval
                    </button>
                  ) : null}
                  <Link className="btn btn-ghost" href={withWorkspaceQuery(`/projects/${proposal.project_id}?section=proposal`, demoSuffix)}>
                    Open in project
                  </Link>
                </div>
              </article>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
