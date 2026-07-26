"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { PROJECT_STAGE_META, PROJECT_STAGES, type ProjectStage } from "@/lib/covideopro/record.ts";
import { deriveExceptions, type RecordException } from "@/lib/covideopro/exceptions.ts";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { withWorkspaceQuery } from "@/components/navigation/navigation-model";

const EXCEPTION_KIND_LABEL: Record<RecordException["kind"], string> = {
  release_unsigned: "Release",
  shots_unplanned: "Shot list",
  proposal_stale: "Proposal",
  revision_stale: "Revision",
  qc_stale: "Delivery",
  plan_overdue: "Plan",
};

function exceptionProjectId(exception: RecordException): string | null {
  return exception.repair.href.match(/\/projects\/([^/?]+)/)?.[1] ?? null;
}

export default function HomePage() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const demoSuffix = demoMode ? "?demo=1" : "";

  const exceptions = useMemo<RecordException[]>(() => {
    if (!demoMode) return [];
    const now = new Date();
    const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const ownerName = `${workspace.settings.profile.firstName} ${workspace.settings.profile.lastName}`.trim() || "Producer";
    return deriveExceptions(
      {
        releases: workspace.releases,
        productionDays: workspace.productionDays,
        shots: workspace.shots,
        proposals: workspace.proposals,
        revisionRequests: workspace.revisionRequests,
        deliverables: workspace.deliverables,
        planItems: workspace.planItems,
        ownerName,
      },
      fromDate,
    );
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
          <p className="empty-state-text">The exception rail reads the local Project Operating Record. Connect this environment to your organization workspace, or open a project to continue.</p>
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
            {exceptions.length === 0 ? "Quiet board — good day. The floor is yours." : `${exceptions.length} open loop${exceptions.length === 1 ? "" : "s"} across ${workspace.projects.length} productions.`}
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
              const loops = exceptions.filter((item) => exceptionProjectId(item) === project.id).length;
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
        {/* Exception rail — every row carries an owner and a repair verb */}
        <section aria-label="Attention queue">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Needs you</h2>
          <div className="cv-attention-list">
            {exceptions.slice(0, 6).map((item) => {
              const projectId = exceptionProjectId(item);
              const project = projectId ? workspace.projects.find((candidate) => candidate.id === projectId) : undefined;
              return (
                <Link
                  key={item.id}
                  href={withWorkspaceQuery(item.repair.href, demoSuffix)}
                  className="cv-attention-row"
                  data-severity={item.severity}
                  title={`${item.owner} — clears when: ${item.clearCondition}`}
                >
                  <span className="cv-attention-row__kind">{EXCEPTION_KIND_LABEL[item.kind]}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--ink)]">{item.title}</span>
                    <span className="block truncate text-xs text-[var(--muted)]">{item.detail} · {item.owner}</span>
                  </span>
                  {project ? <span className="cv-attention-row__project">{project.name}</span> : null}
                  <span className="cv-attention-row__verb">{item.repair.label}</span>
                </Link>
              );
            })}
            {exceptions.length === 0 ? (
              <p className="py-6 text-sm text-[var(--muted)]">Quiet board — good day. Exceptions land here when a promise starts to drift, and they clear only when the work changes state.</p>
            ) : null}
            {exceptions.length > 6 ? (
              <Link href={withWorkspaceQuery("/activity", demoSuffix)} className="cv-attention-row cv-attention-row--more">
                All {exceptions.length} open loops <ArrowRight size={13} />
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
