/* P27: Request Center — scoping an accepted request into a work order.      */
/* The deliverable list is auto-shaped from the request kind (e.g. a social  */
/* cutdown becomes 9:16 + 1:1 + 16:9 variants of the source asset). Pure;    */
/* the store assigns ids and persists.                                       */

import {
  SOCIAL_CUTDOWN_ASPECT_RATIOS,
  type RequestKind,
  type RequestPriority,
} from "./model.ts";

export interface WorkOrderDeliverable {
  title: string;
  platform: string | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
  sourceAssetId: string | null;
}

export interface ScopedWorkOrder {
  requestId: string;
  title: string;
  kind: RequestKind;
  priority: RequestPriority;
  dueDate: string;
  /** Conversion target chosen at accept time; null = standalone work order. */
  projectId: string | null;
  deliverables: WorkOrderDeliverable[];
  scopeNote: string;
}

export interface WorkOrderRequestShape {
  id: string;
  kind: RequestKind;
  title: string;
  priority: RequestPriority;
  requestedDueDate: string;
  sourceAssetId: string | null;
  sourceAssetTitle: string | null;
  platform: string | null;
  durationSeconds: number | null;
  aspectRatios: string[];
  assetReference: string | null;
  notes: string;
}

function deliverablesFor(request: WorkOrderRequestShape): WorkOrderDeliverable[] {
  const assetName = request.sourceAssetTitle ?? "Source asset";
  const asset = { sourceAssetId: request.sourceAssetId };

  switch (request.kind) {
    case "social_cutdown":
      return SOCIAL_CUTDOWN_ASPECT_RATIOS.map((ratio) => ({
        ...asset,
        title: `${assetName} — ${ratio} cutdown (${request.durationSeconds ?? "?"}s)`,
        platform: request.platform,
        aspectRatio: ratio,
        durationSeconds: request.durationSeconds,
      }));
    case "resize":
      return request.aspectRatios.map((ratio) => ({
        ...asset,
        title: `${assetName} — ${ratio} resize`,
        platform: request.platform,
        aspectRatio: ratio,
        durationSeconds: null,
      }));
    case "edit":
      return [
        {
          ...asset,
          title: `${assetName} — edited master`,
          platform: request.platform,
          aspectRatio: null,
          durationSeconds: null,
        },
      ];
    case "caption_update":
      return [
        {
          ...asset,
          title: `${assetName} — caption update`,
          platform: request.platform,
          aspectRatio: null,
          durationSeconds: null,
        },
      ];
    case "content_refresh":
      return [
        {
          ...asset,
          title: `${assetName} — content refresh`,
          platform: request.platform,
          aspectRatio: null,
          durationSeconds: null,
        },
      ];
    case "asset_retrieval":
      return [
        {
          sourceAssetId: null,
          title: `Retrieve and deliver: ${request.assetReference ?? "requested asset"}`,
          platform: null,
          aspectRatio: null,
          durationSeconds: null,
        },
      ];
    case "new_project":
      return [
        {
          sourceAssetId: null,
          title: `${request.title} — kickoff scope`,
          platform: request.platform,
          aspectRatio: null,
          durationSeconds: null,
        },
      ];
  }
}

function scopeNoteFor(request: WorkOrderRequestShape, deliverableCount: number): string {
  switch (request.kind) {
    case "social_cutdown":
      return `Scoped from a social cutdown request: ${SOCIAL_CUTDOWN_ASPECT_RATIOS.join(", ")} variants of the source asset for ${request.platform ?? "the target platform"}.`;
    case "resize":
      return `Scoped from a resize request: ${request.aspectRatios.join(", ")} versions of the source asset.`;
    case "new_project":
      return `Scoped from a new-project request: kickoff for "${request.title}".`;
    case "asset_retrieval":
      return `Scoped from an asset-retrieval request: locate and deliver "${request.assetReference ?? "the requested asset"}".`;
    default:
      return `Scoped from a ${request.kind.replace(/_/g, " ")} request: ${deliverableCount} deliverable${deliverableCount === 1 ? "" : "s"} on the source asset.`;
  }
}

/** Shape the scoped work order for an accepted request. `projectId` is the
 * conversion target picked during triage (attach to a project, or null for a
 * standalone order). */
export function shapeWorkOrder(
  request: WorkOrderRequestShape,
  opts: { projectId?: string | null } = {},
): ScopedWorkOrder {
  const deliverables = deliverablesFor(request);
  return {
    requestId: request.id,
    title: request.title,
    kind: request.kind,
    priority: request.priority,
    dueDate: request.requestedDueDate,
    projectId: opts.projectId ?? null,
    deliverables,
    scopeNote: scopeNoteFor(request, deliverables.length),
  };
}
