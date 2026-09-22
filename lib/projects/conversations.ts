interface ConversationComment {
  project_id: string;
  asset_id: string;
  version_id?: string | null;
  review_invite_id?: string | null;
  created_at: string;
}

interface ConversationAsset { id: string; project_id: string; title: string }
interface ConversationVersion { id: string; asset_id: string; version_number: number }
interface ConversationShare {
  id: string;
  token: string;
  asset_ids: string[];
  version_id: string | null;
  version_binding_status: string;
  is_active: boolean;
  expires_at?: string | null;
}

/** Conversations are records of one cut and one review round. A current-cut
 * project URL cannot stand in for a missing historical review link. */
export function projectConversationThreads<T extends ConversationComment>({
  projectId, assets, comments, versions, shareLinks, now = Date.now(),
}: {
  projectId: string;
  assets: readonly ConversationAsset[];
  comments: readonly T[];
  versions: readonly ConversationVersion[];
  shareLinks: readonly ConversationShare[];
  now?: number;
}) {
  const projectAssets = new Map(assets.filter(asset => asset.project_id === projectId).map(asset => [asset.id, asset]));
  const grouped = new Map<string, {
    id: string; assetId: string; title: string; versionLabel: string;
    reviewHref: string | null; comments: T[];
  }>();
  const ordered = comments.filter(comment => comment.project_id === projectId && projectAssets.has(comment.asset_id))
    .slice().sort((left, right) => left.created_at.localeCompare(right.created_at));

  for (const comment of ordered) {
    const versionId = comment.version_id?.trim() || null;
    const inviteId = comment.review_invite_id?.trim() || null;
    const id = JSON.stringify([comment.asset_id, versionId, inviteId]);
    let thread = grouped.get(id);
    if (!thread) {
      const matchingVersions = versions.filter(version => version.id === versionId && version.asset_id === comment.asset_id);
      const version = matchingVersions.length === 1 ? matchingVersions[0] : null;
      const matchingShares = shareLinks.filter(share => share.id === inviteId);
      const share = matchingShares.length === 1 ? matchingShares[0] : null;
      const availableShare = version && share && share.token.trim()
        && share.is_active && share.version_binding_status === "bound"
        && share.version_id === versionId
        && share.asset_ids.length === 1 && share.asset_ids[0] === comment.asset_id
        && (!share.expires_at || Date.parse(share.expires_at) > now);
      thread = {
        id, assetId: comment.asset_id, title: projectAssets.get(comment.asset_id)!.title,
        versionLabel: version ? `V${version.version_number}` : versionId ? "Recorded cut unavailable" : "Version not recorded",
        reviewHref: availableShare ? `/review/${encodeURIComponent(share!.token)}?demo=1` : null,
        comments: [],
      };
      grouped.set(id, thread);
    }
    thread.comments.push(comment);
  }
  return [...grouped.values()];
}
