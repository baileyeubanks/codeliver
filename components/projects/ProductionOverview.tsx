"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type KeyboardEvent } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cloud,
  Cpu,
  FilePlus2,
  Gauge,
  ListFilter,
  MessageSquareText,
  Radio,
  Search,
  SlidersHorizontal,
  Upload,
  Users,
} from "lucide-react";
import { getMediaAssetHref, type MediaAsset } from "./MediaCard";
import type { DemoActivityItem } from "@/lib/demo/workspace-store";
import { formatActivityAction, formatActivitySubject } from "@/lib/activity-copy";
import styles from "./ProductionOverview.module.css";

interface OverviewProject {
  id: string;
  name: string;
}

interface ProductionOverviewProps {
  projects: OverviewProject[];
  assets: MediaAsset[];
  activity: DemoActivityItem[];
  firstName: string;
  demoMode: boolean;
  uploadProjectId: string;
  uploading: boolean;
  onUploadProjectChange: (projectId: string) => void;
  onUpload: () => void;
  onOpenProject: (projectId: string) => void;
}

type ProjectFilter = "all" | "review" | "changes" | "approved";
type MobileView = "projects" | "queue" | "pipeline";

const STATUS_DETAILS: Record<string, { label: string; tone: string; progress: number }> = {
  approved: { label: "Approved", tone: "approved", progress: 100 },
  final: { label: "Approved", tone: "approved", progress: 100 },
  in_review: { label: "In review", tone: "review", progress: 76 },
  needs_changes: { label: "Changes", tone: "changes", progress: 56 },
  draft: { label: "Draft", tone: "draft", progress: 28 },
};

const READINESS_EXPLANATION = "Estimated from the current review state of media in this project";

const FILTERS: Array<{ id: ProjectFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "review", label: "In review" },
  { id: "changes", label: "Changes" },
  { id: "approved", label: "Approved" },
];

const MOBILE_VIEW_ORDER: MobileView[] = ["projects", "queue", "pipeline"];

