"use client";

import Image from "next/image";
import {
  ChevronRight,
  Clock3,
  Film,
  Folder,
  FolderOpen,
  Grid2X2,
  List,
  MessageSquareText,
  Play,
  Upload,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DemoActivityItem } from "@/lib/demo/workspace-store";
import type { FolderNode } from "@/components/projects/FolderTree";
import type { MediaAsset } from "@/components/projects/MediaCard";
import { formatActivityAction } from "@/lib/activity-copy";
import styles from "./ProjectOverviewHome.module.css";

export interface ProjectSequenceGroup {
  id: string;
  name: string;
  path: string[];
  assets: MediaAsset[];
}

interface ProjectOverviewHomeProps {
  project: { id: string; name: string };
  assets: MediaAsset[];
  folders: FolderNode[];
  activity: DemoActivityItem[];
  coverPath: string;
  canUpload: boolean;
  uploading: boolean;
  demoMode: boolean;
  onUpload: () => void;
  onOpenAsset: (asset: MediaAsset) => void;
  onOpenSequence: (sequenceId?: string) => void;
}

interface ProjectSequenceLibraryProps {
  project: { id: string; name: string };
  assets: MediaAsset[];
  folders: FolderNode[];
  selectedSequenceId?: string | null;
  demoMode: boolean;
  canUpload: boolean;
  uploading: boolean;
  onUpload: () => void;
  onOpenAsset: (asset: MediaAsset) => void;
  onSelectSequence: (sequenceId?: string) => void;
}

function folderRootsForProject(folders: FolderNode[], projectId: string) {
  return folders.flatMap((folder) => {
    if (folder.kind === "project") {
      return folder.project_id === projectId || folder.id === projectId ? folder.children : [];
    }
    return folder.project_id === projectId ? [folder] : [];
  });
}

export function buildProjectSequences(
  folders: FolderNode[],
  assets: MediaAsset[],
  projectId: string,
): ProjectSequenceGroup[] {
  const roots = folderRootsForProject(folders, projectId);
  const groupedAssetIds = new Set<string>();
  const groups: ProjectSequenceGroup[] = [];

  function visit(nodes: FolderNode[], path: string[]) {
    for (const node of nodes) {
      const nextPath = [...path, node.name];
      const directAssets = assets.filter((asset) => asset.folder_id === node.id);
      directAssets.forEach((asset) => groupedAssetIds.add(asset.id));
      if (directAssets.length > 0 || node.children.length === 0) {
        groups.push({ id: node.id, name: node.name, path: nextPath, assets: directAssets });
      }
      visit(node.children, nextPath);
    }
  }

  visit(roots, []);
  const unfiled = assets.filter((asset) => !groupedAssetIds.has(asset.id));
  if (unfiled.length > 0 || groups.length === 0) {
    groups.push({
      id: `${projectId}-project-media`,
      name: groups.length === 0 ? "Project media" : "Unfiled media",
      path: [groups.length === 0 ? "Project media" : "Unfiled media"],
      assets: unfiled,
    });
  }

  return groups;
}

