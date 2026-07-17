"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  Flag,
  Inbox,
  PackageCheck,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { PROJECT_STAGE_META, PROJECT_STAGES, type ProjectStage } from "@/lib/covideopro/record.ts";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { withWorkspaceQuery } from "@/components/navigation/navigation-model";

interface AttentionItem {
  id: string;
  kind: "inquiry" | "proposal" | "revision" | "deliverable" | "plan";
  title: string;
  detail: string;
  href: string;
  projectName?: string;
}

const KIND_META = {
  inquiry: { icon: Inbox, label: "Inquiry" },
  proposal: { icon: FileText, label: "Proposal" },
  revision: { icon: RefreshCcw, label: "Revision" },
  deliverable: { icon: PackageCheck, label: "Delivery" },
  plan: { icon: Flag, label: "Plan" },
} as const;

export default function HomePage() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const demoSuffix = demoMode ? "?demo=1" : "";

  const attention = useMemo<AttentionItem[]>(() => {
    if (!demoMode) return [];
    const items: AttentionItem[] = [];

    for (const inquiry of workspace.inquiries.filter((candidate) => candidate.status === "new" || candidate.status === "triaged")) {
      const org = workspace.organizations.find((candidate) => candidate.id === inquiry.organization_id);
      items.push({
        id: `inquiry-${inquiry.id}`,
        kind: "inquiry",
        title: inquiry.summary.slice(0, 90),
        detail: `${org?.name ?? "Unassigned"} · ${inquiry.status === "new" ? "New — needs triage" : "Triaged — qualify or decline"}`,
        href: "/opportunities",
      });
    }

    for (const proposal of workspace.proposals.filter((candidate) => candidate.status === "sent")) {
      const project = workspace.projects.find((candidate) => candidate.id === proposal.project_id);
      items.push({
        id: `proposal-${proposal.id}`,
        kind: "proposal",
        title: proposal.title,
        detail: `v${proposal.version} sent — awaiting client approval`,
        href: `/projects/${proposal.project_id}?surface=proposal`,
        projectName: project?.name,
      });
    }

    for (const request of workspace.revisionRequests.filter((candidate) => candidate.status === "open" || candidate.status === "in_progress")) {
      const project = workspace.projects.find((candidate) => candidate.id === request.project_id);
      const asset = workspace.assets.find((candidate) => candidate.id === request.asset_id);
      items.push({
        id: `revision-${request.id}`,
        kind: "revision",
        title: `Round ${request.round}: ${asset?.title ?? request.asset_id}`,
        detail: request.summary.slice(0, 90),
        href: `/projects/${request.project_id}?surface=reviews`,
        projectName: project?.name,
      });
    }

    for (const deliverable of workspace.deliverables.filter((candidate) => candidate.status === "qc" || candidate.status === "encoding")) {
      const project = workspace.projects.find((candidate) => candidate.id === deliverable.project_id);
      items.push({
        id: `deliverable-${deliverable.id}`,
        kind: "deliverable",
        title: deliverable.name,
        detail: deliverable.status === "qc" ? `In QC — ${deliverable.qc_notes || "check pending"}` : "Encoding",
        href: `/projects/${deliverable.project_id}?surface=delivery`,
        projectName: project?.name,
      });
    }

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 21);
    for (const item of workspace.planItems.filter((candidate) => candidate.status !== "done" && candidate.date)) {
      if (new Date(`${item.date}T00:00:00`) > horizon) continue;
      const project = workspace.projects.find((candidate) => candidate.id === item.project_id);
      items.push({
        id: `plan-${item.id}`,
        kind: "plan",
        title: item.title,
        detail: `${item.kind.replace("_", " ")} · ${item.date}${item.assignee ? ` · ${item.assignee}` : ""}`,
        href: `/projects/${item.project_id}?surface=plan`,
        projectName: project?.name,
      });
    }

    return items;
  }, [demoMode, workspace]);

  const byStage = useMemo(() => {
    if (!demoMode) return new Map<ProjectStage, typeof workspace.projects>();
    const map = new Map<ProjectStage, typeof workspace.projects>();
    for (const stage of PROJECT_STAGES) {
      const projects = workspace.projects.filter((project) => (project.stage ?? "inquiry") === stage);
      if (projects.length > 0) map.set(stage, projects);
    }
    return map;
  }, [demoMode, workspace]);

  if (!demoMode) {
    return (
      <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
        <div className="empty-state" style={{ minHeight: 320 }}>
          <div className="empty-state-icon"><ClipboardList size={22} /></div>
          <h3 className="empty-state-title">Home works with the local workspace</h3>
          <p className="empty-state-text">
            The production attention queue reads the Project Operating Record. Connect this
            environment to your organization workspace, or open a project to continue.
          </p>
          <div className="flex gap-3 mt-4 justify-center">
            <Link href="/projects" className="btn btn-primary">Open projects <ArrowRight size={15} /></Link>
          </div>
        </div>
      </div>
    );
  }

  const firstName = workspace.settings.profile.firstName || "there";

  return (
    <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="min-w-0 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Production home</p>
          <h1 className="text-xl font-semibold text-[var(--ink)]">What needs attention, {firstName}?</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Every open loop across inquiries, proposals, revisions, deliveries, and the plan — from one record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={withWorkspaceQuery("/opportunities?compose=inquiry", demoSuffix)} className="btn btn-primary">
            <Plus size={15} /> New inquiry
          </Link>
          <Link href={withWorkspaceQuery("/projects/new", demoSuffix)} className="btn btn-secondary">
            <Plus size={15} /> New project
          </Link>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section aria-label="Attention queue" className="grid gap-2">
          {attention.length === 0 ? (
            <div className="empty-state" style={{ minHeight: 220 }}>
              <div className="empty-state-icon"><ClipboardList size={22} /></div>
              <h3 className="empty-state-title">Nothing waiting on you</h3>
              <p className="empty-state-text">Inquiries, approvals, revisions, and deadlines will land here as work moves.</p>
            </div>
          ) : (
            attention.map((item) => {
              const meta = KIND_META[item.kind];
              const Icon = meta.icon;
              return (
                <Link
                  key={item.id}
                  href={withWorkspaceQuery(item.href, demoSuffix)}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-3 hover:border-[var(--accent)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{item.detail}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{meta.label}</span>
                    {item.projectName ? (
                      <span className="block text-xs text-[var(--accent)]">{item.projectName}</span>
                    ) : null}
                  </span>
                </Link>
              );
            })
          )}
        </section>

        <aside className="grid content-start gap-4">
          <section aria-label="Projects by stage" className="rounded-lg border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Productions by stage</h2>
            <div className="mt-3 grid gap-2">
              {[...byStage.entries()].map(([stage, projects]) => (
                <div key={stage} className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {PROJECT_STAGE_META[stage].label}
                  </span>
                  <span className="text-right text-xs text-[var(--ink)]">
                    {projects.map((project, index) => (
                      <span key={project.id}>
                        {index > 0 ? " · " : ""}
                        <Link className="text-[var(--accent)]" href={withWorkspaceQuery(`/projects/${project.id}`, demoSuffix)}>
                          {project.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Recent activity" className="rounded-lg border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Recent activity</h2>
            <div className="mt-3 grid gap-2">
              {workspace.activity.slice(0, 5).map((item) => (
                <div key={item.id} className="min-w-0">
                  <p className="truncate text-xs text-[var(--ink)]">
                    <strong>{item.actor_name}</strong> {item.action.replaceAll("_", " ")}
                  </p>
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    {item.details.asset_title ?? item.details.project ?? item.details.title ?? ""}
                  </p>
                </div>
              ))}
              {workspace.activity.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No activity yet.</p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
