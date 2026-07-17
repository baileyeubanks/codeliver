import type { MediaAsset } from "@/components/projects/MediaCard";
import type { FolderNode } from "@/components/projects/FolderTree";
import type { ProjectStage } from "@/lib/covideopro/record.ts";

export interface DemoProject {
  id: string;
  name: string;
  /** Lifecycle stage of the Project Operating Record (docs/COVIDEOPRO_PRODUCT_MODEL.md). */
  stage?: ProjectStage;
  organization_id?: string | null;
  primary_contact_id?: string | null;
}

export function buildInternalDemoAssetHref(projectId: string, assetId: string) {
  return `/projects/${encodeURIComponent(projectId)}?demo=1&asset=${encodeURIComponent(assetId)}&view=review`;
}

export const demoProjects: DemoProject[] = [
  { id: "ica", name: "ICA", stage: "review", organization_id: "org-ica", primary_contact_id: "contact-morgan-ica" },
  { id: "schneider-epc", name: "Schneider + EPC", stage: "post", organization_id: "org-schneider", primary_contact_id: "contact-dana-schneider" },
  { id: "bp", name: "bp", stage: "production", organization_id: "org-bp", primary_contact_id: "contact-rachel-bp" },
  { id: "conexon", name: "Conexon", stage: "development", organization_id: "org-conexon", primary_contact_id: "contact-sam-conexon" },
];

export const demoFolders: FolderNode[] = [
  { id: "ica", name: "ICA", children: [] },
  {
    id: "schneider-epc",
    name: "Schneider + EPC",
    children: [
      { id: "schneider-roadshow", name: "Nashville Roadshow", children: [] },
      { id: "schneider-podcast", name: "McLaren Podcast", children: [] },
    ],
  },
  { id: "bp", name: "bp", children: [] },
  { id: "conexon", name: "Conexon", children: [] },
];

export const demoAssets: MediaAsset[] = [
  {
    id: "denie-mcdonald-v4",
    project_id: "ica",
    title: "Denie McDonald_v4",
    thumbnail_url: "/demo/ceraweek-speaker.jpg",
    file_type: "video",
    duration_seconds: 71,
    status: "in_review",
    version_count: 4,
    reviewer_count: 2,
    reviewer_done: 1,
    comment_count: 6,
    created_at: "2026-07-14T21:53:00.000Z",
    href: buildInternalDemoAssetHref("ica", "denie-mcdonald-v4"),
  },
  {
    id: "charles-drummond-v5",
    project_id: "ica",
    title: "Charles Drummond_v5",
    thumbnail_url: "/demo/crew-field-shoot.jpg",
    file_type: "video",
    duration_seconds: 70,
    status: "needs_changes",
    version_count: 5,
    reviewer_count: 2,
    reviewer_done: 1,
    comment_count: 3,
    created_at: "2026-07-14T21:52:00.000Z",
    href: buildInternalDemoAssetHref("ica", "charles-drummond-v5"),
  },
  {
    id: "kevin-bowers-v2",
    project_id: "ica",
    title: "Kevin Bowers_v2",
    thumbnail_url: "/demo/control-room.jpg",
    file_type: "video",
    duration_seconds: 72,
    status: "in_review",
    version_count: 2,
    reviewer_count: 1,
    reviewer_done: 0,
    comment_count: 2,
    created_at: "2026-07-14T21:40:00.000Z",
    href: buildInternalDemoAssetHref("ica", "kevin-bowers-v2"),
  },
  {
    id: "ica-roadshow-final",
    project_id: "ica",
    title: "ICA_ROADSHOW_x_FINAL",
    thumbnail_url: "/demo/refinery-sunset.jpg",
    file_type: "video",
    duration_seconds: 60,
    status: "approved",
    version_count: 5,
    reviewer_count: 2,
    reviewer_done: 2,
    comment_count: 9,
    created_at: "2026-03-08T16:12:00.000Z",
    href: buildInternalDemoAssetHref("ica", "ica-roadshow-final"),
  },
  {
    id: "mclaren-podcast-v3",
    project_id: "schneider-epc",
    title: "Schneider + McLaren Podcast_v3",
    thumbnail_url: "/demo/crew-field-shoot.jpg",
    file_url: "/demo/interview-source.mp4",
    file_type: "video",
    duration_seconds: 1482,
    status: "needs_changes",
    version_count: 3,
    reviewer_count: 3,
    reviewer_done: 1,
    comment_count: 14,
    created_at: "2026-07-13T18:15:00.000Z",
    href: buildInternalDemoAssetHref("schneider-epc", "mclaren-podcast-v3"),
  },
  {
    id: "epc-recap-v6",
    project_id: "schneider-epc",
    title: "SCHNEIDER_EPC_RECAP_v6",
    thumbnail_url: "/demo/control-room.jpg",
    file_type: "video",
    duration_seconds: 122,
    status: "approved",
    version_count: 6,
    reviewer_count: 3,
    reviewer_done: 3,
    comment_count: 11,
    created_at: "2026-07-11T20:10:00.000Z",
    href: buildInternalDemoAssetHref("schneider-epc", "epc-recap-v6"),
  },
  {
    id: "bp-rodeo-v2",
    project_id: "bp",
    title: "BP Rodeo Recap_v2",
    thumbnail_url: "/demo/refinery-sunset.jpg",
    file_type: "video",
    duration_seconds: 94,
    status: "in_review",
    version_count: 2,
    reviewer_count: 4,
    reviewer_done: 2,
    comment_count: 5,
    created_at: "2026-07-12T14:20:00.000Z",
    href: buildInternalDemoAssetHref("bp", "bp-rodeo-v2"),
  },
  {
    id: "conexon-workshop-v1",
    project_id: "conexon",
    title: "Conexon Workshop Interviews_v1",
    thumbnail_url: "/demo/crew-field-shoot.jpg",
    file_type: "video",
    duration_seconds: 912,
    status: "draft",
    version_count: 1,
    reviewer_count: 0,
    reviewer_done: 0,
    comment_count: 0,
    created_at: "2026-07-15T17:42:00.000Z",
    href: buildInternalDemoAssetHref("conexon", "conexon-workshop-v1"),
  },
];