function formatDuration(seconds?: number) {
  const value = Math.max(0, Math.floor(seconds ?? 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function formatStatus(status: string) {
  switch (status) {
    case "in_review": return "In review";
    case "needs_changes": return "Changes requested";
    case "approved": return "Approved";
    case "final": return "Final";
    default: return "Working on it";
  }
}

function statusTone(status: string) {
  if (["approved", "final"].includes(status)) return styles.statusApproved;
  if (status === "needs_changes") return styles.statusAttention;
  if (status === "in_review") return styles.statusReview;
  return styles.statusDraft;
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function approvalCopy(asset: MediaAsset) {
  const assigned = asset.reviewer_count ?? asset.approval_records?.length ?? 0;
  const approved = asset.reviewer_done
    ?? asset.approval_records?.filter((record) => record.status === "approved").length
    ?? 0;
  return assigned > 0 ? `${approved}/${assigned} approved` : "Approval not assigned";
}

function SequenceCard({
  group,
  demoMode,
  onOpen,
}: {
  group: ProjectSequenceGroup;
  demoMode: boolean;
  onOpen: () => void;
}) {
  const approvedCount = group.assets.filter((asset) => ["approved", "final"].includes(asset.status)).length;
  const reviewCount = group.assets.filter((asset) => ["in_review", "needs_changes"].includes(asset.status)).length;
  const progress = group.assets.length > 0 ? Math.round((approvedCount / group.assets.length) * 100) : 0;

  return (
    <button type="button" className={styles.sequenceCard} onClick={onOpen}>
      <span className={styles.sequenceIcon}><FolderOpen size={18} /></span>
      <span className={styles.sequenceCopy}>
        <span className={styles.sequencePath}>{group.path.slice(0, -1).join(" / ") || "Sequences"}</span>
        <strong>{group.name}</strong>
        <small>{group.assets.length} video{group.assets.length === 1 ? "" : "s"} · {reviewCount} in review</small>
      </span>
      <span className={styles.sequenceThumbs} aria-hidden="true">
        {group.assets.slice(0, 3).map((asset, index) => (
          asset.thumbnail_url || demoMode ? (
            <Image
              key={asset.id}
              src={asset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"}
              alt=""
              width={56}
              height={34}
              unoptimized
              style={{ zIndex: 3 - index }}
            />
          ) : null
        ))}
        {group.assets.length === 0 ? <Folder size={22} /> : null}
      </span>
      <span className={styles.sequenceProgress}>
        <span><i style={{ width: `${progress}%` }} /></span>
        <small>{approvedCount}/{group.assets.length} approved</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}

function AssetAuthorityRow({
  asset,
  demoMode,
  onOpen,
}: {
  asset: MediaAsset;
  demoMode: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={styles.assetRow} onClick={onOpen}>
      <span className={styles.assetThumb}>
        {asset.thumbnail_url || demoMode ? (
          <Image
            src={asset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"}
            alt=""
            fill
            sizes="96px"
            unoptimized
          />
        ) : <Film size={19} />}
        <i><Play size={13} fill="currentColor" /></i>
      </span>
      <span className={styles.assetCopy}>
        <strong>{asset.title}</strong>
        <small>{formatDuration(asset.duration_seconds)} · Version {asset.version_count ?? 1}</small>
      </span>
      <span className={`${styles.status} ${statusTone(asset.status)}`}>{formatStatus(asset.status)}</span>
      <span className={styles.assetFacts}>
        <small><MessageSquareText size={13} /> {asset.comment_count ?? 0}</small>
        <small><Users size={13} /> {approvalCopy(asset)}</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}

export default function ProjectOverviewHome({
  project,
  assets,
  folders,
  activity,
  coverPath,
  canUpload,
  uploading,
  demoMode,
  onUpload,
  onOpenAsset,
  onOpenSequence,
}: ProjectOverviewHomeProps) {
  const sequences = useMemo(
    () => buildProjectSequences(folders, assets, project.id),
    [assets, folders, project.id],
  );
  const attentionAssets = [...assets]
    .sort((left, right) => {
      const priority = (status: string) => status === "needs_changes" ? 0 : status === "in_review" ? 1 : 2;
      return priority(left.status) - priority(right.status)
        || new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })
    .slice(0, 4);
  const inReviewCount = assets.filter((asset) => ["in_review", "needs_changes"].includes(asset.status)).length;
  const approvedCount = assets.filter((asset) => ["approved", "final"].includes(asset.status)).length;
  const commentCount = assets.reduce((sum, asset) => sum + (asset.comment_count ?? 0), 0);
  const projectProgress = assets.length > 0 ? Math.round((approvedCount / assets.length) * 100) : 0;

  return (
    <div className={styles.overview}>
      <section className={styles.cover} aria-label={`${project.name} project cover`}>
        {coverPath ? (
          <Image
            src={coverPath}
            alt="Co-VideoPro creative production artwork"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 1400px"
            unoptimized
          />
        ) : (
          <span className={styles.coverFallback}>Co-VideoPro</span>
        )}
      </section>

      <header className={styles.projectHeader}>
        <div>
          <span>Project workspace</span>
          <h1>{project.name}</h1>
          <p>Sequences, media, reviews, approvals, and delivery authority.</p>
        </div>
        <div className={styles.projectActions}>
          <button type="button" className={styles.secondaryAction} onClick={() => onOpenSequence()}>
            <FolderOpen size={16} /> Sequences
          </button>
          <button type="button" className={styles.primaryAction} onClick={onUpload} disabled={!canUpload || uploading}>
            <Upload size={16} /> {uploading ? "Uploading" : "Upload media"}
          </button>
        </div>
      </header>

      <dl className={styles.metrics} aria-label="Project summary">
        <div><dt>Project progress</dt><dd>{projectProgress}%</dd><small>{approvedCount} approved</small></div>
        <div><dt>Sequences</dt><dd>{sequences.length}</dd><small>{assets.length} media items</small></div>
        <div><dt>In review</dt><dd>{inReviewCount}</dd><small>Needs attention</small></div>
        <div><dt>Comments</dt><dd>{commentCount}</dd><small>Across all versions</small></div>
      </dl>

      <div className={styles.homeGrid}>
        <div className={styles.primaryColumn}>
          <section className={styles.section}>
            <header className={styles.sectionHeader}>
              <div><span>Project / Sequences</span><h2>Sequence folders</h2></div>
              <button type="button" onClick={() => onOpenSequence()}>View all <ChevronRight size={15} /></button>
            </header>
            <div className={styles.sequenceGrid}>
              {sequences.slice(0, 4).map((group) => (
                <SequenceCard
                  key={group.id}
                  group={group}
                  demoMode={demoMode}
                  onOpen={() => onOpenSequence(group.id)}
                />
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHeader}>
              <div><span>Media authority</span><h2>Videos and current review state</h2></div>
            </header>
            <div className={styles.assetList}>
              {attentionAssets.map((asset) => (
                <AssetAuthorityRow
                  key={asset.id}
                  asset={asset}
                  demoMode={demoMode}
                  onOpen={() => onOpenAsset(asset)}
                />
              ))}
              {assets.length === 0 ? (
                <div className={styles.emptyState}>
                  <Film size={24} />
                  <strong>No media yet</strong>
                  <span>Upload a video to begin its version and review history.</span>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className={styles.activityPanel} aria-label="Recent project activity">
          <header><div><span>Project log</span><h2>Recent activity</h2></div></header>
          <div>
            {activity.slice(0, 7).map((item) => (
              <article key={item.id}>
                <i><Clock3 size={14} /></i>
                <span>
                  <strong>{item.actor_name} {formatActivityAction(item.action)}</strong>
                  <small>{item.details.asset_title ?? project.name}</small>
                </span>
                <time>{timeAgo(item.created_at)}</time>
              </article>
            ))}
            {activity.length === 0 ? <p>No project activity yet.</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ProjectSequenceLibrary({
  project,
  assets,
  folders,
  selectedSequenceId,
  demoMode,
  canUpload,
  uploading,
  onUpload,
  onOpenAsset,
  onSelectSequence,
}: ProjectSequenceLibraryProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const sequences = useMemo(
    () => buildProjectSequences(folders, assets, project.id),
    [assets, folders, project.id],
  );
  const selected = sequences.find((group) => group.id === selectedSequenceId) ?? null;
  const visibleAssets = selected ? selected.assets : assets;

  return (
    <div className={styles.library}>
      <header className={styles.libraryHeader}>
        <div>
          <span>Project / Sequences{selected ? ` / ${selected.name}` : ""}</span>
          <h1>{selected?.name ?? "Sequences"}</h1>
          <p>{selected ? `${selected.assets.length} media items in this sequence.` : "Organize videos by deliverable, campaign, episode, or production phase."}</p>
        </div>
        <div className={styles.libraryActions}>
          <div className={styles.viewToggle} aria-label="Sequence view">
            <button type="button" className={view === "grid" ? styles.active : ""} onClick={() => setView("grid")} aria-label="Grid view" title="Grid view"><Grid2X2 size={16} /></button>
            <button type="button" className={view === "list" ? styles.active : ""} onClick={() => setView("list")} aria-label="List view" title="List view"><List size={17} /></button>
          </div>
          <button type="button" className={styles.primaryAction} onClick={onUpload} disabled={!canUpload || uploading}><Upload size={16} /> {uploading ? "Uploading" : "Upload"}</button>
        </div>
      </header>

      <div className={styles.libraryBody}>
        <aside className={styles.folderStack} aria-label="Project sequence folders">
          <button type="button" className={!selected ? styles.selectedFolder : ""} onClick={() => onSelectSequence()}>
            <FolderOpen size={16} /><span><strong>{project.name}</strong><small>All project media</small></span><b>{assets.length}</b>
          </button>
          <div className={styles.stackBranch}>
            <span><ChevronRight size={13} /> Sequences</span>
            {sequences.map((group) => (
              <button key={group.id} type="button" className={selected?.id === group.id ? styles.selectedFolder : ""} onClick={() => onSelectSequence(group.id)}>
                <Folder size={15} /><span><strong>{group.name}</strong><small>{group.path.slice(0, -1).join(" / ") || "Sequence"}</small></span><b>{group.assets.length}</b>
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.libraryContent}>
          {!selected ? (
            <div className={styles.librarySequenceGrid}>
              {sequences.map((group) => (
                <SequenceCard key={group.id} group={group} demoMode={demoMode} onOpen={() => onSelectSequence(group.id)} />
              ))}
            </div>
          ) : null}

          <header className={styles.contentHeader}>
            <div><h2>{selected ? "Media in sequence" : "All project media"}</h2><small>{visibleAssets.length} item{visibleAssets.length === 1 ? "" : "s"}</small></div>
          </header>
          <div className={view === "grid" ? styles.mediaGrid : styles.mediaList}>
            {visibleAssets.map((asset) => (
              view === "grid" ? (
                <button key={asset.id} type="button" className={styles.mediaCard} onClick={() => onOpenAsset(asset)}>
                  <span className={styles.mediaImage}>
                    {asset.thumbnail_url || demoMode ? <Image src={asset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"} alt="" fill sizes="280px" unoptimized /> : <Film size={22} />}
                    <i><Play size={17} fill="currentColor" /></i>
                  </span>
                  <span className={styles.mediaCardCopy}>
                    <strong>{asset.title}</strong>
                    <small>{formatDuration(asset.duration_seconds)} · Version {asset.version_count ?? 1}</small>
                    <span><em className={`${styles.status} ${statusTone(asset.status)}`}>{formatStatus(asset.status)}</em><small><MessageSquareText size={12} /> {asset.comment_count ?? 0}</small></span>
                  </span>
                </button>
              ) : (
                <AssetAuthorityRow key={asset.id} asset={asset} demoMode={demoMode} onOpen={() => onOpenAsset(asset)} />
              )
            ))}
            {visibleAssets.length === 0 ? (
              <div className={styles.emptyState}><Film size={24} /><strong>This sequence is empty</strong><span>Upload media or move a video into this folder.</span></div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
