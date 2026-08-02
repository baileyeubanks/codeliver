"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useDemoMode } from "@/lib/demo/mode";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";
import {
  addDemoAssets,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import ProjectCockpit, { type CockpitUploadStatus } from "@/components/projects/ProjectCockpit";
import AssetUpload from "@/components/assets/AssetUpload";
import type { MediaAsset } from "@/components/projects/MediaCard";
import type { FolderNode } from "@/components/projects/FolderTree";
import { putDemoMediaBlob } from "@/lib/demo/media-blob-store";
import {
  navigationRoleForIdentity,
  useIdentityContext,
} from "@/components/auth/useIdentityContext";

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
  folder_id?: string | null;
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

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const identity = useIdentityContext(!demoMode);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [remoteProject, setRemoteProject] = useState<Project | null>(null);
  const [remoteProjects, setRemoteProjects] = useState<Project[]>([]);
  const [remoteAssets, setRemoteAssets] = useState<Asset[]>([]);
  const [remoteFolders, setRemoteFolders] = useState<FolderNode[]>([]);
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
        folder_id: asset.folder_id ?? null,
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
  const loading = demoMode ? false : remoteLoading || identity.loading;
  const authoritativeUploadInputId = `project-${id}-asset-upload`;

  useEffect(() => {
    if (!id || demoMode) return;
    const controller = new AbortController();
    let current = true;
    setRemoteLoading(true);
    setRemoteError("");
    setRemoteProject(null);
    setRemoteAssets([]);
    setRemoteFolders([]);
    Promise.all([
      fetch(`/api/projects/${id}`, { cache: "no-store", signal: controller.signal }),
      fetch(`/api/projects/${id}/assets`, { cache: "no-store", signal: controller.signal }),
      fetch(`/api/folders?project_id=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal }),
      fetch("/api/projects", { cache: "no-store", signal: controller.signal }),
      fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([projectResponse, assetsResponse, foldersResponse, projectsResponse, sessionResponse]) => {
        if (!projectResponse.ok) throw new Error("Project could not be loaded.");
        const [projectPayload, assetsPayload, foldersPayload, projectsPayload, sessionPayload] = await Promise.all([
          projectResponse.json(),
          assetsResponse.ok ? assetsResponse.json() : { items: [] },
          foldersResponse.ok ? foldersResponse.json() : { items: [] },
          projectsResponse.ok ? projectsResponse.json() : { items: [] },
          sessionResponse.ok ? sessionResponse.json() : {},
        ]);
        if (!current) return;
        if (projectPayload.id !== id) throw new Error("Project response did not match the requested workspace.");
        setRemoteProject(projectPayload);
        setRemoteAssets(Array.isArray(assetsPayload.items) ? assetsPayload.items : []);
        setRemoteFolders(Array.isArray(foldersPayload.items) ? foldersPayload.items : []);
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
    const wait = (milliseconds: number) =>
      new Promise((resolve) => window.setTimeout(resolve, milliseconds));

    try {
      if (demoMode) {
        const uploadStartedAt = Date.now();
        const added = selectedFiles.map((file, index) => {
          const assetId = `local-upload-${uploadStartedAt}-${index}`;
          return {
            id: assetId,
            project_id: id,
            title: file.name.replace(/\.[^.]+$/, ""),
            thumbnail_url: "/demo/refinery-sunset.jpg",
            file_type: file.type.startsWith("image/") ? "image" : "video",
            duration_seconds: file.type.startsWith("video/") ? 64 : undefined,
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
          const base = index / selectedFiles.length;
          const updatePhase = async (
            phase: CockpitUploadStatus["phase"],
            fraction: number,
            message: string,
            duration: number,
          ) => {
            setUploadStatus({
              fileName: file.name,
              phase,
              progress: Math.round((base + fraction / selectedFiles.length) * 100),
              completed: index,
              total: selectedFiles.length,
              mode: "demo",
              message,
            });
            await wait(duration);
          };

          await updatePhase(
            "validating",
            0.12,
            "Checking format, size, and review compatibility.",
            280,
          );
          await updatePhase(
            "transferring",
            0.35,
            "Registering the file in this local preview workspace.",
            320,
          );
          const storageResult = await putDemoMediaBlob(added[index].id, file);
          if (!storageResult.persistent) {
            setUploadStatus({
              fileName: file.name,
              phase: "transferring",
              progress: Math.round((base + 0.48 / selectedFiles.length) * 100),
              completed: index,
              total: selectedFiles.length,
              mode: "demo",
              message:
                "Browser disk storage is unavailable, so this source will remain available for the current session only.",
            });
            await wait(280);
          }
          await updatePhase(
            "proxy",
            0.68,
            "Preparing a browser-friendly review representation.",
            420,
          );
          await updatePhase(
            "indexing",
            0.92,
            "Adding the asset to search, activity, and project views.",
            300,
          );
        }

        addDemoAssets(added);
        setUploadStatus({
          fileName: selectedFiles.at(-1)?.name ?? "Media",
          phase: "complete",
          progress: 100,
          completed: selectedFiles.length,
          total: selectedFiles.length,
          mode: "demo",
          message: "The new asset is ready in this project.",
        });
        await wait(650);
        return;
      }

    } catch (uploadError) {
      setUploadStatus({
        fileName: selectedFiles.at(-1)?.name ?? "Media",
        phase: "error",
        progress: 0,
        completed: 0,
        total: selectedFiles.length,
        mode: demoMode ? "demo" : "production",
        message: uploadError instanceof Error ? uploadError.message : "Media ingest failed unexpectedly.",
      });
      await wait(1800);
    } finally {
      setUploading(false);
      setUploadStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      <div className="p-6 max-w-7xl mx-auto">
        <div className="skeleton h-8 w-48 mb-4 rounded-lg" />
        <div className="skeleton h-4 w-72 mb-8 rounded-lg" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-48 rounded-[var(--radius)]" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center py-20">
        <p className="text-[var(--muted)]">{remoteError || "Project not found"}</p>
        <Link href={demoMode ? "/projects?demo=1" : "/projects"} className="text-[var(--accent)] text-sm mt-2 inline-block">
          Back to projects
        </Link>
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
        <ProjectCockpit
          project={demoProject}
          assets={demoWorkspace.assets.filter((asset) => asset.project_id === id)}
          folders={demoWorkspace.folders}
          demoMode
          projects={demoWorkspace.projects}
          workspaceRole="owner"
          uploading={uploading}
          uploadStatus={uploadStatus}
          onUpload={() => fileInputRef.current?.click()}
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
        folders={remoteFolders}
        demoMode={false}
        viewer={viewer}
        workspaceRole={navigationRoleForIdentity(identity.context)}
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
