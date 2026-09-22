"use client";

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import { createDemoProject } from "@/lib/demo/workspace-store";
import styles from "../projects.module.css";

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
    <div className={`${styles.scope} projects-workspace`}>
      <div className="projects-content projects-new-content">
      <header className="projects-page-header projects-new-header">
        <Link
          href={`/projects${demoSuffix}`}
          className="projects-back-link"
        >
          <ArrowLeft size={16} /> Projects
        </Link>
        <div>
          <h1>New project</h1>
          <p className="projects-page-deck">
            Add a name now. You can fill in the production details from the project workspace.
          </p>
        </div>
      </header>

      <section className="projects-new-form" aria-labelledby="project-details-heading">
        <div className="projects-new-form-heading">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
            <FileText size={17} />
          </span>
          <div>
            <h2 id="project-details-heading">Project details</h2>
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

        <form onSubmit={handleSubmit} className="projects-new-fields">
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

          <div className="projects-new-actions">
            <button
              type="submit"
              disabled={loading}
              className="projects-action projects-primary-action"
            >
              {loading ? "Creating project..." : "Create project"}
              <ArrowRight size={15} />
            </button>
            <Link
              href={`/projects${demoSuffix}`}
              className="projects-action projects-secondary-action"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
      </div>
    </div>
  );
}
