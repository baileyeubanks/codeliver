import type { AnnotationData } from "@/lib/types/codeliver";

export const EXTERNAL_ANNOTATION_COLUMNS =
  "id, comment_id, asset_id, version_id, type, data, frame_number, created_at";

export const MAX_EXTERNAL_ANNOTATIONS = 20;
const MAX_FREEHAND_COORDINATES = 512;
const MAX_ANNOTATION_TEXT_LENGTH = 500;

type AnnotationBinding = {
  commentId: string;
  assetId: string;
  versionId: string;
};

export type ExternalAnnotation = {
  id: string;
  comment_id: string;
  asset_id: string;
  version_id: string;
  type: AnnotationData["kind"];
  data: AnnotationData;
  frame_number: number | null;
  created_at: string;
};

type AnnotationParseResult =
  | { ok: true; annotations: AnnotationData[] }
  | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isUnitCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isCoordinateList(
  value: unknown,
  options: { exact?: number; min?: number; max?: number },
): value is number[] {
  if (!Array.isArray(value)) return false;
  if (options.exact != null && value.length !== options.exact) return false;
  if (options.min != null && value.length < options.min) return false;
  if (options.max != null && value.length > options.max) return false;
  return value.length % 2 === 0 && value.every(isUnitCoordinate);
}

export function parseExternalAnnotationData(value: unknown): AnnotationData | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;

  if (value.kind === "arrow") {
    if (!hasOnlyKeys(value, ["kind", "points"])) return null;
    if (!isCoordinateList(value.points, { exact: 4 })) return null;
    return { kind: "arrow", points: value.points as [number, number, number, number] };
  }

  if (value.kind === "freehand") {
    if (!hasOnlyKeys(value, ["kind", "points"])) return null;
    if (
      !isCoordinateList(value.points, {
        min: 4,
        max: MAX_FREEHAND_COORDINATES,
      })
    ) {
      return null;
    }
    return { kind: "freehand", points: value.points };
  }

  if (value.kind === "rectangle") {
    if (!hasOnlyKeys(value, ["kind", "x", "y", "width", "height"])) return null;
    if (
      !isUnitCoordinate(value.x) ||
      !isUnitCoordinate(value.y) ||
      !isUnitCoordinate(value.width) ||
      !isUnitCoordinate(value.height) ||
      value.width <= 0 ||
      value.height <= 0 ||
      value.x + value.width > 1 ||
      value.y + value.height > 1
    ) {
      return null;
    }
    return {
      kind: "rectangle",
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
    };
  }

  if (value.kind === "pin") {
    if (!hasOnlyKeys(value, ["kind", "x", "y", "label"])) return null;
    if (!isUnitCoordinate(value.x) || !isUnitCoordinate(value.y)) return null;
    if (
      value.label !== undefined &&
      (typeof value.label !== "string" || value.label.length > 120)
    ) {
      return null;
    }
    return {
      kind: "pin",
      x: value.x,
      y: value.y,
      ...(value.label === undefined ? {} : { label: value.label }),
    };
  }

  if (value.kind === "text") {
    if (!hasOnlyKeys(value, ["kind", "x", "y", "text"])) return null;
    if (
      !isUnitCoordinate(value.x) ||
      !isUnitCoordinate(value.y) ||
      typeof value.text !== "string" ||
      !value.text.trim() ||
      value.text.length > MAX_ANNOTATION_TEXT_LENGTH
    ) {
      return null;
    }
    return { kind: "text", x: value.x, y: value.y, text: value.text };
  }

  return null;
}

export function parseExternalAnnotations(value: unknown): AnnotationParseResult {
  if (value == null) return { ok: true, annotations: [] };
  if (!Array.isArray(value) || value.length > MAX_EXTERNAL_ANNOTATIONS) {
    return { ok: false };
  }

  const annotations: AnnotationData[] = [];
  for (const candidate of value) {
    const annotation = parseExternalAnnotationData(candidate);
    if (!annotation) return { ok: false };
    annotations.push(annotation);
  }
  return { ok: true, annotations };
}

export function projectExternalAnnotation(
  row: Record<string, unknown>,
  binding: AnnotationBinding,
): ExternalAnnotation | null {
  const data = parseExternalAnnotationData(row.data);
  const frameNumber = row.frame_number;
  if (
    typeof row.id !== "string" ||
    row.comment_id !== binding.commentId ||
    row.asset_id !== binding.assetId ||
    row.version_id !== binding.versionId ||
    typeof row.type !== "string" ||
    !data ||
    row.type !== data.kind ||
    !(
      frameNumber == null ||
      (typeof frameNumber === "number" &&
        Number.isSafeInteger(frameNumber) &&
        frameNumber >= 0)
    ) ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    comment_id: binding.commentId,
    asset_id: binding.assetId,
    version_id: binding.versionId,
    type: data.kind,
    data,
    frame_number: frameNumber == null ? null : frameNumber,
    created_at: row.created_at,
  };
}
