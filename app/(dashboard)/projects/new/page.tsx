"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FolderPlus,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import { createDemoProject } from "@/lib/demo/workspace-store";

export default function NewProject() {
  const router = useRouter();
  const demoMode = useDemoMode();
  const demoSuffix = useDemoSuffix();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();

    if (demoMode) {
      const project = createDemoProject(name);
      router.push(`/projects/${project.id}?demo=1`);
      return;
    }

    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID();
    }

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        request_id: requestIdRef.current,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create project");
      setLoading(false);
      return;
    }

    const project = await res.json();
    router.push(`/projects/${project.id}`);
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <Link
        href={`/projects${demoSuffix}`}
        className="inline-flex min-h-9 w-fit items-center gap-2 rounded-[var(--radius-sm)] px-1 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to projects
      </Link>

      <header className="grid gap-4 border-b border-[var(--border)] pb-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
            Project workspace
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">New project</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Create the workspace that will hold uploads, review links, approvals, versions, and delivery assets.
          </p>
        </div>

        <div
          className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted)]"
          aria-label="New project readiness"
        >
          <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
            <CheckCircle2 size={15} className="text-[var(--green)]" aria-hidden="true" />
            Review-ready workspace
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <span className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2 py-1">Uploads</span>
            <span className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2 py-1">Comments</span>
            <span className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2 py-1">Approvals</span>
          </div>
        </div>
      </header>

      {error && (
        <div
          className="rounded-[var(--radius)] border border-[var(--red)]/20 bg-[var(--red-dim)] px-4 py-3 text-sm text-[var(--red)]"
          role="alert"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
        aria-describedby="new-project-contract"
      >
        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <ClipboardList size={16} className="text-[var(--accent)]" aria-hidden="true" />
            Project details
          </div>

          <div className="grid gap-4">
            <div>
              <label
                htmlFor="new-project-name"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
              >
                Project name
              </label>
              <input
                id="new-project-name"
                name="name"
                type="text"
                required
                placeholder="e.g., Q1 campaign deliverables"
                className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="new-project-description"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
              >
                Description
              </label>
              <textarea
                id="new-project-description"
                name="description"
                rows={4}
                placeholder="Brief description of scope, reviewers, or delivery target."
                className="min-h-28 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <FolderPlus size={16} aria-hidden="true" />
              {loading ? "Creating..." : "Create project"}
            </button>
            <Link
              href={`/projects${demoSuffix}`}
              className="inline-flex min-h-10 items-center rounded-[var(--radius-sm)] border border-[var(--border)] px-4 text-sm font-semibold text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-light)] hover:bg-[var(--surface-2)]"
            >
              Cancel
            </Link>
          </div>
        </section>

        <aside
          id="new-project-contract"
          className="h-fit rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm shadow-[var(--shadow-sm)]"
        >
          <div className="mb-3 flex items-center gap-2 font-semibold text-[var(--ink)]">
            <UploadCloud size={16} className="text-[var(--accent)]" aria-hidden="true" />
            Creation path
          </div>
          <dl className="grid gap-3 text-xs">
            <div>
              <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Next route</dt>
              <dd className="mt-1 font-mono text-[var(--ink)]">/projects/:id</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">First action</dt>
              <dd className="mt-1 text-[var(--ink)]">Upload media or open the review cockpit.</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Review contract</dt>
              <dd className="mt-1 text-[var(--ink)]">Comments, approvals, versions, and delivery assets stay inside this project.</dd>
            </div>
          </dl>
        </aside>
      </form>
    </div>
  );
}
