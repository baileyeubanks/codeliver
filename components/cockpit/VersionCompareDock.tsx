"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { History, Layers, Columns2 } from "lucide-react";
import type { MediaAsset } from "@/components/projects/MediaCard";
import styles from "./VersionCompareDock.module.css";

interface VersionCompareDockProps {
  activeAsset: MediaAsset;
  assets: readonly MediaAsset[];
  demoMode?: boolean;
  onSelectAsset: (asset: MediaAsset) => void;
  onOpenVersionHistory: () => void;
}

type CompareMode = "split" | "overlay";

export default function VersionCompareDock({
  activeAsset,
  assets,
  demoMode = false,
  onSelectAsset,
  onOpenVersionHistory,
}: VersionCompareDockProps) {
  const versionCount = Math.max(1, activeAsset.version_count ?? 1);
  const versions = useMemo(
    () => Array.from({ length: versionCount }, (_, index) => index + 1),
    [versionCount],
  );
  const [leftVersion, setLeftVersion] = useState(Math.max(1, versionCount - 1));
  const [rightVersion, setRightVersion] = useState(versionCount);
  const [mode, setMode] = useState<CompareMode>("split");
  const [split, setSplit] = useState(50);
  const poster = activeAsset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg";

  if (!demoMode) {
    return (
      <div className={styles.workspace}>
        <div className={styles.heading}>
          <h2>Version compare</h2>
          <p>{activeAsset.title}</p>
        </div>
        <p className={styles.notice}>
          {activeAsset.version_count
            ? `${activeAsset.version_count} indexed versions are available in version history.`
            : "No indexed version history is available for this deliverable."}
        </p>
        <button className={styles.historyButton} type="button" onClick={onOpenVersionHistory}>
          <History size={14} /> Open version history
        </button>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <h2>Version compare</h2>
        <p>{activeAsset.title}</p>
      </div>

      <label className={styles.field}>
        <span>Deliverable</span>
        <select
          value={activeAsset.id}
          onChange={(event) => {
            const next = assets.find((asset) => asset.id === event.target.value);
            if (next) onSelectAsset(next);
          }}
        >
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
        </select>
      </label>

      {versionCount > 1 ? (
        <>
          <div className={styles.versionFields}>
            <label className={styles.field}>
              <span>Reference</span>
              <select value={leftVersion} onChange={(event) => setLeftVersion(Number(event.target.value))}>
                {versions.map((version) => <option key={version} value={version}>Version {version}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Current</span>
              <select value={rightVersion} onChange={(event) => setRightVersion(Number(event.target.value))}>
                {versions.map((version) => <option key={version} value={version}>Version {version}</option>)}
              </select>
            </label>
          </div>

          <div className={styles.modeControl} aria-label="Compare mode">
            <button type="button" aria-pressed={mode === "split"} onClick={() => setMode("split")}><Columns2 size={14} /> Split</button>
            <button type="button" aria-pressed={mode === "overlay"} onClick={() => setMode("overlay")}><Layers size={14} /> Overlay</button>
          </div>

          {mode === "split" ? (
            <div className={styles.preview} aria-label={`Version ${leftVersion} and version ${rightVersion} frame comparison`}>
              <div className={styles.frame}><Image src={poster} alt="" fill sizes="160px" unoptimized /><span>v{leftVersion}</span></div>
              <div className={styles.frame}><Image src={poster} alt="" fill sizes="160px" unoptimized /><span>v{rightVersion}</span></div>
            </div>
          ) : (
            <>
              <div className={styles.overlayPreview} aria-label={`Version ${leftVersion} and version ${rightVersion} overlay comparison`}>
                <div className={styles.overlayFrame}><Image src={poster} alt="" fill sizes="320px" unoptimized /></div>
                <div className={styles.overlayFrame} style={{ left: `${split}%` }}><Image src={poster} alt="" fill sizes="320px" unoptimized style={{ objectPosition: `${100 - split}% center` }} /></div>
                <span className={styles.overlayLabel}>v{leftVersion}</span>
                <span className={styles.overlayLabel}>v{rightVersion}</span>
              </div>
              <label className={styles.slider}>
                <span>v{leftVersion}</span>
                <input type="range" min="10" max="90" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Version overlay split" />
                <span>v{rightVersion}</span>
              </label>
            </>
          )}
        </>
      ) : (
        <p className={styles.notice}>Version 1 is the only indexed version for this deliverable.</p>
      )}

      <button className={styles.historyButton} type="button" onClick={onOpenVersionHistory}><History size={14} /> Open version history</button>
    </div>
  );
}
