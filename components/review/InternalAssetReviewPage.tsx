"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReviewWorkspace from "@/components/review/ReviewWorkspace";

interface AssetData {
  id: string;
  project_id: string;
  title: string;
  file_url?: string;
  thumbnail_url?: string;
  version_count: number;
}

export default function InternalAssetReviewPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const assetId = params?.assetId as string;
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assetId) return;
    fetch(`/api/assets/${assetId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setAsset(data);
        } else {
          setAsset({
            id: assetId,
            project_id: projectId || "",
            title: "Untitled Media",
            version_count: 1,
          });
        }
      })
      .catch(() => {
        setAsset({
          id: assetId,
          project_id: projectId || "",
          title: "Untitled Media",
          version_count: 1,
        });
      })
      .finally(() => setLoading(false));
  }, [assetId, projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="spinner" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <p className="text-[var(--muted)]">Asset not found</p>
      </div>
    );
  }

  return (
    <ReviewWorkspace
      assetId={asset.id}
      projectId={asset.project_id}
      title={asset.title}
      videoUrl={asset.file_url}
      thumbnailUrl={asset.thumbnail_url}
      versionNumber={asset.version_count}
      backHref={`/projects/${asset.project_id}`}
    />
  );
}
