import type { Version } from "@/lib/types/codeliver";
import type {
  DemoShareLink,
  DemoWorkspaceState,
} from "@/lib/demo/workspace-store";

export type DemoShareAssetResolution =
  | { ok: true; assetId: string }
  | { ok: false; error: string };

export interface DemoPublicReviewAsset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  projects: { name: string } | null;
}

export type DemoPublicReviewIdentity =
  | {
      ok: true;
      asset: DemoPublicReviewAsset;
      projectId: string;
      version: Version;
      versions: Version[];
    }
  | { ok: false; error: string };

type DemoPublicReviewIdentitySource = Pick<
  DemoWorkspaceState,
  "assets" | "projects" | "shareLinks"
>;

/**
 * A review share is the asset authority. A single-asset link always resolves
 * its one immutable subject, even if a stale or forged query names something
 * else. A multi-asset link may select only from the assets it actually carries.
 */
export function resolveDemoShareAssetId({
  share,
  requestedAssetId,
}: {
  share: DemoShareLink;
  requestedAssetId: string | null;
}): DemoShareAssetResolution {
  const allowedAssetIds = Array.from(new Set(share.asset_ids.filter(Boolean)));
  if (allowedAssetIds.length === 0) {
    return {
      ok: false,
      error: "This review link is not bound to any media.",
    };
  }

  if (allowedAssetIds.length === 1) {
    return { ok: true, assetId: allowedAssetIds[0]! };
  }

  if (!requestedAssetId) {
    return { ok: true, assetId: allowedAssetIds[0]! };
  }

  if (!allowedAssetIds.includes(requestedAssetId)) {
    return {
      ok: false,
      error: "This review link does not include the requested media.",
    };
  }

  return { ok: true, assetId: requestedAssetId };
}

/**
 * Resolves the exact demo subject shown by public review. This intentionally
 * creates one current version from the workspace asset because the workspace
 * does not carry verified historical version records. It never retags the
 * generic demo reel as another asset's history and never substitutes media
 * from a different asset.
 */
export function resolveDemoPublicReviewIdentity({
  workspace,
  shareToken,
  requestedAssetId,
  mediaObjectUrl,
}: {
  workspace: DemoPublicReviewIdentitySource;
  shareToken: string | null;
  requestedAssetId: string | null;
  mediaObjectUrl: string | null;
}): DemoPublicReviewIdentity {
  const share = shareToken
    ? workspace.shareLinks.find((candidate) => candidate.token === shareToken)
    : null;

  if (shareToken && !share) {
    return {
      ok: false,
      error: "This review link is invalid or no longer available.",
    };
  }

  const assetResolution = share
    ? resolveDemoShareAssetId({ share, requestedAssetId })
    : requestedAssetId
      ? ({ ok: true, assetId: requestedAssetId } as const)
      : ({
          ok: false,
          error: "This review link is not bound to any media.",
        } as const);

  if (!assetResolution.ok) return assetResolution;

  const workspaceAsset = workspace.assets.find(
    (candidate) => candidate.id === assetResolution.assetId,
  );
  if (!workspaceAsset) {
    return {
      ok: false,
      error: "The media attached to this review is no longer available.",
    };
  }

  const workspaceProject = workspace.projects.find(
    (candidate) => candidate.id === workspaceAsset.project_id,
  );
  const verifiedMediaUrl = mediaObjectUrl ?? workspaceAsset.file_url ?? null;
  const versionNumber = workspaceAsset.version_count ?? 1;
  const version: Version = {
    id: `demo-version-${versionNumber}`,
    asset_id: workspaceAsset.id,
    version_number: versionNumber,
    file_url: verifiedMediaUrl ?? "",
    file_size: null,
    thumbnail_url: workspaceAsset.thumbnail_url ?? null,
    duration_seconds: verifiedMediaUrl
      ? workspaceAsset.duration_seconds ?? null
      : null,
    resolution: null,
    is_current: true,
    notes: verifiedMediaUrl
      ? "Verified local demo media"
      : "Preview unavailable — no verified media is attached to this version.",
    uploaded_by: null,
    created_at: workspaceAsset.created_at,
  };

  return {
    ok: true,
    projectId: workspaceAsset.project_id,
    asset: {
      id: workspaceAsset.id,
      title: workspaceAsset.title,
      file_type: workspaceAsset.file_type,
      file_url: verifiedMediaUrl,
      status: workspaceAsset.status,
      projects: workspaceProject
        ? { name: `${workspaceProject.name} / Client Review` }
        : null,
    },
    version,
    versions: [version],
  };
}
