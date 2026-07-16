"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Shield,
  Trash2,
} from "lucide-react";
import {
  restoreDemoArchivedAsset,
  restoreDemoAsset,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";

export default function DemoAssetCollection({ mode }: { mode: "archive" | "trash" }) {
  const workspace = useDemoWorkspace();
  const demoMode = useDemoMode();
  const demoSuffix = useDemoSuffix();
  const assets = demoMode
    ? mode === "archive"
      ? workspace.archivedAssets
      : workspace.trashedAssets
    : [];
  const Icon = mode === "archive" ? Archive : Trash2;
  const title = mode === "archive" ? "Project archive" : "Project trash";
  const modeLabel = mode === "archive" ? "Archive" : "Trash";
  const modeDescription =
    mode === "archive"
      ? "Review retained deliverables, restore them to the production library, and keep client links unchanged."
      : "Review removed deliverables before restoration. Permanent deletion is intentionally not exposed here.";
  const emptyDescription = demoMode
    ? `No ${modeLabel.toLowerCase()} items are waiting. Assets moved here from the project library will appear with restore controls.`
    : `${modeLabel} state is connected to local demo storage in this preview. Production retention requires the storage contract.`;
  const readiness = [
    {
      label: "Held assets",
      value: assets.length,
      detail: mode === "archive" ? "Archived deliverables" : "Removed deliverables",
      icon: Icon,
    },
    {
      label: "Restore",
      value: demoMode ? "Ready" : "Gated",
      detail: demoMode ? "Local state only" : "Needs backend",
      icon: RotateCcw,
    },
    {
      label: "Retention",
      value: mode === "archive" ? "Kept" : "Review",
      detail: mode === "archive" ? "Links preserved" : "Delete unavailable",
      icon: Shield,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4">
        <Link
          href={`/projects${demoSuffix}`}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={16} /> Production library
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              Retention workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{modeDescription}</p>
          </div>
          <Link
            href={`/projects${demoSuffix}`}
            className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--accent)]"
          >
            <CheckCircle2 size={15} />
            Open library
          </Link>
        </div>
      </header>

      <section
        aria-label={`${modeLabel} readiness`}
        className="grid gap-2 md:grid-cols-3"
      >
        {readiness.map((item) => {
          const ReadinessIcon = item.icon;
          return (
            <div
              key={item.label}
              className="grid min-h-[74px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
                <ReadinessIcon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim)]">
                  {item.label}
                </span>
                <span className="mt-0.5 flex items-baseline gap-2">
                  <strong className="text-xl font-semibold text-[var(--ink)]">{item.value}</strong>
                  <span className="truncate text-xs text-[var(--muted)]">{item.detail}</span>
                </span>
              </span>
            </div>
          );
        })}
      </section>

      {assets.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-white px-5 py-14 text-center">
          <Icon size={30} className="mx-auto mb-3 text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--ink)]">No {modeLabel.toLowerCase()} items</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
            {emptyDescription}
          </p>
          <Link
            href={`/projects${demoSuffix}`}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--accent)]"
          >
            Return to production library
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex min-h-20 items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
            >
              <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                {asset.thumbnail_url ? (
                  <Image src={asset.thumbnail_url} alt="" fill sizes="96px" className="object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{asset.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs capitalize text-[var(--muted)]">
                  <span>{asset.file_type}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={12} /> Restore keeps the asset in local demo authority
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  mode === "archive"
                    ? restoreDemoArchivedAsset(asset.id)
                    : restoreDemoAsset(asset.id)
                }
              >
                <RotateCcw size={14} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
