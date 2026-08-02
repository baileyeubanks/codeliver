export const BRAND_GOVERNANCE_SCHEMA_VERSION = 2 as const;
export const BRAND_GOVERNANCE_STORAGE_KEY = "co-deliver.brand-governance.v2";

export type BrandScope = "platform" | "organization" | "workspace";
export type BrandRevisionStatus = "draft" | "published" | "archived";
export type BrandLogoPath =
  | "/brand/co-videopro-color-supplied.png"
  | "/brand/co-videopro-canonical.png"
  | "/demo/cco-spiral.png"
  | "/demo/cco-lockup.png";

export interface BrandValues {
  displayName?: string;
  playerLabel?: string;
  primaryColor?: string;
  logoPath?: BrandLogoPath;
  cornerRadius?: 0 | 4 | 8;
  showPoweredBy?: boolean;
}

export interface ResolvedBrandValues {
  displayName: string;
  playerLabel: string;
  primaryColor: string;
  logoPath: BrandLogoPath;
  cornerRadius: 0 | 4 | 8;
  showPoweredBy: boolean;
}

export interface BrandRevision {
  id: string;
  schemaVersion: typeof BRAND_GOVERNANCE_SCHEMA_VERSION;
  organizationId: string | null;
  workspaceId: string | null;
  scope: BrandScope;
  version: number;
  status: BrandRevisionStatus;
  values: BrandValues;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface BrandContext {
  organizationId: string;
  workspaceId: string;
}

export interface ResolvedBrand {
  values: ResolvedBrandValues;
  provenance: Record<keyof ResolvedBrandValues, string>;
  appliedRevisionIds: string[];
}

export interface BrandValidationIssue {
  field: keyof BrandValues;
  message: string;
}

export interface BrandRestoreResult {
  revisions: BrandRevision[];
  recovered: boolean;
}

export interface LegacyBrandValues {
  displayName: string;
  playerLabel: string;
  primaryColor: string;
  logoPath: string;
}

export const PLATFORM_BRAND_VALUES: ResolvedBrandValues = {
  displayName: "Co-VideoPro",
  playerLabel: "Reviewed in Co-VideoPro",
  primaryColor: "#145bb8",
  logoPath: "/brand/co-videopro-color-supplied.png",
  cornerRadius: 8,
  showPoweredBy: true,
};

const LOGO_PATHS: BrandLogoPath[] = [
  "/brand/co-videopro-color-supplied.png",
  "/brand/co-videopro-canonical.png",
  "/demo/cco-spiral.png",
  "/demo/cco-lockup.png",
];
const CORNER_RADII = [0, 4, 8] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeValues(values: BrandValues): BrandValues {
  const normalized: BrandValues = {};
  const displayName = boundedString(values.displayName, 80);
  const playerLabel = boundedString(values.playerLabel, 120);
  const primaryColor = normalizeHexColor(values.primaryColor);

  if (displayName) normalized.displayName = displayName;
  if (playerLabel) normalized.playerLabel = playerLabel;
  if (primaryColor) normalized.primaryColor = primaryColor;
  if (values.logoPath && LOGO_PATHS.includes(values.logoPath)) normalized.logoPath = values.logoPath;
  if (values.cornerRadius !== undefined && CORNER_RADII.includes(values.cornerRadius)) {
    normalized.cornerRadius = values.cornerRadius;
  }
  if (typeof values.showPoweredBy === "boolean") normalized.showPoweredBy = values.showPoweredBy;

  return normalized;
}

function revisionMatchesContext(revision: BrandRevision, context: BrandContext): boolean {
  if (revision.scope === "platform") {
    return revision.organizationId === null && revision.workspaceId === null;
  }
  if (revision.organizationId !== context.organizationId) return false;
  if (revision.scope === "organization") return revision.workspaceId === null;
  return revision.workspaceId === context.workspaceId;
}

function latestRevision(
  revisions: BrandRevision[],
  context: BrandContext,
  scope: BrandScope,
): BrandRevision | null {
  return (
    revisions
      .filter(
        (revision) =>
          revision.scope === scope &&
          revision.status === "published" &&
          revisionMatchesContext(revision, context),
      )
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`;
  }
  return null;
}

function relativeLuminance(color: string): number {
  const normalized = normalizeHexColor(color);
  if (!normalized) return 0;
  const channels = [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function accessibleForeground(background: string): "#ffffff" | "#121d2a" {
  return contrastRatio("#ffffff", background) >= contrastRatio("#121d2a", background)
    ? "#ffffff"
    : "#121d2a";
}

export function validateBrandValues(values: BrandValues): BrandValidationIssue[] {
  const issues: BrandValidationIssue[] = [];
  if (values.displayName !== undefined && !boundedString(values.displayName, 80)) {
    issues.push({ field: "displayName", message: "Brand name is required." });
  }
  if (values.playerLabel !== undefined && !boundedString(values.playerLabel, 120)) {
    issues.push({ field: "playerLabel", message: "Player label is required." });
  }
  if (values.primaryColor !== undefined && !normalizeHexColor(values.primaryColor)) {
    issues.push({ field: "primaryColor", message: "Use a six-digit hexadecimal color." });
  }
  if (values.logoPath !== undefined && !LOGO_PATHS.includes(values.logoPath)) {
    issues.push({ field: "logoPath", message: "Logo must use an approved brand asset." });
  }
  if (values.cornerRadius !== undefined && !CORNER_RADII.includes(values.cornerRadius)) {
    issues.push({ field: "cornerRadius", message: "Corner radius must be 0, 4, or 8 pixels." });
  }
  return issues;
}

export function createPlatformBrandRevision(createdAt = "2026-07-14T19:00:00.000Z"): BrandRevision {
  return {
    id: "brand-platform-v1",
    schemaVersion: BRAND_GOVERNANCE_SCHEMA_VERSION,
    organizationId: null,
    workspaceId: null,
    scope: "platform",
    version: 1,
    status: "published",
    values: { ...PLATFORM_BRAND_VALUES },
    createdBy: "system",
    createdAt,
    publishedAt: createdAt,
  };
}

export function migrateLegacyBrand(
  legacy: LegacyBrandValues,
  context: BrandContext,
  createdAt = "2026-07-14T19:00:00.000Z",
): BrandRevision[] {
  const logoPath = LOGO_PATHS.includes(legacy.logoPath as BrandLogoPath)
    ? (legacy.logoPath as BrandLogoPath)
    : PLATFORM_BRAND_VALUES.logoPath;
  const primaryColor = normalizeHexColor(legacy.primaryColor) ?? PLATFORM_BRAND_VALUES.primaryColor;

  return [
    createPlatformBrandRevision(createdAt),
    {
      id: `brand-${context.organizationId}-v1`,
      schemaVersion: BRAND_GOVERNANCE_SCHEMA_VERSION,
      organizationId: context.organizationId,
      workspaceId: null,
      scope: "organization",
      version: 1,
      status: "published",
      values: {
        displayName: boundedString(legacy.displayName, 80) ?? PLATFORM_BRAND_VALUES.displayName,
        playerLabel: boundedString(legacy.playerLabel, 120) ?? PLATFORM_BRAND_VALUES.playerLabel,
        primaryColor,
        logoPath,
        cornerRadius: 8,
        showPoweredBy: true,
      },
      createdBy: "legacy-demo-migration",
      createdAt,
      publishedAt: createdAt,
    },
  ];
}

export function resolveBrand(
  revisions: BrandRevision[],
  context: BrandContext,
  previewRevisionId?: string | null,
): ResolvedBrand {
  const resolved: ResolvedBrandValues = { ...PLATFORM_BRAND_VALUES };
  const provenance = Object.fromEntries(
    Object.keys(resolved).map((key) => [key, "platform-default"]),
  ) as Record<keyof ResolvedBrandValues, string>;
  const appliedRevisionIds: string[] = [];

  const preview = previewRevisionId
    ? revisions.find(
        (revision) =>
          revision.id === previewRevisionId &&
          revision.status === "draft" &&
          revisionMatchesContext(revision, context),
      ) ?? null
    : null;

  const resolutionLayers = (["platform", "organization", "workspace"] as BrandScope[])
    .map((scope) =>
      preview?.scope === scope ? preview : latestRevision(revisions, context, scope),
    )
    .filter((revision): revision is BrandRevision => Boolean(revision));

  for (const revision of resolutionLayers) {
    const values = normalizeValues(revision.values);
    for (const [key, value] of Object.entries(values) as Array<
      [keyof ResolvedBrandValues, ResolvedBrandValues[keyof ResolvedBrandValues]]
    >) {
      if (value !== undefined) {
        Object.assign(resolved, { [key]: value });
        provenance[key] = revision.id;
      }
    }
    appliedRevisionIds.push(revision.id);
  }

  return { values: resolved, provenance, appliedRevisionIds };
}

export function createBrandDraft(
  revisions: BrandRevision[],
  input: {
    context: BrandContext;
    scope: Exclude<BrandScope, "platform">;
    values: BrandValues;
    createdBy: string;
    createdAt?: string;
  },
): BrandRevision[] {
  const issues = validateBrandValues(input.values);
  if (issues.length) throw new Error(issues[0].message);
  const workspaceId = input.scope === "workspace" ? input.context.workspaceId : null;
  const matching = revisions.filter(
    (revision) =>
      revision.scope === input.scope &&
      revision.organizationId === input.context.organizationId &&
      revision.workspaceId === workspaceId,
  );
  const version = matching.reduce((highest, revision) => Math.max(highest, revision.version), 0) + 1;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const draft: BrandRevision = {
    id: `brand-${input.context.organizationId}-${workspaceId ?? "org"}-v${version}`,
    schemaVersion: BRAND_GOVERNANCE_SCHEMA_VERSION,
    organizationId: input.context.organizationId,
    workspaceId,
    scope: input.scope,
    version,
    status: "draft",
    values: normalizeValues(input.values),
    createdBy: input.createdBy,
    createdAt,
    publishedAt: null,
  };
  return [...revisions, draft];
}

export function publishBrandRevision(
  revisions: BrandRevision[],
  input: {
    revisionId: string;
    organizationId: string;
    publishedAt?: string;
  },
): BrandRevision[] {
  const target = revisions.find((revision) => revision.id === input.revisionId);
  if (!target || target.status !== "draft") throw new Error("Brand draft was not found.");
  if (target.organizationId !== input.organizationId || target.scope === "platform") {
    throw new Error("Brand draft does not belong to this organization.");
  }
  const publishedAt = input.publishedAt ?? new Date().toISOString();
  return revisions.map((revision) => {
    const sameLayer =
      revision.organizationId === target.organizationId &&
      revision.workspaceId === target.workspaceId &&
      revision.scope === target.scope;
    if (revision.id === target.id) return { ...revision, status: "published", publishedAt };
    if (sameLayer && revision.status === "published") return { ...revision, status: "archived" };
    return revision;
  });
}

export function discardBrandDraft(
  revisions: BrandRevision[],
  input: {
    revisionId: string;
    organizationId: string;
  },
): BrandRevision[] {
  const target = revisions.find((revision) => revision.id === input.revisionId);
  if (!target || target.status !== "draft") throw new Error("Brand draft was not found.");
  if (target.organizationId !== input.organizationId || target.scope === "platform") {
    throw new Error("Brand draft does not belong to this organization.");
  }
  return revisions.filter((revision) => revision.id !== target.id);
}

export function createRollbackDraft(
  revisions: BrandRevision[],
  input: {
    sourceRevisionId: string;
    organizationId: string;
    workspaceId: string;
    createdBy: string;
    createdAt?: string;
  },
): BrandRevision[] {
  const source = revisions.find((revision) => revision.id === input.sourceRevisionId);
  if (!source || source.organizationId !== input.organizationId || source.scope === "platform") {
    throw new Error("Brand revision does not belong to this organization.");
  }
  return createBrandDraft(revisions, {
    context: { organizationId: input.organizationId, workspaceId: input.workspaceId },
    scope: source.scope,
    values: source.values,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
  });
}

function parseStoredRevision(value: unknown): BrandRevision | null {
  if (!isRecord(value) || value.schemaVersion !== BRAND_GOVERNANCE_SCHEMA_VERSION) return null;
  if (typeof value.id !== "string" || typeof value.version !== "number" || value.version < 1) return null;
  if (value.scope !== "platform" && value.scope !== "organization" && value.scope !== "workspace") return null;
  if (value.status !== "draft" && value.status !== "published" && value.status !== "archived") return null;
  if (!isRecord(value.values)) return null;
  const organizationId = typeof value.organizationId === "string" ? value.organizationId : null;
  const workspaceId = typeof value.workspaceId === "string" ? value.workspaceId : null;
  if (value.scope === "platform" && (organizationId || workspaceId)) return null;
  if (value.scope !== "platform" && !organizationId) return null;
  if (value.scope === "workspace" && !workspaceId) return null;

  return {
    id: value.id.slice(0, 140),
    schemaVersion: BRAND_GOVERNANCE_SCHEMA_VERSION,
    organizationId,
    workspaceId,
    scope: value.scope,
    version: Math.floor(value.version),
    status: value.status,
    values: normalizeValues(value.values),
    createdBy: boundedString(value.createdBy, 100) ?? "unknown",
    createdAt: boundedString(value.createdAt, 40) ?? new Date(0).toISOString(),
    publishedAt: boundedString(value.publishedAt, 40) ?? null,
  };
}

export function restoreBrandRevisions(
  raw: string | null,
  fallback: BrandRevision[],
  context: BrandContext,
): BrandRestoreResult {
  if (!raw) return { revisions: fallback, recovered: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { revisions: fallback, recovered: true };
    const revisions = parsed
      .map(parseStoredRevision)
      .filter((revision): revision is BrandRevision => Boolean(revision))
      .filter(
        (revision) => revision.scope === "platform" || revision.organizationId === context.organizationId,
      );
    const hasPlatform = revisions.some(
      (revision) => revision.scope === "platform" && revision.status === "published",
    );
    const hasOrganization = revisions.some(
      (revision) =>
        revision.scope === "organization" &&
        revision.organizationId === context.organizationId &&
        revision.status === "published",
    );
    if (!hasPlatform || !hasOrganization) return { revisions: fallback, recovered: true };
    return { revisions: revisions.slice(-100), recovered: false };
  } catch {
    return { revisions: fallback, recovered: true };
  }
}
