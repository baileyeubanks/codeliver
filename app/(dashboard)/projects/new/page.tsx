"use client";

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewProject() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        description: fd.get("description"),
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
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        href="/projects"
        className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--ink)] mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Projects
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1">New Project</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Create a new project to organize your content for review and delivery.
      </p>

      {error && (
        <div className="bg-[var(--red-dim)] border border-[var(--red)]/20 text-[var(--red)] text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
            Project Name
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="e.g., Q1 Campaign Deliverables"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Brief description of this project..."
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none transition-colors resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Project"}
        </button>
      </form>
    </div>
  );
}
