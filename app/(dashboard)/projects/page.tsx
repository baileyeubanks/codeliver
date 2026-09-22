"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Clapperboard,
  FolderPlus,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import {
  loadProjectsRemoteState,
  projectsStateFromCollections,
  type ProjectsRemoteState,
} from "@/lib/api/projects-collection";
import {
  normalizeProjectsFixture,
  useReportProjectsAvailability,
} from "@/lib/api/projects-availability";
import styles from "./projects.module.css";

type ProjectsLoadState =
  | { status: "loading" }
  | { status: "error"; responseStatus: number | null }
  | { status: "empty" }
  | { status: "success" };

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
  const remoteLoadEpoch = useRef(0);
  const [demoRetrying, setDemoRetrying] = useState(false);
  const [remoteState, setRemoteState] = useState<ProjectsRemoteState>({
    status: "loading",
  });

  const fixture = normalizeProjectsFixture(
    demoMode ? searchParams.get("projectsFixture") : null,
  );
  const demoState = useMemo<ProjectsRemoteState>(() => {
    if (demoRetrying || fixture === "loading") return { status: "loading" };
    if (fixture === "error") return { status: "error", responseStatus: 503 };
    if (fixture === "empty") return { status: "empty" };
    return projectsStateFromCollections(
      demoWorkspace.projects,
      demoWorkspace.assets,
    );
  }, [demoRetrying, demoWorkspace.assets, demoWorkspace.projects, fixture]);
  const activeState = demoMode ? demoState : remoteState;
  const projects = useMemo(
    () => (activeState.status === "success" ? activeState.projects : []),
    [activeState],
  );
  const assets = useMemo(
    () => (activeState.status === "success" ? activeState.assets : []),
    [activeState],
  );
  const loadState: ProjectsLoadState =
    activeState.status === "success" ? { status: "success" } : activeState;
  const availabilityKey = demoMode ? `demo:${fixture ?? "default"}` : "remote";
  useReportProjectsAvailability(availabilityKey, loadState.status);

  const loadRemoteProjects = useCallback(async () => {
    if (demoMode) return;
    const loadEpoch = ++remoteLoadEpoch.current;
    const nextState = await loadProjectsRemoteState(fetch);
    if (loadEpoch !== remoteLoadEpoch.current) return;
    setRemoteState(nextState);
  }, [demoMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRemoteProjects();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      remoteLoadEpoch.current += 1;
    };
  }, [loadRemoteProjects]);

  useEffect(() => {
    if (!demoRetrying) return;
    const timeout = window.setTimeout(() => {
      window.location.href = "/projects?demo=1";
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [demoRetrying]);

  const projectCards = useMemo(
    () =>
      projects.map((project) => {
        const projectAssets = assets.filter(
          (asset) => asset.project_id === project.id,
        );
        return {
          ...project,
          assetCount: projectAssets.length,
        };
      }),
    [assets, projects],
  );

  function retryProjects() {
    if (demoMode) {
      setDemoRetrying(true);
      return;
    }
    setRemoteState({ status: "loading" });
    void loadRemoteProjects();
  }

  return (
    <div className={`${styles.scope} projects-workspace`}>
      <div className="projects-content">
        <header className="projects-page-header">
          <div>
            <h1>Projects</h1>
          </div>
          {loadState.status === "success" ? (
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
          ) : null}
        </header>

        {loadState.status === "loading" ? (
          <section
            className="projects-state projects-loading"
            data-projects-state="loading"
            aria-busy="true"
          >
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
          <section
            className="projects-state projects-error"
            data-projects-state="error"
            role="alert"
          >
            <span className="projects-state-icon" aria-hidden="true">
              <AlertTriangle size={22} />
            </span>
            <div>
              <h2>Projects unavailable</h2>
              <p>
                Couldn’t load your projects
                {loadState.responseStatus
                  ? ` · ${loadState.responseStatus}`
                  : ""}
                .
              </p>
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
          <section
            className="projects-state projects-empty"
            data-projects-state="empty"
          >
            <span className="projects-state-icon" aria-hidden="true">
              <FolderPlus size={22} />
            </span>
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
            <section
              className="projects-section"
              aria-label="Project list"
            >
              <div className="projects-section-heading">
                <div>
                  <p className="projects-count">
                    {projectCards.length} {projectCards.length === 1 ? "project" : "projects"}
                  </p>
                </div>
              </div>

              <div className="project-list" data-testid="project-list">
                {projectCards.map((project) => (
                  <article
                    className="project-card"
                    data-testid="project-card"
                    key={project.id}
                  >
                    <span className="project-card-mark" aria-hidden="true">
                      <BriefcaseBusiness size={20} />
                    </span>
                    <div className="project-card-copy">
                      <div className="project-card-title-row">
                        <h3>{project.name}</h3>
                        <span className="project-stage">
                          {stageLabel(project.stage)}
                        </span>
                      </div>
                      <div
                        className="project-card-facts"
                        aria-label={`${project.name} project activity`}
                      >
                        <span>
                          <Clapperboard size={15} /> {project.assetCount}{" "}
                          {project.assetCount === 1
                            ? "deliverable"
                            : "deliverables"}
                        </span>
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

          </>
        ) : null}

        <div data-testid="projects-end" aria-hidden="true" />
      </div>
    </div>
  );
}
