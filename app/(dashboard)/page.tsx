"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { PROJECT_STAGE_META, PROJECT_STAGES, type ProjectStage } from "@/lib/covideopro/record.ts";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { withWorkspaceQuery } from "@/components/navigation/navigation-model";

interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: "inquiry" | "proposal" | "revision" | "deliverable" | "plan";
  projectName?: string;
}

const KIND_LABEL = {
  inquiry: "Inquiry",
  proposal: "Proposal",
  revision: "Revision",
  deliverable: "Delivery",
  plan: "Plan",
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
        id: `inquiry-${inquiry.id}`, kind: "inquiry",
        title: inquiry.summary.slice(0, 80),
        detail: `${org?.name ?? "Unassigned"} · ${inquiry.status === "new" ? "needs triage" : "triaged"}`,
        href: "/opportunities",
      });
    }
    for (const proposal of workspace.proposals.filter((candidate) => candidate.status === "sent")) {
      const project = workspace.projects.find((candidate) => candidate.id === proposal.project_id);
      items.push({
        id: `proposal-${proposal.id}`, kind: "proposal",
        title: proposal.title,
        detail: `v${proposal.version} awaits client approval`,
        href: `/projects/${proposal.project_id}?surface=proposal`,
        projectName: project?.name,
      });
    }
    for (const request of workspace.revisionRequests.filter((candidate) => candidate.status === "open" || candidate.status === "in_progress")) {
      const project = workspace.projects.find((candidate) => candidate.id === request.project_id);
      const asset = workspace.assets.find((candidate) => candidate.id === request.asset_id);
      items.push({
        id: `revision-${request.id}`, kind: "revision",
        title: `Round ${request.round} — ${asset?.title ?? request.asset_id}`,
        detail: request.summary.slice(0, 80),
        href: `/projects/${request.project_id}?surface=reviews`,
        projectName: project?.name,
      });
    }
    for (const deliverable of workspace.deliverables.filter((candidate) => candidate.status === "qc" || candidate.status === "encoding")) {
      const project = workspace.projects.find((candidate) => candidate.id === deliverable.project_id);
      items.push({
        id: `deliverable-${deliverable.id}`, kind: "deliverable",
        title: deliverable.name,
        detail: deliverable.status === "qc" ? "in QC" : "encoding",
        href: `/projects/${deliverable.project_id}?surface=delivery`,
        projectName: project?.name,
      });
    }
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);
    for (const item of workspace.planItems.filter((candidate) => candidate.status !== "done" && candidate.date)) {
      if (new Date(`${item.date}T00:00:00`) > horizon) continue;
      const project = workspace.projects.find((candidate) => candidate.id === item.project_id);
      items.push({
        id: `plan-${item.id}`, kind: "plan",
        title: item.title,
        detail: `${item.date}${item.assignee ? ` · ${item.assignee}` : ""}`,
        href: `/projects/${item.project_id}?surface=plan`,
        projectName: project?.name,
      });
    }
    return items;
  }, [demoMode, workspace]);

  const stageGroups = useMemo(() => {
    if (!demoMode) return [] as Array<{ stage: ProjectStage; projects: typeof workspace.projects }>;
    return PROJECT_STAGES
      .map((stage) => ({
        stage,
        projects: workspace.projects.filter((project) => (project.stage ?? "inquiry") === stage),
      }))
      .filter((group) => group.projects.length > 0);
  }, [demoMode, workspace]);

  const latestMedia = useMemo(() => {
    if (!demoMode) return [];
    return [...workspace.assets]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, 6);
  }, [demoMode, workspace]);

  if (!demoMode) {
    return (
      <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
        <div className="empty-state" style={{ minHeight: 320 }}>
          <h3 className="empty-state-title">Home works with the local workspace</h3>
          <p className="empty-state-text">Connect this environment to your organization workspace, or open a project to continue.</p>
          <div className="flex gap-3 mt-4 justify-center">
            <Link href="/projects" className="btn btn-primary">Open projects <ArrowRight size={15} /></Link>
          </div>
        </div>
      </div>
    );
  }

  const firstName = workspace.settings.profile.firstName || "there";

  return (
    <div className="projects-content flex-1 overflow-y-auto px-6 py-5">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[var(--ink)] text-pretty">What needs attention, {firstName}?</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {attention.length === 0 ? "Nothing waiting. The floor is yours." : `${attention.length} open loop${attention.length === 1 ? "" : "s"} across ${workspace.projects.length} productions.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={withWorkspaceQuery("/opportunities?compose=inquiry", demoSuffix)} className="btn btn-ghost"><Plus size={15} /> Inquiry</Link>
          <Link href={withWorkspaceQuery("/projects/new", demoSuffix)} className="btn btn-ghost"><Plus size={15} /> Project</Link>
        </div>
      </header>

      {/* Productions by stage — media cards, the films are the interface */}
      <section aria-label="Productions by stage" className="mb-7">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Productions by stage</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stageGroups.flatMap((group) =>
            group.projects.map((project) => {
              const media = workspace.assets.find((asset) => asset.project_id === project.id && asset.thumbnail_url)
                ?? workspace.assets.find((asset) => asset.project_id === project.id);
              const loops = attention.filter((item) => item.projectName === project.name).length;
              return (
                <Link
                  key={project.id}
                  href={withWorkspaceQuery(`/projects/${project.id}`, demoSuffix)}
                  className="cv-project-card group"
                >
                  <span className="cv-project-card__media">
                    {media?.thumbnail_url ? (
                      <Image src={media.thumbnail_url} alt="" fill sizes="(max-width: 640px) 100vw, 320px" unoptimized />
                    ) : (
                      <span className="cv-project-card__nomedia">No media yet</span>
                    )}
                    <span className="cv-project-card__stage">{PROJECT_STAGE_META[group.stage].label}</span>
                  </span>
                  <span className="cv-project-card__body">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-semibold text-[var(--ink)]">{project.name}</strong>
                      <small className="mt-0.5 block text-xs text-[var(--muted)]">
                        {media?.title ?? "No media yet"}
                      </small>
                    </span>
                    <span className="cv-project-card__meta">
                      {loops > 0 ? <i aria-label={`${loops} open loops`} /> : null}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              );
            }),
          )}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Needs you — quiet rows, no boxes */}
        <section aria-label="Attention queue">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Needs you</h2>
          <div className="cv-attention-list">
            {attention.slice(0, 6).map((item) => (
              <Link key={item.id} href={withWorkspaceQuery(item.href, demoSuffix)} className="cv-attention-row">
                <span className="cv-attention-row__kind">{KIND_LABEL[item.kind]}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--ink)]">{item.title}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{item.detail}</span>
                </span>
                {item.projectName ? <span className="cv-attention-row__project">{item.projectName}</span> : null}
              </Link>
            ))}
            {attention.length === 0 ? (
              <p className="py-6 text-sm text-[var(--muted)]">Nothing waiting on you. Inquiries, approvals, revisions, and deadlines land here.</p>
            ) : null}
            {attention.length > 6 ? (
              <Link href={withWorkspaceQuery("/activity", demoSuffix)} className="cv-attention-row cv-attention-row--more">
                All {attention.length} open loops <ArrowRight size={13} />
              </Link>
            ) : null}
          </div>
        </section>

        {/* Latest media — the content rail */}
        <section aria-label="Latest media">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Latest media</h2>
          <div className="cv-media-strip">
            {latestMedia.map((asset) => {
              const project = workspace.projects.find((candidate) => candidate.id === asset.project_id);
              return (
                <Link key={asset.id} href={withWorkspaceQuery(asset.href ?? `/projects/${asset.project_id}`, demoSuffix)} className="cv-media-thumb">
                  {asset.thumbnail_url ? (
                    <Image src={asset.thumbnail_url} alt={asset.title} fill sizes="160px" unoptimized />
                  ) : null}
                  <span className="cv-media-thumb__label">
                    <strong>{asset.title}</strong>
                    <small>{project?.name}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
