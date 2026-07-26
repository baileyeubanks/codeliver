/**
 * Files tab grouping for the project workspace (P24).
 *
 * The founder's six groups — briefs, scripts, brand assets, uploads, release
 * forms, exports — filled only from real records. Download links appear only
 * where a real file URL exists; everything else reads "Available on request",
 * and empty groups stay empty rather than performing inventory that isn't
 * on file.
 */

import { formatDateShort } from "./dates.ts";

export type ProjectFileGroupId =
  | "briefs"
  | "scripts"
  | "brand"
  | "uploads"
  | "releases"
  | "exports";

export type ProjectFileAvailability = "download" | "on_request";

export interface ProjectFileRow {
  id: string;
  name: string;
  detail: string;
  /** Real file URL; null means the row is request-only. */
  href: string | null;
  availability: ProjectFileAvailability;
}

export interface ProjectFileGroup {
  id: ProjectFileGroupId;
  label: string;
  emptyLabel: string;
  rows: ProjectFileRow[];
}

export interface GroupProjectFilesInput {
  briefs: readonly { id: string; version: number; status: string; updated_at: string }[];
  assets: readonly {
    id: string;
    title: string;
    file_url?: string | null;
    file_type?: string;
  }[];
  releases: readonly {
    id: string;
    person_name: string;
    status: string;
    file_url: string | null;
    signed_at?: string | null;
  }[];
  deliverables: readonly {
    id: string;
    name: string;
    status: string;
    delivered_at: string | null;
  }[];
}

function requestRow(row: Omit<ProjectFileRow, "href" | "availability">): ProjectFileRow {
  return { ...row, href: null, availability: "on_request" };
}

export function groupProjectFiles(input: GroupProjectFilesInput): ProjectFileGroup[] {
  const briefRows = [...input.briefs]
    .sort((a, b) => b.version - a.version)
    .map((brief) =>
      requestRow({
        id: brief.id,
        name: `Creative brief — v${brief.version}`,
        detail: `${brief.status.replaceAll("_", " ")} · updated ${formatDateShort(brief.updated_at)}`,
      }),
    );

  const uploadRows = input.assets.map((asset) =>
    asset.file_url
      ? {
          id: asset.id,
          name: asset.title,
          detail: asset.file_type ?? "media",
          href: asset.file_url,
          availability: "download" as const,
        }
      : requestRow({ id: asset.id, name: asset.title, detail: asset.file_type ?? "media" }),
    );

  const releaseRows = input.releases.map((release) =>
    requestRow({
      id: release.id,
      name: `Appearance release — ${release.person_name}`,
      detail:
        release.status === "signed"
          ? `Signed${release.signed_at ? ` ${formatDateShort(release.signed_at)}` : ""}`
          : release.status.replaceAll("_", " "),
    }),
  );

  const exportRows = input.deliverables.map((deliverable) =>
    requestRow({
      id: deliverable.id,
      name: deliverable.name,
      detail: deliverable.delivered_at
        ? `Delivered ${formatDateShort(deliverable.delivered_at)}`
        : deliverable.status.replaceAll("_", " "),
    }),
  );

  return [
    { id: "briefs", label: "Briefs", emptyLabel: "No briefs on file yet.", rows: briefRows },
    { id: "scripts", label: "Scripts", emptyLabel: "No scripts on file yet.", rows: [] },
    { id: "brand", label: "Brand assets", emptyLabel: "No brand assets on file yet.", rows: [] },
    { id: "uploads", label: "Uploads", emptyLabel: "No uploads on file yet.", rows: uploadRows },
    { id: "releases", label: "Release forms", emptyLabel: "No release forms on file.", rows: releaseRows },
    { id: "exports", label: "Exports", emptyLabel: "No exports yet.", rows: exportRows },
  ];
}
