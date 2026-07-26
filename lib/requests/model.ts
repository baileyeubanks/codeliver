/* P27: Request Center — typed intake model + per-kind validation.          */
/* Pure logic: no DOM, no store. The demo workspace store and the request    */
/* center UI both validate through this module.                              */

export const REQUEST_KINDS = [
  "new_project",
  "edit",
  "resize",
  "caption_update",
  "social_cutdown",
  "content_refresh",
  "asset_retrieval",
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  new_project: "New project",
  edit: "Edit",
  resize: "Resize",
  caption_update: "Caption update",
  social_cutdown: "Social cutdown",
  content_refresh: "Content refresh",
  asset_retrieval: "Asset retrieval",
};

export const REQUEST_PRIORITIES = ["rush", "standard", "flexible"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const REQUEST_PRIORITY_LABELS: Record<RequestPriority, string> = {
  rush: "Rush",
  standard: "Standard",
  flexible: "Flexible",
};

export const REQUEST_PLATFORMS = [
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
  "x",
  "facebook",
  "broadcast",
  "web",
] as const;

export const RESIZE_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;

/** Social cutdowns always deliver these variants of the source asset. */
export const SOCIAL_CUTDOWN_ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;

export interface ClientRequestInput {
  kind: RequestKind;
  title: string;
  priority: RequestPriority;
  /** Requested due date as an ISO calendar date (YYYY-MM-DD). */
  requestedDueDate: string;
  /** Linked library asset; required for asset-based kinds. */
  sourceAssetId: string | null;
  platform: string | null;
  /** social_cutdown only. */
  durationSeconds: number | null;
  /** resize only. */
  aspectRatios: string[];
  /** asset_retrieval only — free text when the client can't name the asset. */
  assetReference: string | null;
  notes: string;
}

export function defaultRequestInput(kind: RequestKind): ClientRequestInput {
  return {
    kind,
    title: "",
    priority: "standard",
    requestedDueDate: "",
    sourceAssetId: null,
    platform: null,
    durationSeconds: kind === "social_cutdown" ? 30 : null,
    aspectRatios: [],
    assetReference: null,
    notes: "",
  };
}

export function isRequestKind(value: unknown): value is RequestKind {
  return typeof value === "string" && (REQUEST_KINDS as readonly string[]).includes(value);
}

export function kindRequiresSourceAsset(kind: RequestKind): boolean {
  return ["edit", "resize", "caption_update", "social_cutdown", "content_refresh"].includes(kind);
}

export function kindRequiresPlatform(kind: RequestKind): boolean {
  return kind === "resize" || kind === "social_cutdown";
}

export type RequestValidation =
  | { ok: true; value: ClientRequestInput }
  | { ok: false; errors: string[] };

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

/** Validate + normalize a client request. Every rule is per-kind; the UI
 * renders progressive fields from the same predicates so the two never drift. */
export function validateRequestInput(input: ClientRequestInput): RequestValidation {
  const errors: string[] = [];

  const title = input.title.trim();
  if (!title) errors.push("Give the request a short title.");

  if (!(REQUEST_PRIORITIES as readonly string[]).includes(input.priority)) {
    errors.push("Choose a priority: rush, standard, or flexible.");
  }

  const requestedDueDate = input.requestedDueDate.trim();
  if (!isIsoCalendarDate(requestedDueDate)) {
    errors.push("Pick a requested due date (a real calendar date).");
  }

  const sourceAssetId = input.sourceAssetId?.trim() || null;
  if (kindRequiresSourceAsset(input.kind) && !sourceAssetId) {
    errors.push("Choose the source asset this request is about.");
  }

  const platform = input.platform?.trim() || null;
  if (kindRequiresPlatform(input.kind) && !platform) {
    errors.push("Choose the target platform.");
  }

  let durationSeconds: number | null = null;
  if (input.kind === "social_cutdown") {
    const candidate = input.durationSeconds;
    if (candidate === null || !Number.isFinite(candidate) || candidate <= 0) {
      errors.push("Cutdown duration must be greater than zero seconds.");
    } else {
      durationSeconds = Math.round(candidate);
    }
  }

  let aspectRatios: string[] = [];
  if (input.kind === "resize") {
    aspectRatios = input.aspectRatios.filter((ratio) =>
      (RESIZE_ASPECT_RATIOS as readonly string[]).includes(ratio),
    );
    if (input.aspectRatios.length === 0) {
      errors.push("Pick at least one aspect ratio for the resize.");
    } else if (aspectRatios.length !== input.aspectRatios.length) {
      errors.push(`Aspect ratios must be from: ${RESIZE_ASPECT_RATIOS.join(", ")}.`);
    }
  }

  const assetReference = input.assetReference?.trim() || null;
  if (input.kind === "asset_retrieval" && !assetReference) {
    errors.push("Describe the asset you need retrieved so the team can find it.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      kind: input.kind,
      title,
      priority: input.priority,
      requestedDueDate,
      sourceAssetId,
      platform,
      durationSeconds,
      aspectRatios,
      assetReference,
      notes: input.notes.trim(),
    },
  };
}
