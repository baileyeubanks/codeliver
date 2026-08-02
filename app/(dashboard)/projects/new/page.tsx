"use client";

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import { createDemoProject } from "@/lib/demo/workspace-store";

export default function NewProject() {
  const router = useRouter();
  const demoMode = useDemoMode();
  const demoSuffix = useDemoSuffix();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const clientName = String(fd.get("clientName") ?? "").trim();
    const businessContext = String(fd.get("businessContext") ?? "").trim();
    const descriptionPayload = [
      description,
      clientName ? `Client / company: ${clientName}` : "",
      businessContext ? `Business context: ${businessContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!name) {
      setError("Project name is required before a workspace can be created.");
      setLoading(false);
      return;
    }

    if (demoMode) {
      const project = createDemoProject(name, {
        description,
        clientName,
        businessContext,
      });
      router.push(`/projects/${project.id}?demo=1`);
      return;
    }

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: descriptionPayload,
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4">
        <Link
          href={`/projects${demoSuffix}`}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={16} /> Projects
        </Link>
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Project intake
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
            New production workspace
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Start with the project name and production brief. Add media, people, review links, and delivery details from
            the workspace.
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-5 flex items-start gap-3 border-b border-[var(--border)] pb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
            <FileText size={17} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Workspace details</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              These details become the starting project record.
            </p>
          </div>
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg border border-[var(--red)]/20 bg-[var(--red-dim)] px-4 py-3 text-sm text-[var(--red)]"
            role="alert"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="new-project-name"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
            >
              Project name
            </label>
            <input
              id="new-project-name"
              name="name"
              type="text"
              required
              placeholder="e.g., Q1 Campaign Deliverables"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="new-project-client"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
            >
              Client / company
            </label>
            <input
              id="new-project-client"
              name="clientName"
              type="text"
              placeholder="e.g., Beacon Point Rodeo"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="new-project-description"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
            >
              Brief
            </label>
            <textarea
              id="new-project-description"
              name="description"
              rows={4}
              placeholder="Goal, audience, deliverables, review owner, and launch timing."
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="new-project-business-context"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
            >
              Business context
            </label>
            <textarea
              id="new-project-business-context"
              name="businessContext"
              rows={3}
              placeholder="Lead source, budget range, proposal status, or approval constraints."
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? "Creating workspace..." : "Create workspace"}
              <ArrowRight size={15} />
            </button>
            <Link
              href={`/projects${demoSuffix}`}
              className="inline-flex h-10 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)]"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
