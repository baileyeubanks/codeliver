"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Clapperboard,
  FileVideo2,
  FolderPlus,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import styles from "./projects.module.css";

interface Project {
  id: string;
  name: string;
  stage?: string | null;
}

interface MediaAsset {
  id: string;
  project_id: string;
  title: string;
  file_type: string;
  status: string;
  created_at: string;
  href?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  version_count?: number;
  reviewer_count?: number;
  reviewer_done?: number;
  comment_count?: number;
}

type ProjectsLoadState =
  | { status: "loading" }
  | { status: "error"; responseStatus: number | null }
  | { status: "empty" }
  | { status: "success" };

type ProjectsPayload = { items?: unknown } | unknown[];
type AssetsPayload = { items?: unknown } | unknown[];

const REVIEW_READY_STATUSES = new Set(["in_review", "needs_changes", "approved", "final"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProject(value: unknown): value is Project {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.name === "string"
    && value.name.length > 0
    && (value.stage === undefined || value.stage === null || typeof value.stage === "string");
}

function isMediaAsset(value: unknown): value is MediaAsset {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.project_id === "string"
    && value.project_id.length > 0
    && typeof value.title === "string"
    && typeof value.file_type === "string"
    && typeof value.status === "string"
    && typeof value.created_at === "string"
    && Number.isFinite(Date.parse(value.created_at))
    && (value.href === undefined || typeof value.href === "string");
}

function payloadItems<T>(
  payload: ProjectsPayload | AssetsPayload,
  isItem: (value: unknown) => value is T,
): T[] | null {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "items" in payload
      ? (payload as { items?: unknown }).items
      : null;
  return Array.isArray(items) && items.every(isItem) ? items : null;
}

function stageLabel(stage?: string | null) {
  if (typeof stage !== "string" || !stage) return "In production";
  return stage
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ProjectsPage() {
  const demoMode = useDemoMode();
  const demoSuffix = useDemoSuffix();
  const searchParams = useSearchParams();
  const demoWorkspace = useDemoWorkspace();
  const [remoteProjects, setRemoteProjects] = useState<Project[]>([]);
  const [remoteAssets, setRemoteAssets] = useState<MediaAsset[]>([]);
  const [remoteLoadState, setRemoteLoadState] = useState<ProjectsLoadState>({ status: "loading" });

  const fixture = demoMode ? searchParams.get("projectsFixture") : null;
  const fixtureProjects = fixture === "empty" || fixture === "error" ? [] : demoWorkspace.projects;
  const fixtureAssets = fixture === "empty" || fixture === "error" ? [] : demoWorkspace.assets;
  const projects = (demoMode ? fixtureProjects : remoteProjects) as Project[];
  const assets = (demoMode ? fixtureAssets : remoteAssets) as MediaAsset[];
  const demoLoadState: ProjectsLoadState = fixture === "error"
    ? { status: "error", responseStatus: 503 }
    : projects.length === 0
      ? { status: "empty" }
      : { status: "success" };
  const loadState = demoMode ? demoLoadState : remoteLoadState;

  const loadRemoteProjects = useCallback(async () => {
    if (demoMode) return;

    try {
      const [projectsResponse, assetsResponse] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/assets", { cache: "no-store" }),
      ]);

      if (!projectsResponse.ok || !assetsResponse.ok) {
        const response = !projectsResponse.ok ? projectsResponse : assetsResponse;
        setRemoteLoadState({ status: "error", responseStatus: response.status });
        return;
      }

      const [projectsPayload, assetsPayload] = await Promise.all([
        projectsResponse.json() as Promise<ProjectsPayload>,
        assetsResponse.json() as Promise<AssetsPayload>,
      ]);
      const nextProjects = payloadItems(projectsPayload, isProject);
      const nextAssets = payloadItems(assetsPayload, isMediaAsset);
      if (!nextProjects || !nextAssets) {
        setRemoteLoadState({ status: "error", responseStatus: null });
        return;
      }
      setRemoteProjects(nextProjects);
      setRemoteAssets(nextAssets);
      setRemoteLoadState(nextProjects.length === 0 ? { status: "empty" } : { status: "success" });
    } catch {
      setRemoteLoadState({ status: "error", responseStatus: null });
    }
  }, [demoMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRemoteProjects();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadRemoteProjects]);


  const projectCards = useMemo(() => projects.map((project) => {
    const projectAssets = assets.filter((asset) => asset.project_id === project.id);
    return {
      ...project,
      assetCount: projectAssets.length,
      reviewReadyCount: projectAssets.filter((asset) => REVIEW_READY_STATUSES.has(asset.status)).length,
    };
  }), [assets, projects]);

  const recentAssets = useMemo(() => [...assets]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 6), [assets]);


  function retryProjects() {
    if (demoMode) {
      window.location.href = "/projects?demo=1";
      return;
    }
    setRemoteLoadState({ status: "loading" });
    void loadRemoteProjects();
  }

  return (
    <div className={`${styles.scope} projects-workspace`}>
      <div className="projects-content">
        <header className="projects-page-header">
          <div>
            <p className="projects-eyebrow">Production</p>
            <h1>Projects</h1>
          </div>
          <div className="projects-header-actions">
            <Link
              href={`/projects/new${demoSuffix}`}
              className="projects-action projects-primary-action"
              data-projects-action="true"
            >
              <Plus size={18} />
              New project
            </Link>
          </div>
        </header>

        {loadState.status === "loading" ? (
          <section className="projects-state projects-loading" data-projects-state="loading" aria-busy="true">
            <div className="projects-state-heading">
              <LoaderCircle size={20} />
              <span>Loading projects</span>
            </div>
            <div className="projects-loading-grid" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </section>
        ) : null}

        {loadState.status === "error" ? (
          <section className="projects-state projects-error" data-projects-state="error" role="alert">
            <span className="projects-state-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
            <div>
              <h2>Projects unavailable</h2>
              <p>Couldn’t load your projects{loadState.responseStatus ? ` · ${loadState.responseStatus}` : ""}.</p>
            </div>
            <button
              type="button"
              className="projects-action projects-primary-action"
              data-projects-action="true"
              onClick={retryProjects}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState.status === "empty" ? (
          <section className="projects-state projects-empty" data-projects-state="empty">
            <span className="projects-state-icon" aria-hidden="true"><FolderPlus size={22} /></span>
            <div>
              <h2>Create your first project</h2>
              <p>Start with the production workspace.</p>
            </div>
            <Link
              href={`/projects/new${demoSuffix}`}
              className="projects-action projects-primary-action"
              data-projects-action="true"
            >
              <Plus size={18} />
              New project
            </Link>
          </section>
        ) : null}

        {loadState.status === "success" ? (
          <>
            <section className="projects-section" aria-labelledby="project-list-heading">
              <div className="projects-section-heading">
                <div>
                  <h2 id="project-list-heading">All projects</h2>
                  <span>{projectCards.length}</span>
                </div>
                <Link
                  href={`/reviews${demoSuffix}`}
                  className="projects-text-action"
                  data-projects-action="true"
                >
                  Review queue <ArrowRight size={16} />
                </Link>
              </div>

              <div className="project-list" data-testid="project-list">
                {projectCards.map((project) => (
                  <article className="project-card" data-testid="project-card" key={project.id}>
                    <span className="project-card-mark" aria-hidden="true">
                      <BriefcaseBusiness size={20} />
                    </span>
                    <div className="project-card-copy">
                      <div className="project-card-title-row">
                        <h3>{project.name}</h3>
                        <span className="project-stage">{stageLabel(project.stage)}</span>
                      </div>
                      <div className="project-card-facts" aria-label={`${project.name} project activity`}>
                        <span><Clapperboard size={15} /> {project.assetCount} {project.assetCount === 1 ? "deliverable" : "deliverables"}</span>
                        <span>{project.reviewReadyCount} review-ready</span>
                      </div>
                    </div>
                    <Link
                      href={`/projects/${encodeURIComponent(project.id)}${demoSuffix}`}
                      className="projects-action project-open-action"
                      data-projects-action="true"
                      aria-label={`Open project ${project.name}`}
                    >
                      <span>Open project</span>
                      <ArrowRight size={18} />
                    </Link>
                  </article>
                ))}
              </div>
            </section>

            {recentAssets.length > 0 ? (
              <section className="projects-section projects-recent" aria-labelledby="recent-media-heading">
                <div className="projects-section-heading">
                  <div>
                    <h2 id="recent-media-heading">Recent media</h2>
                    <span>{recentAssets.length}</span>
                  </div>
                </div>
                <div className="projects-media-list">
                  {recentAssets.map((asset) => {
                    const projectName = projects.find((project) => project.id === asset.project_id)?.name ?? "Project";
                    return (
                      <Link
                        key={asset.id}
                        href={demoMode && asset.href
                          ? asset.href
                          : `/projects/${encodeURIComponent(asset.project_id)}/assets/${encodeURIComponent(asset.id)}${demoSuffix}`}
                        className="projects-media-row"
                        data-projects-action="true"
                      >
                        <span className="projects-media-icon" aria-hidden="true"><FileVideo2 size={19} /></span>
                        <span className="projects-media-copy">
                          <strong>{asset.title}</strong>
                          <small>{projectName}</small>
                        </span>
                        <span className="projects-media-status">{stageLabel(asset.status)}</span>
                        <ArrowRight size={17} />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        <div data-testid="projects-end" aria-hidden="true" />
      </div>
    </div>
  );
}
