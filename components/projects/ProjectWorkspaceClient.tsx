"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { ArrowRight, LoaderCircle, SearchX } from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";
import {
  addDemoAssets,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import ProjectCockpit, { type CockpitUploadStatus } from "@/components/projects/ProjectCockpit";
import ProjectWorkspaceTabs from "@/components/projects/ProjectWorkspaceTabs";
import AssetUpload from "@/components/assets/AssetUpload";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import type { MediaAsset } from "@/components/projects/MediaCard";
import { putDemoMediaBlob } from "@/lib/demo/media-blob-store";
import { inspectSelectedMedia } from "@/lib/demo/media-inspection";
import { validateDemoUpload } from "@/lib/demo/upload-validation";
import { formatFileSize } from "@/lib/utils/media";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
}

interface Asset {
  id: string;
  project_id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  thumbnail_url: string | null;
  status: string;
  file_size: number | null;
  duration_seconds: number | null;
  created_at?: string;
  updated_at: string;
  version_count?: number;
  comments: { count: number }[];
  approvals: Array<{
    id: string;
    status: string;
    role_label?: string | null;
    assignee_email?: string | null;
    step_order?: number | null;
  }>;
  versions?: { count: number }[];
  href?: string;
}

export default function ProjectWorkspaceClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [remoteProject, setRemoteProject] = useState<Project | null>(null);
  const [remoteProjects, setRemoteProjects] = useState<Project[]>([]);
  const [remoteAssets, setRemoteAssets] = useState<Asset[]>([]);
  const [viewer, setViewer] = useState({ name: "Content Co-op", email: "" });
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<CockpitUploadStatus | null>(null);
  const demoProject = demoWorkspace.projects.find((candidate) => candidate.id === id);
  const project: Project | null = demoMode
    ? demoProject
      ? {
          ...demoProject,
          description: "Content review, versioning, approvals, and delivery.",
          status: "active",
          created_at: "2026-07-14T19:00:00.000Z",
        }
      : null
    : remoteProject;
  const cockpitAssets: MediaAsset[] = demoMode
    ? demoWorkspace.assets
        .filter((asset) => asset.project_id === id)
    : remoteAssets.map((asset) => ({
        id: asset.id,
        project_id: asset.project_id || id,
        title: asset.title,
        file_url: asset.file_url,
        thumbnail_url: asset.thumbnail_url ?? undefined,
        file_type: asset.file_type,
        duration_seconds: asset.duration_seconds ?? undefined,
        status: asset.status,
        version_count: asset.versions?.[0]?.count ?? asset.version_count,
        reviewer_count: asset.approvals?.length ?? 0,
        reviewer_done: asset.approvals?.filter((approval) => approval.status === "approved").length ?? 0,
        approval_records: asset.approvals ?? [],
        comment_count: asset.comments?.[0]?.count ?? 0,
        created_at: asset.created_at ?? asset.updated_at,
      }));
  const loading = demoMode ? false : remoteLoading;
  const authoritativeUploadInputId = `project-${id}-asset-upload`;

  useEffect(() => {
    if (!id || demoMode) return;
    const controller = new AbortController();
    let current = true;
    setRemoteLoading(true);
    setRemoteError("");
    setRemoteProject(null);
    setRemoteAssets([]);
    Promise.all([
      fetch(`/api/projects/${id}`, { cache: "no-store", signal: controller.signal }),
      fetch(`/api/projects/${id}/assets`, { cache: "no-store", signal: controller.signal }),
      fetch("/api/projects", { cache: "no-store", signal: controller.signal }),
      fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([projectResponse, assetsResponse, projectsResponse, sessionResponse]) => {
        if (!projectResponse.ok) throw new Error("Project could not be loaded.");
        const [projectPayload, assetsPayload, projectsPayload, sessionPayload] = await Promise.all([
          projectResponse.json(),
          assetsResponse.ok ? assetsResponse.json() : { items: [] },
          projectsResponse.ok ? projectsResponse.json() : { items: [] },
          sessionResponse.ok ? sessionResponse.json() : {},
        ]);
        if (!current) return;
        if (projectPayload.id !== id) throw new Error("Project response did not match the requested workspace.");
        setRemoteProject(projectPayload);
        setRemoteAssets(Array.isArray(assetsPayload.items) ? assetsPayload.items : []);
        const availableProjects = Array.isArray(projectsPayload.items) ? projectsPayload.items : [];
        setRemoteProjects(
          availableProjects.some((candidate: Project) => candidate.id === projectPayload.id)
            ? availableProjects
            : [projectPayload, ...availableProjects],
        );
        const session = sessionPayload as Record<string, unknown>;
        const email = typeof session.email === "string" ? session.email : "";
        const displayName = typeof session.name === "string" && session.name.trim()
          ? session.name.trim()
          : email.split("@")[0]?.replace(/[._-]+/g, " ") || "Content Co-op";
        setViewer({ name: displayName, email });
      })
      .catch((error) => {
        if (!current || error instanceof DOMException && error.name === "AbortError") return;
        setRemoteError(error instanceof Error ? error.message : "Project could not be loaded.");
      })
      .finally(() => {
        if (current) setRemoteLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [demoMode, id]);

  async function handleUpload(files: FileList | null) {
    if (!demoMode || !files || files.length === 0) return;
    setUploading(true);
    const selectedFiles = Array.from(files);
    const addedAssets: MediaAsset[] = [];
    let keepTerminalStatus = false;
    let activeFileName = selectedFiles[0]?.name ?? "Media";

    try {
      if (demoMode) {
        const uploadStartedAt = Date.now();
        const uploadAssets: MediaAsset[] = selectedFiles.map((file, index) => {
          const assetId = `local-upload-${uploadStartedAt}-${index}`;
          return {
            id: assetId,
            project_id: id,
            title: file.name.replace(/\.[^.]+$/, ""),
            file_type: "document",
            status: "draft",
            version_count: 1,
            reviewer_count: 0,
            reviewer_done: 0,
            comment_count: 0,
            created_at: new Date().toISOString(),
            href: buildInternalDemoAssetHref(id, assetId),
          };
        });

        for (const [index, file] of selectedFiles.entries()) {
          activeFileName = file.name;
          setUploadStatus({
            fileName: file.name,
            phase: "validating",
            progress: Math.round((index / selectedFiles.length) * 100),
            completed: index,
            total: selectedFiles.length,
            mode: "demo",
            message: `Checking ${formatFileSize(file.size)} against the accepted media types.`,
          });

          const validation = await validateDemoUpload(file, { allowDocuments: true });
          if (!validation.ok) {
            throw new Error(validation.reason);
          }

          const inspectionPromise = inspectSelectedMedia(file);
          const storageResult = await putDemoMediaBlob(uploadAssets[index].id, file, {
            onProgress: ({ bytesStored, bytesTotal, percent }) => {
              const overallProgress = Math.round(
                ((index + Math.min(percent, 96) / 100) / selectedFiles.length) * 100,
              );
              setUploadStatus({
                fileName: file.name,
                phase: "transferring",
                progress: overallProgress,
                completed: index,
                total: selectedFiles.length,
                mode: "demo",
                message: `Stored ${formatFileSize(bytesStored)} of ${formatFileSize(bytesTotal)} locally.`,
              });
            },
          });
          const inspection = await inspectionPromise;
          const asset = uploadAssets[index];
          asset.file_type = inspection.kind === "unknown" ? "document" : inspection.kind;
          if (inspection.duration.status === "available") {
            asset.duration_seconds = inspection.duration.seconds;
          }
          if (inspection.thumbnail.status === "available") {
            const thumbnailId = `${asset.id}-preview`;
            const thumbnailFile = new File(
              [inspection.thumbnail.blob],
              `${asset.id}-preview.jpg`,
              { type: inspection.thumbnail.mimeType },
            );
            await putDemoMediaBlob(thumbnailId, thumbnailFile);
            asset.demo_thumbnail_id = thumbnailId;
          }
          if (!storageResult.persistent) {
            setUploadStatus({
              fileName: file.name,
              phase: "transferring",
              progress: Math.round(((index + 0.96) / selectedFiles.length) * 100),
              completed: index,
              total: selectedFiles.length,
              mode: "demo",
              message:
                "Browser disk storage is unavailable, so this source will remain available for the current session only.",
            });
          }

          setUploadStatus({
            fileName: file.name,
            phase: "indexing",
            progress: Math.round(((index + 0.98) / selectedFiles.length) * 100),
            completed: index,
            total: selectedFiles.length,
            mode: "demo",
            message: "Registering this source in the project, version, and review records.",
          });
          addDemoAssets([asset]);
          addedAssets.push(asset);
        }

        setUploadStatus({
          fileName: selectedFiles.at(-1)?.name ?? "Media",
          phase: "complete",
          progress: 100,
          completed: selectedFiles.length,
          total: selectedFiles.length,
          mode: "demo",
          message: "The uploaded source is stored and ready to play in this project.",
          assetId: addedAssets.at(-1)?.id,
        });
        keepTerminalStatus = true;
        return;
      }

    } catch (uploadError) {
      keepTerminalStatus = true;
      setUploadStatus({
        fileName: activeFileName,
        phase: "error",
        progress: Math.round((addedAssets.length / selectedFiles.length) * 100),
        completed: addedAssets.length,
        total: selectedFiles.length,
        mode: demoMode ? "demo" : "production",
        message: uploadError instanceof Error
          ? uploadError.message
          : "Media ingest failed unexpectedly.",
      });
    } finally {
      setUploading(false);
      if (!keepTerminalStatus) setUploadStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function dismissUploadStatus() {
    setUploading(false);
    setUploadStatus(null);
    if (uploadStatus?.phase === "complete" && uploadStatus.assetId) {
      router.push(
        buildInternalDemoAssetHref(id, uploadStatus.assetId),
      );
    }
  }

  function refreshRemoteAssets() {
    void fetch(`/api/projects/${id}/assets`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { items?: Asset[] };
        setRemoteAssets(payload.items ?? []);
      })
      .catch(() => undefined);
  }

  if (loading) {
    return (
      <div className="project-state project-state--loading" aria-busy="true">
        <div className="project-state__topline">
          <CoProductionBrand
            variant="horizontal"
            label="Co-VideoPro by Content Co-op"
            priority
          />
          <span>
            <LoaderCircle size={13} aria-hidden="true" />
            Loading project cockpit
          </span>
        </div>
        <div className="project-state__layout" aria-hidden="true">
          <div className="project-state__rail">
            {[1, 2, 3, 4].map((item) => (
              <span key={item} />
            ))}
          </div>
          <div className="project-state__canvas">
            <span className="project-state__bar project-state__bar--wide" />
            <span className="project-state__video" />
            <span className="project-state__timeline" />
          </div>
          <div className="project-state__review">
            {[1, 2, 3].map((item) => (
              <span key={item} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-state project-state--empty">
        <div className="project-state__panel">
          <CoProductionBrand
            variant="stacked"
            label="Co-VideoPro by Content Co-op"
            priority
          />
          <div className="project-state__icon" aria-hidden="true">
            <SearchX size={18} />
          </div>
          <p className="project-state__eyebrow">Project unavailable</p>
          <h1>{remoteError || "This project cockpit is not available."}</h1>
          <p>
            Check the workspace link or return to the project list to continue
            review, upload, and approval work.
          </p>
          <Link
            href={demoMode ? "/projects?demo=1" : "/projects"}
            className="project-state__primary"
          >
            Back to projects
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  if (demoMode && demoProject) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*,.pdf,.doc,.docx"
          className="hidden"
          onChange={(event) => handleUpload(event.target.files)}
        />
        <ProjectWorkspaceTabs
          project={demoProject}
          assets={demoWorkspace.assets.filter((asset) => asset.project_id === id)}
          projects={demoWorkspace.projects}
          uploading={uploading}
          uploadStatus={uploadStatus}
          onUpload={() => fileInputRef.current?.click()}
          onUploadDismiss={dismissUploadStatus}
        />
      </>
    );
  }

  return (
    <>
      <ProjectCockpit
        project={{ id: project.id, name: project.name }}
        projects={remoteProjects.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
        assets={cockpitAssets}
        demoMode={false}
        viewer={viewer}
        uploading={false}
        uploadStatus={null}
        onUpload={() => document.getElementById(authoritativeUploadInputId)?.click()}
      />
      <AssetUpload
        projectId={id}
        inputId={authoritativeUploadInputId}
        variant="cockpit"
        onUploadComplete={refreshRemoteAssets}
      />
    </>
  );
}
