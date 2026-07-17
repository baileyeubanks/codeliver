"use client";

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  MessageSquare,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import { createDemoProject } from "@/lib/demo/workspace-store";

const intakePath = [
  {
    label: "Client intake",
    detail: "Lead, client, proposal, and deposit readiness",
    icon: FileText,
  },
  {
    label: "Project shell",
    detail: "Name, brief, and workspace authority",
    icon: FolderOpen,
  },
  {
    label: "Upload media",
    detail: "Add source files when the shell opens",
    icon: Upload,
  },
  {
    label: "Review link",
    detail: "Share a permission-aware portal",
    icon: MessageSquare,
  },
  {
    label: "Delivery trail",
    detail: "Track approvals, exports, and activity",
    icon: CheckCircle2,
  },
];

const frontOfficeReadiness = [
  {
    label: "Lead and client",
    detail: "Captured as project intake context until CRM records are durable.",
  },
  {
    label: "Quote and proposal",
    detail: "Scoped for handoff; no proposal is marked accepted here.",
  },
  {
    label: "Contract and signature",
    detail: "Tracked as readiness, not as an executed agreement.",
  },
  {
    label: "Deposit, invoice, payment",
    detail: "No money state is marked received until billing authority exists.",
  },
];

const readinessStrip = [
  {
    label: "Project write",
    value: "Live",
    detail: "Creates the workspace",
  },
  {
    label: "Client context",
    value: "Payload",
    detail: "Saved with the intake brief",
  },
  {
    label: "Billing authority",
    value: "Gated",
    detail: "No payment state claimed",
  },
  {
    label: "Expense ledger",
    value: "Planned",
    detail: "Awaiting durable records",
  },
];

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4">
        <Link
          href={`/projects${demoSuffix}`}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={16} /> Projects
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              Project intake
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
              New production workspace
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Capture the client, proposal context, and production workspace in one intake path. CRM, contracts,
              signatures, invoices, deposits, payments, and expenses stay readiness-gated until durable records exist.
            </p>
          </div>
          <Link
            href={`/activity${demoSuffix}`}
            className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)]"
          >
            Activity trail
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <section
        aria-label="Intake readiness"
        className="grid overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-4"
      >
        {readinessStrip.map((item, index) => (
          <div
            key={item.label}
            className="border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {item.label}
            </span>
            <span className="mt-1 block text-lg font-semibold leading-none text-[var(--ink)]">
              {item.value}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{item.detail}</span>
            {index === 0 && <span className="sr-only">Project creation is the only live write in this intake step.</span>}
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="mb-5 flex items-start gap-3 border-b border-[var(--border)] pb-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
              <FileText size={17} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">Workspace details</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                The project shell is created immediately. Front-office context is saved into the project intake payload
                without claiming CRM, contract, billing, or payment authority.
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
                placeholder="Goal, audience, deliverables, review owner, and any launch timing."
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
                placeholder="Lead source, estimate range, proposal status, signature needs, deposit or invoice constraints."
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

        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Setup path
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ink)]">What happens next</h2>
          <div className="mt-4 space-y-3">
            {intakePath.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--ink)]">
                      {index + 1}. {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">{item.detail}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Front-office readiness
            </p>
            <div className="mt-3 divide-y divide-[var(--border)]">
              {frontOfficeReadiness.map((item) => (
                <div key={item.label} className="py-2.5 first:pt-0 last:pb-0">
                  <span className="block text-sm font-semibold text-[var(--ink)]">{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{item.detail}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
            Transcript cleanup, waveform analysis, notification delivery, exports, CRM, contracts, signatures, invoices,
            deposits, payments, and expenses remain readiness-gated inside the project surface.
          </p>
        </aside>
      </div>
    </div>
  );
}
