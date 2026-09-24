"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, LoaderCircle, SearchX } from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";
import {
  addDemoLocalMediaAsset,
  appendDemoMediaVersion,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import ProjectCockpit, { type CockpitUploadStatus } from "@/components/projects/ProjectCockpit";
import {
  resolveRevisionUploadTarget,
  shouldApplyRevisionUploadTarget,
  supersedeRevisionUploadRequest,
  type RevisionUploadTarget,
} from "@/lib/uploads/revision-upload";
import ProjectWorkspaceTabs from "@/components/projects/ProjectWorkspaceTabs";
import AssetUpload, { type UploadCompletion } from "@/components/assets/AssetUpload";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import type { WorkspaceRole } from "@/components/navigation/navigation-model";
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

type StorageReadinessFeaturePayload = {
  features?: {
    revisionUploads?: boolean;
  };
};

type DemoUploadTarget =
  | { kind: "new_asset" }
  | { kind: "revision"; assetId: string };

export default function ProjectWorkspaceClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<DemoUploadTarget>({ kind: "new_asset" });
  const [remoteProject, setRemoteProject] = useState<Project | null>(null);
  const [remoteProjects, setRemoteProjects] = useState<Project[]>([]);
  const [remoteAssets, setRemoteAssets] = useState<Asset[]>([]);
  const [viewer, setViewer] = useState({ name: "Content Co-op", email: "" });
  const [remoteRole, setRemoteRole] = useState<WorkspaceRole>("viewer");
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<CockpitUploadStatus | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<RevisionUploadTarget | null>(null);
  const [revisionUploadsAvailable, setRevisionUploadsAvailable] = useState(false);
  const revisionRequest = useRef(0);
  const activeProjectIdRef = useRef(id);
  activeProjectIdRef.current = id;
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

  const invalidateRemoteRevisionUpload = useCallback(() => {
    const supersession = supersedeRevisionUploadRequest(revisionRequest.current);
    revisionRequest.current = supersession.request;
    setRevisionTarget(null);
    setUploading(supersession.uploading);
    setUploadStatus(null);
  }, []);

  useEffect(() => {
    if (demoMode) return;
    invalidateRemoteRevisionUpload();
  }, [demoMode, id, invalidateRemoteRevisionUpload]);

  useEffect(() => {
    if (demoMode) {
      setRevisionUploadsAvailable(false);
      return;
    }
    const controller = new AbortController();
    setRevisionUploadsAvailable(false);
    void fetch("/api/storage/readiness", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => response.ok
        ? await response.json() as StorageReadinessFeaturePayload
        : {})
      .then((readinessPayload) => {
        if (controller.signal.aborted) return;
        setRevisionUploadsAvailable(readinessPayload.features?.revisionUploads === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRevisionUploadsAvailable(false);
      });
    return () => controller.abort();
  }, [demoMode, id]);

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
        if (!assetsResponse.ok) throw new Error("Project media could not be loaded. Please retry.");
        const [projectPayload, assetsPayload, projectsPayload, sessionPayload] = await Promise.all([
          projectResponse.json(),
          assetsResponse.json(),
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
        const role = session.workspace_role;
        if (role === "owner" || role === "producer" || role === "editor" || role === "reviewer" || role === "viewer") {
          setRemoteRole(role);
        }
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

  async function handleUpload(
    files: FileList | null,
    target: DemoUploadTarget = uploadTargetRef.current,
  ) {
    if (!demoMode || !files || files.length === 0) return;
    setUploading(true);
    const selectedFiles = Array.from(files);
    let completed = 0;
    let keepTerminalStatus = false;
    let activeFileName = selectedFiles[0]?.name ?? "Media";
    let completedAssetId: string | undefined;
    let completedVersionId: string | undefined;
    let completedVersionNumber: number | undefined;

    try {
      if (target.kind === "revision" && selectedFiles.length !== 1) {
        throw new Error("Choose one file for a replacement version.");
      }
      const uploadStartedAt = Date.now();

      for (const [index, file] of selectedFiles.entries()) {
        activeFileName = file.name;
        const assetId = target.kind === "revision"
          ? target.assetId
          : `local-upload-${uploadStartedAt}-${index}`;
        const versionId = target.kind === "revision"
          ? `local-version-${assetId}-${uploadStartedAt}`
          : `local-version-${assetId}`;
        setUploadStatus({
          fileName: file.name,
          phase: "validating",
          progress: Math.round((index / selectedFiles.length) * 100),
          completed: index,
          total: selectedFiles.length,
          mode: "demo",
          kind: target.kind,
          message: `Checking ${formatFileSize(file.size)} against the accepted media types.`,
        });

        const validation = await validateDemoUpload(file, { allowDocuments: true });
        if (!validation.ok) throw new Error(validation.reason);

        const inspectionPromise = inspectSelectedMedia(file);
        const storageResult = await putDemoMediaBlob(versionId, file, {
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
              kind: target.kind,
              message: `Stored ${formatFileSize(bytesStored)} of ${formatFileSize(bytesTotal)} locally.`,
            });
          },
        });
        const inspection = await inspectionPromise;
        const fileType = inspection.kind === "unknown" ? "document" : inspection.kind;
        const durationSeconds = inspection.duration.status === "available"
          ? inspection.duration.seconds
          : null;
        let thumbnailBlobId: string | null = null;
        if (inspection.thumbnail.status === "available") {
          thumbnailBlobId = `${versionId}-preview`;
          const thumbnailFile = new File(
            [inspection.thumbnail.blob],
            `${versionId}-preview.jpg`,
            { type: inspection.thumbnail.mimeType },
          );
          await putDemoMediaBlob(thumbnailBlobId, thumbnailFile);
        }
        if (!storageResult.persistent) {
          setUploadStatus({
            fileName: file.name,
            phase: "transferring",
            progress: Math.round(((index + 0.96) / selectedFiles.length) * 100),
            completed: index,
            total: selectedFiles.length,
            mode: "demo",
            kind: target.kind,
            message: "Browser disk storage is unavailable, so this cut remains available for the current session only.",
          });
        }

        setUploadStatus({
          fileName: file.name,
          phase: "indexing",
          progress: Math.round(((index + 0.98) / selectedFiles.length) * 100),
          completed: index,
          total: selectedFiles.length,
          mode: "demo",
          kind: target.kind,
          message: target.kind === "revision"
            ? "Binding this new cut to the selected media without moving prior review authority."
            : "Registering this new browser-local deliverable and its first review version.",
        });

        const result = target.kind === "revision"
          ? appendDemoMediaVersion({
              projectId: id,
              assetId,
              versionId,
              mediaBlobId: versionId,
              thumbnailBlobId,
              fileName: file.name,
              fileType,
              fileSize: file.size,
              durationSeconds,
            })
          : addDemoLocalMediaAsset({
              asset: {
                id: assetId,
                project_id: id,
                title: file.name.replace(/\.[^.]+$/, ""),
                file_type: fileType,
                status: "in_review",
                version_count: 1,
                reviewer_count: 0,
                reviewer_done: 0,
                comment_count: 0,
                duration_seconds: durationSeconds ?? undefined,
                demo_thumbnail_id: thumbnailBlobId ?? undefined,
                created_at: new Date().toISOString(),
                href: buildInternalDemoAssetHref(id, assetId),
              },
              versionId,
              mediaBlobId: versionId,
              thumbnailBlobId,
              fileName: file.name,
              fileType,
              fileSize: file.size,
              durationSeconds,
            });
        if (!result.ok) throw new Error(result.error);
        completed += 1;
        completedAssetId = result.asset.id;
        completedVersionId = result.version.id;
        completedVersionNumber = result.version.version_number;
      }

      setUploadStatus({
        fileName: selectedFiles.at(-1)?.name ?? "Media",
        phase: "complete",
        progress: 100,
        completed,
        total: selectedFiles.length,
        mode: "demo",
        kind: target.kind,
        assetId: completedAssetId,
        versionId: completedVersionId,
        versionNumber: completedVersionNumber,
        message: target.kind === "revision"
          ? "The new cut is stored locally and ready for its own review link."
          : "The browser-local deliverable is stored and ready to play in this project.",
      });
      keepTerminalStatus = true;
    } catch (uploadError) {
      keepTerminalStatus = true;
      setUploadStatus({
        fileName: activeFileName,
        phase: "error",
        progress: Math.round((completed / selectedFiles.length) * 100),
        completed,
        total: selectedFiles.length,
        mode: "demo",
        kind: target.kind,
        message: uploadError instanceof Error
          ? uploadError.message
          : "Media ingest failed unexpectedly.",
      });
    } finally {
      setUploading(false);
      uploadTargetRef.current = { kind: "new_asset" };
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

  function openDemoUploadPicker(target: DemoUploadTarget) {
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  }

  async function refreshRemoteAssets() {
    const response = await fetch(`/api/projects/${id}/assets`, {
      cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("File saved. The media list could not refresh. Reload this project to try again.");
    const payload = (await response.json()) as { items?: Asset[] };
    setRemoteAssets(payload.items ?? []);
  }

  function openRemoteUploadPicker() {
    // The native input must observe a cleared revision target in this same user
    // gesture, so a regular upload cannot inherit an older replacement target.
    flushSync(() => {
      invalidateRemoteRevisionUpload();
    });
    document.getElementById(authoritativeUploadInputId)?.click();
  }

  async function openRemoteRevisionPicker(assetId: string) {
    const projectId = id;
    const request = ++revisionRequest.current;
    setRevisionTarget(null);
    setUploading(true);
    setUploadStatus({
      fileName: "Replacement version",
      phase: "validating",
      progress: 0,
      completed: 0,
      total: 1,
      mode: "production",
      kind: "revision",
      message: "Confirming the selected media and its current version.",
    });
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error("The selected media is unavailable for a replacement version.");
      const target = resolveRevisionUploadTarget(await response.json(), projectId, assetId);
      if (!target) throw new Error("The selected media has no current version available to replace.");
      if (!shouldApplyRevisionUploadTarget({
        request,
        latestRequest: revisionRequest.current,
        requestedProjectId: projectId,
        activeProjectId: activeProjectIdRef.current,
      })) return;
      setRevisionTarget(target);
      setUploadStatus({
        fileName: "Replacement version",
        phase: "ready",
        progress: 0,
        completed: 0,
        total: 1,
        mode: "production",
        kind: "revision",
        message: "This media is still current. Choose one replacement file to continue.",
      });
    } catch (error) {
      if (!shouldApplyRevisionUploadTarget({
        request,
        latestRequest: revisionRequest.current,
        requestedProjectId: projectId,
        activeProjectId: activeProjectIdRef.current,
      })) return;
      setUploadStatus({
        fileName: "Replacement version",
        phase: "error",
        progress: 0,
        completed: 0,
        total: 1,
        mode: "production",
        kind: "revision",
        message: error instanceof Error ? error.message : "The selected media is unavailable for a replacement version.",
      });
    } finally {
      if (shouldApplyRevisionUploadTarget({
        request,
        latestRequest: revisionRequest.current,
        requestedProjectId: projectId,
        activeProjectId: activeProjectIdRef.current,
      })) setUploading(false);
    }
  }

  function chooseRemoteRevisionFile() {
    if (!revisionTarget || activeProjectIdRef.current !== id) return;
    setUploadStatus(null);
    document.getElementById(authoritativeUploadInputId)?.click();
  }

  function dismissRemoteUploadStatus() {
    invalidateRemoteRevisionUpload();
  }

  async function handleRemoteUploadComplete(completions: UploadCompletion[]) {
    await refreshRemoteAssets();
    const revision = completions.find((completion) => completion.revision);
    if (!revision) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("asset", revision.assetId);
    params.set("version", revision.versionId);
    params.set("view", "review");
    router.push(`/projects/${id}?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="project-state project-state--loading" aria-busy="true">
        <div className="project-state__topline">
          <CoProductionBrand
            variant="horizontal"
            label="Co‑VideoPro by Content Co-op"
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
            label="Co‑VideoPro by Content Co-op"
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
          onChange={(event) => void handleUpload(event.target.files, uploadTargetRef.current)}
        />
        <ProjectWorkspaceTabs
          project={demoProject}
          assets={demoWorkspace.assets.filter((asset) => asset.project_id === id)}
          projects={demoWorkspace.projects}
          uploading={uploading}
          uploadStatus={uploadStatus}
          onUpload={() => openDemoUploadPicker({ kind: "new_asset" })}
          onUploadRevision={(assetId) => openDemoUploadPicker({ kind: "revision", assetId })}
          onUploadDismiss={dismissUploadStatus}
          workspaceRole={demoWorkspace.session.role}
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
        workspaceRole={remoteRole}
        uploading={uploading}
        uploadStatus={uploadStatus}
        onUpload={openRemoteUploadPicker}
        onUploadRevision={openRemoteRevisionPicker}
        revisionUploadsAvailable={revisionUploadsAvailable}
        onUploadChooseRevisionFile={chooseRemoteRevisionFile}
        onUploadDismiss={dismissRemoteUploadStatus}
        onRefreshAssets={refreshRemoteAssets}
      />
      <AssetUpload
        projectId={id}
        inputId={authoritativeUploadInputId}
        variant="cockpit"
        onUploadComplete={handleRemoteUploadComplete}
        resumeScope={viewer.email}
        revisionTarget={revisionTarget}
      />
    </>
  );
}
