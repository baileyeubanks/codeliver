"use client";

import { History } from "lucide-react";
import {
  currentVersion,
  sortVersions,
  versionBadgeLabel,
} from "@/lib/versions/versions";
import type { Version } from "@/lib/types/codeliver";

/**
 * P19b — version switcher chips. All selection logic comes from P19a's
 * canonical lib/versions module (newest-first ordering, is_current wins);
 * this component is purely presentational.
 */

interface VersionSwitcherProps {
  versions: Version[];
  activeVersionId: string | null;
  onSelect: (version: Version) => void;
  /**
   * P22 share setting made real: when the link is current-version-only the
   * older chips are hidden and the switcher says why.
   */
  currentVersionOnly?: boolean;
}

export default function VersionSwitcher({
  versions,
  activeVersionId,
  onSelect,
  currentVersionOnly = false,
}: VersionSwitcherProps) {
  const ordered = sortVersions(versions);
  if (ordered.length === 0) return null;

  const current = currentVersion(ordered);
  const visible = currentVersionOnly && current ? [current] : ordered;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Review versions"
        data-testid="version-switcher"
        className="flex items-center gap-1.5"
      >
        <History size={13} className="text-white/60" aria-hidden="true" />
        {visible.map((version) => {
          const active = version.id === activeVersionId;
          const isCurrent = current?.id === version.id;
          return (
            <button
              key={version.id}
              type="button"
              onClick={() => onSelect(version)}
              aria-pressed={active}
              data-version-id={version.id}
              data-version-number={version.version_number}
              data-current={isCurrent || undefined}
              className={`flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[#18223e]"
                  : isCurrent
                    ? "border-[var(--accent)]/50 bg-white/5 text-white hover:border-[var(--accent)]"
                    : "border-white/25 bg-white/5 text-white/85 hover:border-white/50 hover:text-white"
              }`}
            >
              {versionBadgeLabel(version, isCurrent)}
            </button>
          );
        })}
      </div>
      {currentVersionOnly ? (
        <span className="text-[11px] text-white/60">
          This link shows only the current version.
        </span>
      ) : null}
    </div>
  );
}
