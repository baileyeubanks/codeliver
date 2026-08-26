import { PROJECT_STAGES } from "../covideopro/record.ts";

export type Project = {
  id: string;
  name: string;
  stage?: string;
};

export type MediaAsset = {
  id: string;
  project_id: string;
  title: string;
  file_type: string;
  status: string;
  created_at: string;
  href?: string;
};

type ProjectCollectionItem = Omit<Project, "stage"> & {
  stage?: string | null;
};

type MediaAssetCollectionItem = Omit<MediaAsset, "href"> & {
  href?: string | null;
};

export type ProjectsRemoteState =
  | { status: "loading" }
  | { status: "error"; responseStatus: number | null }
  | { status: "empty" }
  | { status: "success"; projects: Project[]; assets: MediaAsset[] };

type CollectionRequest = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

class ApiCollectionError extends Error {
  readonly status: number | null;

  constructor(resource: string, status: number | null) {
    super(`Invalid ${resource} response`);
    this.name = "ApiCollectionError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const SAFE_ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PROJECT_STAGE_SET = new Set<string>(PROJECT_STAGES);
const ASSET_FILE_TYPES = new Set(["video", "image", "audio", "document", "other"]);
const ASSET_STATUSES = new Set([
  "draft",
  "in_review",
  "approved",
  "needs_changes",
  "final",
  "processing",
  "ready",
  "failed",
]);

function isSafeEntityId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ENTITY_ID_PATTERN.test(value);
}

function isBoundedNonEmptyString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.trim().length <= maximumLength;
}

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isIsoTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]!
    && hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 23
    && offsetMinute <= 59;
}

function isNullableInternalProjectHref(
  value: unknown,
): value is string | null | undefined {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string"
    || !/^\/projects(?:[/?#]|$)/.test(value)
    || /%(?:25)*(?:2e|2f|5c)/i.test(value)) return false;

  try {
    const origin = "https://co-videopro.invalid";
    const href = new URL(value, origin);
    return href.origin === origin
      && (href.pathname === "/projects" || href.pathname.startsWith("/projects/"));
  } catch {
    return false;
  }
}

export function isProjectCollectionItem(
  value: unknown,
): value is ProjectCollectionItem {
  return isRecord(value)
    && isSafeEntityId(value.id)
    && isBoundedNonEmptyString(value.name, 240)
    && (value.stage === undefined
      || value.stage === null
      || (typeof value.stage === "string" && PROJECT_STAGE_SET.has(value.stage)));
}

export function normalizeProjectCollectionItem(
  value: ProjectCollectionItem,
): Project {
  return {
    id: value.id,
    name: value.name,
    ...(typeof value.stage === "string" ? { stage: value.stage } : {}),
  };
}

export function isMediaAssetCollectionItem(
  value: unknown,
): value is MediaAssetCollectionItem {
  return isRecord(value)
    && isSafeEntityId(value.id)
    && isSafeEntityId(value.project_id)
    && isBoundedNonEmptyString(value.title, 500)
    && typeof value.file_type === "string"
    && ASSET_FILE_TYPES.has(value.file_type)
    && typeof value.status === "string"
    && ASSET_STATUSES.has(value.status)
    && isIsoTimestamp(value.created_at)
    && isNullableInternalProjectHref(value.href);
}

export function normalizeMediaAssetCollectionItem(
  value: MediaAssetCollectionItem,
): MediaAsset {
  return {
    id: value.id,
    project_id: value.project_id,
    title: value.title,
    file_type: value.file_type,
    status: value.status,
    created_at: value.created_at,
    ...(typeof value.href === "string" ? { href: value.href } : {}),
  };
}

export function projectsStateFromCollections(
  projectItems: unknown,
  assetItems: unknown,
): ProjectsRemoteState {
  if (!Array.isArray(projectItems)
    || !projectItems.every(isProjectCollectionItem)
    || !Array.isArray(assetItems)
    || !assetItems.every(isMediaAssetCollectionItem)) {
    return { status: "error", responseStatus: null };
  }

  const projects = projectItems.map(normalizeProjectCollectionItem);
  const assets = assetItems.map(normalizeMediaAssetCollectionItem);
  const projectIds = new Set(projects.map((project) => project.id));
  const assetIds = new Set(assets.map((asset) => asset.id));
  if (projectIds.size !== projects.length
    || assetIds.size !== assets.length
    || assets.some((asset) => !projectIds.has(asset.project_id))) {
    return { status: "error", responseStatus: null };
  }

  return projects.length === 0
    ? { status: "empty" }
    : { status: "success", projects, assets };
}

async function readApiCollection<T>(
  response: Response,
  resource: string,
  isItem: (value: unknown) => value is T,
): Promise<T[]> {
  if (!response.ok) {
    throw new ApiCollectionError(resource, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiCollectionError(resource, null);
  }

  if (!isRecord(payload)
    || !Array.isArray(payload.items)
    || !payload.items.every(isItem)) {
    throw new ApiCollectionError(resource, null);
  }

  return payload.items;
}

export async function loadProjectsRemoteState(
  request: CollectionRequest = fetch,
): Promise<ProjectsRemoteState> {
  try {
    const [projectsResponse, assetsResponse] = await Promise.all([
      request("/api/projects", { cache: "no-store" }),
      request("/api/assets", { cache: "no-store" }),
    ]);
    const failedResponse = !projectsResponse.ok
      ? projectsResponse
      : !assetsResponse.ok
        ? assetsResponse
        : null;
    if (failedResponse) {
      return { status: "error", responseStatus: failedResponse.status };
    }

    const [projectItems, assetItems] = await Promise.all([
      readApiCollection(projectsResponse, "projects", isProjectCollectionItem),
      readApiCollection(assetsResponse, "assets", isMediaAssetCollectionItem),
    ]);
    return projectsStateFromCollections(projectItems, assetItems);
  } catch (error) {
    return {
      status: "error",
      responseStatus: error instanceof ApiCollectionError ? error.status : null,
    };
  }
}
