"use client";

import Image from "next/image";
import Link from "next/link";
import { Archive, ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
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
  const copy =
    mode === "archive"
      ? {
          title: "Project archive",
          countLabel: "Archived deliverables",
          emptyTitle: "No archived deliverables",
          emptyDescription:
            "Archived media returns here after it leaves active review. Restoring moves it back to the project browser.",
          authority: "Restores to active project media",
        }
      : {
          title: "Trash",
          countLabel: "Trashed deliverables",
          emptyTitle: "Trash is empty",
          emptyDescription:
            "Deleted demo media appears here before recovery. Restoring returns the asset to active project media.",
          authority: "Recovery is available before permanent removal",
        };

  if (!demoMode) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        <Link
          href="/projects"
          className="mb-5 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-1 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to projects
        </Link>
        <section className="border-y border-[var(--border)] py-10 text-center">
          <Icon size={28} className="mx-auto mb-3 text-[var(--dim)]" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-[var(--ink)]">Recovery unavailable</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            Archive and Trash are not available in this workspace until project media recovery has durable authority.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      <Link
        href={`/projects${demoSuffix}`}
        className="mb-5 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-1 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Back to projects
      </Link>

      <header className="mb-5 grid gap-4 border-b border-[var(--border)] pb-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--muted)]">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
              Recovery queue
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">{copy.title}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {assets.length} {copy.countLabel.toLowerCase()}
            </p>
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
          <p className="font-semibold text-[var(--ink)]">Restore authority</p>
          <p className="mt-1 leading-5">{copy.authority}</p>
        </div>
      </header>

      {assets.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-12 text-center">
          <Icon size={28} className="mx-auto mb-3 text-[var(--dim)]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[var(--ink)]">{copy.emptyTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            {copy.emptyDescription}
          </p>
          <Link
            href={`/projects${demoSuffix}`}
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] px-4 text-sm font-semibold text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-light)] hover:bg-[var(--surface-2)]"
          >
            Open project browser
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
          {assets.map((asset) => (
            <div key={asset.id} className="flex min-h-20 items-center gap-3 px-3 py-3">
              <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                {asset.thumbnail_url ? (
                  <Image src={asset.thumbnail_url} alt="" fill sizes="96px" className="object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{asset.title}</p>
                <p className="mt-1 text-xs capitalize text-[var(--muted)]">{asset.file_type}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={`Restore ${asset.title}`}
                onClick={() =>
                  mode === "archive"
                    ? restoreDemoArchivedAsset(asset.id)
                    : restoreDemoAsset(asset.id)
                }
              >
                <RotateCcw size={14} aria-hidden="true" /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
