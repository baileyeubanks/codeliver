import type { DemoWorkspaceState } from "./workspace-store";

export interface SourceCatalog {
  imported_at: string;
  contacts?: Array<{ id: string; name: string; documented_role: string; project_ids: string[] }>;
  review_notes?: Array<{ id: string; project_id: string; media_title: string; reviewer: string; timecode: string | null; note: string; source_label: string; status_at_source: string }>;
  projects: Array<{ id: string; name: string; summary?: string; source_label?: string }>;
  assets: Array<{
    id: string; project_id: string; title: string; bytes: number;
    duration_seconds: number; width: number; height: number; frame_rate?: number;
    created_at: string; source_label?: string; has_poster?: boolean;
  }>;
}

/** Only the explicitly configured local preview receives this catalog. */
export function parseSourceCatalog(raw: string | undefined): SourceCatalog | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SourceCatalog;
    if (!Array.isArray(value.projects) || !Array.isArray(value.assets) || !value.imported_at) return null;
    if (!value.projects.length || !value.projects.every((project) => /^[a-z0-9-]+$/.test(project.id) && project.name)) return null;
    const projects = new Set(value.projects.map((project) => project.id));
    if (!value.assets.every((asset) => /^[a-z0-9-]+$/.test(asset.id) && projects.has(asset.project_id)
      && asset.title && Number.isFinite(asset.duration_seconds) && asset.bytes > 0)) return null;
    return value;
  } catch { return null; }
}

export const sourceCatalog = process.env.NODE_ENV !== "production"
  ? parseSourceCatalog(process.env.NEXT_PUBLIC_CVP_SOURCE_CATALOG) : null;

export function sourceMediaUrl(id: string, poster = false): string {
  return `/api/demo/source-media/${encodeURIComponent(id)}?demo=1${poster ? "&poster=1" : ""}`;
}

/** Source workspaces never hydrate an illustrative or earlier catalog payload.
 * New user notes and boards persist only within this exact source catalog. */
export function serializeSourceWorkspace(state: DemoWorkspaceState, catalog: SourceCatalog | null): string {
  return JSON.stringify(catalog ? { source_catalog: JSON.stringify(catalog), workspace: state } : state);
}

export function unwrapSourceWorkspace(value: unknown, catalog: SourceCatalog | null): unknown {
  if (!catalog) return value;
  if (!value || typeof value !== "object" || !("source_catalog" in value) || !("workspace" in value)) return null;
  return value.source_catalog === JSON.stringify(catalog) ? value.workspace : null;
}

export function sourceWorkspace(base: DemoWorkspaceState, catalog: SourceCatalog): DemoWorkspaceState {
  // Clear every fixture collection, including invented approvals, contacts,
  // billing, tasks, comments and metrics. Source records are added explicitly.
  const empty = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Array.isArray(value) ? [] : value])) as unknown as DemoWorkspaceState;
  const record = { created_at: catalog.imported_at, updated_at: catalog.imported_at, created_by: "local-source-import" };
  return {
    ...empty,
    session: { ...base.session, email: "", lastSignedInAt: catalog.imported_at },
    projects: catalog.projects.map((project) => ({ id: project.id, name: project.name, organization_id: "org-schneider", primary_contact_id: null, stage: "post" })),
    folders: catalog.projects.map((project) => ({ id: project.id, name: project.name, children: [] })),
    organizations: [{ ...record, id: "org-schneider", name: "Schneider Electric", industry: null, website: null, notes: "Imported from the Schneider Electric project archive. Local source workspace." }],
    contacts: (catalog.contacts ?? []).map((contact) => ({ ...record, id: contact.id, organization_id: "org-schneider", name: contact.name, email: "", role: contact.documented_role, is_primary: false })),
    assets: catalog.assets.map((asset) => ({
      id: asset.id, project_id: asset.project_id, title: asset.title,
      file_url: sourceMediaUrl(asset.id), ...(asset.has_poster ? { thumbnail_url: sourceMediaUrl(asset.id, true) } : {}),
      file_type: "video", duration_seconds: asset.duration_seconds,
      status: "draft", version_count: 1, reviewer_count: 0, reviewer_done: 0, comment_count: 0,
      created_at: asset.created_at, href: `/projects/${asset.project_id}?demo=1&asset=${asset.id}&view=review`,
    })),
    whiteboardBoards: catalog.projects.map((project) => ({
      id: `source-board-${project.id}`, project_id: project.id, edges: [],
      template_id: null, updated_at: catalog.imported_at,
      nodes: [{ id: `source-context-${project.id}`, kind: "card", phase: "post", title: project.name,
        body: [project.summary, project.source_label ? `Source: ${project.source_label}` : "Local Schneider project archive", "Imported files are not evidence of client approval."].filter(Boolean).join("\n\n"),
        x: 640, y: 224, width: 280, height: 232 }],
    })),
  };
}