function timeAgo(iso: string) {
  const difference = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(difference / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CC";
}

function projectSummary(project: OverviewProject, assets: MediaAsset[]) {
  const projectAssets = assets.filter((asset) => asset.project_id === project.id);
  const sortedAssets = [...projectAssets].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  const latestAsset = sortedAssets[0] ?? null;
  const status = projectAssets.some((asset) => asset.status === "needs_changes")
    ? STATUS_DETAILS.needs_changes
    : projectAssets.some((asset) => asset.status === "in_review")
      ? STATUS_DETAILS.in_review
      : projectAssets.length > 0 && projectAssets.every((asset) => ["approved", "final"].includes(asset.status))
        ? STATUS_DETAILS.approved
        : STATUS_DETAILS.draft;
  const progress = projectAssets.length > 0
    ? Math.round(
        projectAssets.reduce(
          (total, asset) => total + (STATUS_DETAILS[asset.status] ?? STATUS_DETAILS.draft).progress,
          0,
        ) / projectAssets.length,
      )
    : 0;
  const reviewerCount = Math.max(0, ...projectAssets.map((asset) => asset.reviewer_count ?? 0));

  return { project, projectAssets, latestAsset, status, progress, reviewerCount };
}

function statusMatches(filter: ProjectFilter, tone: string) {
  if (filter === "all") return true;
  if (filter === "review") return tone === "review";
  if (filter === "changes") return tone === "changes";
  return tone === "approved";
}

function projectHref(projectId: string, demoMode: boolean) {
  const querySuffix = demoMode ? "?demo=1" : "";
  return "/projects/" + encodeURIComponent(projectId) + querySuffix;
}

function ProductionStatusStrip({
  assetCount,
  reviewCount,
  demoMode,
}: {
  assetCount: number;
  reviewCount: number;
  demoMode: boolean;
}) {
  const querySuffix = demoMode ? "?demo=1" : "";
  const settingsSuffix = demoMode ? "&demo=1" : "";

  return (
    <section className={styles.statusStrip} aria-label="Production system status">
      <Link href={`/settings?section=security${settingsSuffix}`}>
        <Radio size={15} aria-hidden="true" />
        <span><small>Connection</small><strong>{demoMode ? "Ready" : "Workspace"}</strong></span>
        <i data-online={demoMode ? "true" : "unknown"} />
      </Link>
      <Link href={`/settings?section=organization${settingsSuffix}`}>
        <Users size={15} aria-hidden="true" />
        <span><small>Collaborators</small><strong>{demoMode ? "3 demo" : "Manage"}</strong></span>
      </Link>
      <Link href={`/settings?section=security${settingsSuffix}`}>
        <Cpu size={15} aria-hidden="true" />
        <span><small>Media engine</small><strong>Standby</strong></span>
      </Link>
      <Link href={`/library${querySuffix}`}>
        <Cloud size={15} aria-hidden="true" />
        <span><small>Indexed media</small><strong>{assetCount} assets</strong></span>
      </Link>
      <Link href={`/reviews${querySuffix}`}>
        <Activity size={15} aria-hidden="true" />
        <span><small>Review queue</small><strong>{reviewCount} active</strong></span>
      </Link>
      <Link className={styles.openControls} href={`/settings?section=security${settingsSuffix}`}>
        <SlidersHorizontal size={16} aria-hidden="true" /> Studio controls
      </Link>
    </section>
  );
}

export default function ProductionOverview({
  projects,
  assets,
  activity,
  firstName,
  demoMode,
  uploadProjectId,
  uploading,
  onUploadProjectChange,
  onUpload,
  onOpenProject,
}: ProductionOverviewProps) {
  const querySuffix = demoMode ? "?demo=1" : "";
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [projectQuery, setProjectQuery] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("projects");
  const [uploadDestinationOpen, setUploadDestinationOpen] = useState(false);
  const uploadProject = projects.find((project) => project.id === uploadProjectId) ?? projects[0];

  const summaries = useMemo(
    () => projects.map((project) => projectSummary(project, assets)),
    [assets, projects],
  );
  const reviewCount = assets.filter((asset) => asset.status === "in_review").length;
  const changeCount = assets.filter((asset) => asset.status === "needs_changes").length;
  const approvedCount = assets.filter((asset) => ["approved", "final"].includes(asset.status)).length;
  const draftCount = assets.filter((asset) => asset.status === "draft").length;
  const decisionQueue = summaries.filter(({ status }) => ["review", "changes"].includes(status.tone));
  const filteredSummaries = summaries.filter(({ project, status }) =>
    statusMatches(projectFilter, status.tone)
    && project.name.toLocaleLowerCase().includes(projectQuery.trim().toLocaleLowerCase()),
  );
  const pipeline = [
    { label: "Plan", detail: "Briefs and source media", count: draftCount, tone: "blue" },
    { label: "Produce", detail: "Active revisions", count: changeCount, tone: "green" },
    { label: "Review", detail: "Client decisions", count: reviewCount, tone: "orange" },
    { label: "Deliver", detail: "Approved masters", count: approvedCount, tone: "purple" },
  ];
  const recentAssets = [...assets]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 4);

  function handleMobileTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: MobileView,
  ) {
    const currentIndex = MOBILE_VIEW_ORDER.indexOf(currentView);
    let nextView: MobileView | null = null;

    if (event.key === "ArrowRight") {
      nextView = MOBILE_VIEW_ORDER[(currentIndex + 1) % MOBILE_VIEW_ORDER.length];
    } else if (event.key === "ArrowLeft") {
      nextView = MOBILE_VIEW_ORDER[
        (currentIndex - 1 + MOBILE_VIEW_ORDER.length) % MOBILE_VIEW_ORDER.length
      ];
    } else if (event.key === "Home") {
      nextView = MOBILE_VIEW_ORDER[0];
    } else if (event.key === "End") {
      nextView = MOBILE_VIEW_ORDER[MOBILE_VIEW_ORDER.length - 1];
    }

    if (!nextView) return;
    event.preventDefault();
    setMobileView(nextView);
    document.getElementById(`mobile-${nextView}-tab`)?.focus();
  }

  return (
    <div className={styles.overview}>
      <div className={styles.desktopComposition}>
        <header className={styles.desktopHeader}>
          <div className={styles.titleBlock}>
            <span>Production workspace · {firstName || "Producer"}</span>
            <div>
              <h1>Projects</h1>
              <p>{projects.length} active workspaces · {decisionQueue.length} need a decision</p>
            </div>
          </div>

          <div className={styles.desktopActions}>
            <div className={styles.destinationPicker}>
              <span>Upload to</span>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={uploadDestinationOpen}
                onClick={() => setUploadDestinationOpen((open) => !open)}
              >
                <strong>{uploadProject?.name ?? "Select project"}</strong>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {uploadDestinationOpen ? (
                <div className={styles.destinationMenu} role="listbox" aria-label="Upload media destination">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      role="option"
                      aria-selected={project.id === uploadProjectId}
                      onClick={() => {
                        onUploadProjectChange(project.id);
                        setUploadDestinationOpen(false);
                      }}
                    >
                      <span>{project.name}</span>
                      {project.id === uploadProjectId ? <Check size={14} aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button className={styles.secondaryAction} type="button" onClick={onUpload} disabled={uploading || projects.length === 0}>
              <Upload size={16} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload"}
            </button>
            <Link className={styles.primaryAction} href={`/projects/new${querySuffix}`}>
              <FilePlus2 size={16} aria-hidden="true" /> New project
            </Link>
          </div>
        </header>

        <ProductionStatusStrip assetCount={assets.length} reviewCount={decisionQueue.length} demoMode={demoMode} />

        <div className={styles.desktopGrid}>
          <main className={styles.portfolio}>
            <section className={styles.projectSurface} aria-labelledby="desktop-projects-title">
              <header className={styles.projectToolbar}>
                <div>
                  <span>Portfolio</span>
                  <h2 id="desktop-projects-title">Active projects</h2>
                </div>
                <div className={styles.toolbarControls}>
                  <div className={styles.segmentedControl} aria-label="Filter projects">
                    {FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        data-active={projectFilter === filter.id ? "true" : "false"}
                        aria-pressed={projectFilter === filter.id}
                        onClick={() => setProjectFilter(filter.id)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <label className={styles.searchField}>
                    <span className="sr-only">Search projects</span>
                    <Search size={15} aria-hidden="true" />
                    <input
                      value={projectQuery}
                      onChange={(event) => setProjectQuery(event.target.value)}
                      placeholder="Search projects"
                    />
                  </label>
                </div>
              </header>

              <div className={styles.projectTableWrap}>
                <table className={styles.projectTable}>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Status</th>
                      <th title={READINESS_EXPLANATION}>Est. readiness</th>
                      <th>Updated</th>
                      <th>Reviewers</th>
                      <th aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummaries.map(({ project, projectAssets, latestAsset, status, progress, reviewerCount }, projectIndex) => (
                      <tr key={project.id}>
                        <td>
                          <button className={styles.projectIdentity} type="button" onClick={() => onOpenProject(project.id)}>
                            <span className={styles.projectThumb}>
                              {latestAsset?.thumbnail_url ? (
                                <Image
                                  src={latestAsset.thumbnail_url}
                                  alt=""
                                  fill
                                  sizes="56px"
                                  loading={projectIndex === 0 ? "eager" : "lazy"}
                                  fetchPriority={projectIndex === 0 ? "high" : "auto"}
                                  unoptimized
                                />
                              ) : (
                                <FilePlus2 size={16} aria-hidden="true" />
                              )}
                            </span>
                            <span><strong>{project.name}</strong><small>{projectAssets.length} media items</small></span>
                          </button>
                        </td>
                        <td><span className={`${styles.status} ${styles[status.tone]}`}>{status.label}</span></td>
                        <td>
                          <div className={styles.progressCell} title={READINESS_EXPLANATION}>
                            <span><i style={{ width: `${progress}%` }} /></span>
                            <small>{progress}% est.</small>
                          </div>
                        </td>
                        <td>{latestAsset ? timeAgo(latestAsset.created_at) : "Not started"}</td>
                        <td><span className={styles.reviewerCount}><Users size={14} aria-hidden="true" /> {reviewerCount}</span></td>
                        <td>
                          <span className={styles.rowAction} aria-hidden="true">
                            <ArrowRight size={15} aria-hidden="true" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredSummaries.length === 0 ? (
                  <div className={styles.emptyState}>
                    <ListFilter size={18} aria-hidden="true" />
                    <strong>No projects match this view</strong>
                    <button type="button" onClick={() => { setProjectFilter("all"); setProjectQuery(""); }}>Clear filters</button>
                  </div>
                ) : null}
              </div>
            </section>

            <section className={styles.pipelineSurface} aria-labelledby="desktop-pipeline-title">
              <header>
                <div><span>Lifecycle</span><h2 id="desktop-pipeline-title">Production pipeline</h2></div>
                <Link href={`/reviews${querySuffix}`}>Open review queue <ArrowRight size={13} aria-hidden="true" /></Link>
              </header>
              <ol>
                {pipeline.map((stage, index) => (
                  <li key={stage.label}>
                    <i data-tone={stage.tone}>{index + 1}</i>
                    <span><strong>{stage.label}</strong><small>{stage.detail}</small></span>
                    <b>{stage.count}</b>
                    {index < pipeline.length - 1 ? <ArrowRight size={14} aria-hidden="true" /> : null}
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.recentMediaSurface} aria-labelledby="desktop-recent-media-title">
              <header>
                <div><span>Recent media</span><h2 id="desktop-recent-media-title">Latest versions</h2></div>
                <Link href={`/library${querySuffix}`}>Open library <ArrowRight size={13} aria-hidden="true" /></Link>
              </header>
              <div className={styles.recentMediaGrid}>
                {recentAssets.map((asset, assetIndex) => {
                  const project = projects.find((item) => item.id === asset.project_id);
                  const status = STATUS_DETAILS[asset.status] ?? STATUS_DETAILS.draft;
                  return (
                    <Link key={asset.id} href={getMediaAssetHref(asset, demoMode)}>
                      <span className={styles.recentMediaThumb}>
                        {asset.thumbnail_url ? (
                          <Image
                            src={asset.thumbnail_url}
                            alt=""
                            fill
                            sizes="76px"
                            loading={assetIndex === 0 ? "eager" : "lazy"}
                            fetchPriority={assetIndex === 0 ? "high" : "auto"}
                            unoptimized
                          />
                        ) : (
                          <FilePlus2 size={16} aria-hidden="true" />
                        )}
                      </span>
                      <span className={styles.recentMediaCopy}>
                        <strong>{asset.title}</strong>
                        <small>{project?.name ?? "Project media"}</small>
                      </span>
                      <span className={styles.recentMediaMeta}>
                        <em className={`${styles.status} ${styles[status.tone]}`}>{status.label}</em>
                        <small>v{asset.version_count ?? 1} · {timeAgo(asset.created_at)}</small>
                      </span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  );
                })}
                {recentAssets.length === 0 ? <p className={styles.mutedEmpty}>No media has been added yet.</p> : null}
              </div>
            </section>
          </main>

          <aside className={styles.contextRail} aria-label="Project context">
            <section className={styles.contextSection}>
              <header>
                <div><Activity size={15} aria-hidden="true" /><strong>Live activity</strong></div>
                <Link href={`/activity${querySuffix}`}>View all</Link>
              </header>
              <div className={styles.activityList}>
                {activity.slice(0, 5).map((item) => (
                  <Link href={`/activity${querySuffix}`} key={item.id}>
                    <span>{initials(item.actor_name)}</span>
                    <div>
                      <strong>{item.actor_name} {formatActivityAction(item.action)}</strong>
                      <small>{formatActivitySubject(item.details) || "Workspace activity"} · {timeAgo(item.created_at)}</small>
                    </div>
                  </Link>
                ))}
                {activity.length === 0 ? <p className={styles.mutedEmpty}>No recent activity.</p> : null}
              </div>
            </section>

            <section className={styles.contextSection}>
              <header>
                <div><MessageSquareText size={15} aria-hidden="true" /><strong>Decision queue</strong></div>
                <span>{decisionQueue.length}</span>
              </header>
              <div className={styles.decisionList}>
                {decisionQueue.slice(0, 3).map(({ project, latestAsset, status }) => (
                  <Link
                    key={project.id}
                    href={latestAsset ? getMediaAssetHref(latestAsset, demoMode) : projectHref(project.id, demoMode)}
                  >
                    <span className={`${styles.queueDot} ${styles[status.tone]}`} />
                    <span><strong>{project.name}</strong><small>{latestAsset?.title ?? "Review workspace"}</small></span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ))}
                {decisionQueue.length === 0 ? <p className={styles.mutedEmpty}>No decisions are waiting.</p> : null}
              </div>
            </section>

            <Link
              className={styles.systemSummary}
              href={`/settings?section=security${demoMode ? "&demo=1" : ""}`}
            >
              <Gauge size={17} aria-hidden="true" />
              <span><strong>Workspace authority</strong><small>{demoMode ? "Local demo · inspect readiness" : "Inspect readiness and permissions"}</small></span>
              <SlidersHorizontal size={15} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </div>

      <div className={styles.mobileComposition}>
        <header className={styles.mobileHeader}>
          <div>
            <span>Production workspace</span>
            <h1>Projects</h1>
            <p>{projects.length} active · {decisionQueue.length} need attention</p>
          </div>
          <div>
            <button type="button" onClick={onUpload} disabled={uploading || projects.length === 0} aria-label="Upload media">
              <Upload size={17} aria-hidden="true" />
            </button>
            <Link href={`/projects/new${querySuffix}`} aria-label="Create project"><FilePlus2 size={17} aria-hidden="true" /></Link>
          </div>
        </header>

        <ProductionStatusStrip assetCount={assets.length} reviewCount={decisionQueue.length} demoMode={demoMode} />

        <div className={styles.mobileSegmented} role="tablist" aria-label="Project views">
          {([
            ["projects", "Projects", filteredSummaries.length],
            ["queue", "Queue", decisionQueue.length],
            ["pipeline", "Pipeline", 4],
          ] as Array<[MobileView, string, number]>).map(([id, label, count]) => (
            <button
              key={id}
              id={`mobile-${id}-tab`}
              type="button"
              role="tab"
              aria-controls={`mobile-${id}-panel`}
              aria-selected={mobileView === id}
              tabIndex={mobileView === id ? 0 : -1}
              data-active={mobileView === id ? "true" : "false"}
              onClick={() => setMobileView(id)}
              onKeyDown={(event) => handleMobileTabKeyDown(event, id)}
            >
              {label}<span>{count}</span>
            </button>
          ))}
        </div>

        <div
          id="mobile-projects-panel"
          className={styles.mobileView}
          role="tabpanel"
          aria-labelledby="mobile-projects-tab"
          hidden={mobileView !== "projects"}
        >
          <div className={styles.mobileProjectList}>
            {filteredSummaries.map(({ project, projectAssets, latestAsset, status, progress, reviewerCount }, projectIndex) => (
              <button key={project.id} type="button" onClick={() => onOpenProject(project.id)}>
                <span className={styles.mobileThumb}>
                  {latestAsset?.thumbnail_url ? (
                    <Image
                      src={latestAsset.thumbnail_url}
                      alt=""
                      fill
                      sizes="62px"
                      loading={projectIndex === 0 ? "eager" : "lazy"}
                      fetchPriority={projectIndex === 0 ? "high" : "auto"}
                      unoptimized
                    />
                  ) : (
                    <FilePlus2 size={16} aria-hidden="true" />
                  )}
                </span>
                <span className={styles.mobileProjectCopy}>
                  <span><strong>{project.name}</strong><em className={`${styles.status} ${styles[status.tone]}`}>{status.label}</em></span>
                  <small>{projectAssets.length} media · {reviewerCount} reviewers · {latestAsset ? timeAgo(latestAsset.created_at) : "not started"}</small>
                  <span className={styles.mobileProgress} title={READINESS_EXPLANATION} aria-label={`${progress}% estimated readiness`}><i style={{ width: `${progress}%` }} /></span>
                </span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
            {filteredSummaries.length === 0 ? (
              <div className={styles.mobileEmpty}>
                <strong>{projects.length === 0 ? "No projects yet" : "No projects match this view"}</strong>
                {projects.length === 0 ? (
                  <Link href={`/projects/new${querySuffix}`}>Create a project</Link>
                ) : (
                  <button type="button" onClick={() => { setProjectFilter("all"); setProjectQuery(""); }}>Clear filters</button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div
          id="mobile-queue-panel"
          className={styles.mobileView}
          role="tabpanel"
          aria-labelledby="mobile-queue-tab"
          hidden={mobileView !== "queue"}
        >
          <div className={styles.mobileQueue}>
            {decisionQueue.map(({ project, latestAsset, status }) => (
              <Link
                key={project.id}
                href={latestAsset ? getMediaAssetHref(latestAsset, demoMode) : projectHref(project.id, demoMode)}
              >
                <span className={`${styles.queueDot} ${styles[status.tone]}`} />
                <span><strong>{project.name}</strong><small>{latestAsset?.title ?? "Review workspace"}</small></span>
                <em>{status.label}</em>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
            {decisionQueue.length === 0 ? <div className={styles.mobileEmpty}><CheckCircle2 size={20} /><strong>Review queue is clear</strong></div> : null}
          </div>
        </div>

        <div
          id="mobile-pipeline-panel"
          className={styles.mobileView}
          role="tabpanel"
          aria-labelledby="mobile-pipeline-tab"
          hidden={mobileView !== "pipeline"}
        >
          <div className={styles.mobilePipeline}>
            {pipeline.map((stage, index) => (
              <Link key={stage.label} href={stage.label === "Review" ? `/reviews${querySuffix}` : `/projects${querySuffix}`}>
                <i data-tone={stage.tone}>{index + 1}</i>
                <span><strong>{stage.label}</strong><small>{stage.detail}</small></span>
                <b>{stage.count}</b>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>

        <footer className={styles.mobileFooter}>
          <span><Clock3 size={14} aria-hidden="true" /> Updated from this workspace</span>
          <Link href={`/settings?section=security${demoMode ? "&demo=1" : ""}`}><SlidersHorizontal size={14} /> Controls</Link>
        </footer>
      </div>

    </div>
  );
}
