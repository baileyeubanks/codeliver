"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  defaultRequestInput,
  kindRequiresPlatform,
  kindRequiresSourceAsset,
  REQUEST_KIND_LABELS,
  REQUEST_KINDS,
  REQUEST_PLATFORMS,
  REQUEST_PRIORITIES,
  REQUEST_PRIORITY_LABELS,
  RESIZE_ASPECT_RATIOS,
  validateRequestInput,
  type ClientRequestInput,
  type RequestKind,
} from "@/lib/requests/model.ts";

export interface RequestFormAssetOption {
  id: string;
  title: string;
}

export interface RequestFormProps {
  assets: RequestFormAssetOption[];
  /** Records the request; returns ok or a truthful failure reason. */
  onSubmit: (input: ClientRequestInput) => { ok: boolean; reason?: string };
  /** Where the confirmation's done-state links to (own requests list). */
  doneHref: string;
  doneLabel?: string;
  /** Test/deep-link support: skip the kind step. */
  initialKind?: RequestKind | null;
}

const FIELD_CLASS =
  "mt-1 min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-xs normal-case text-[var(--ink)]";
const LABEL_CLASS = "block text-[10px] font-bold uppercase text-[var(--muted)]";

const KIND_HINTS: Record<RequestKind, string> = {
  new_project: "Start something new from scratch.",
  edit: "Changes to an existing cut.",
  resize: "Reframe a cut for new placements.",
  caption_update: "Fix or update captions/subtitles.",
  social_cutdown: "Short vertical/square versions of a cut.",
  content_refresh: "Swap dates, offers, or end cards.",
  asset_retrieval: "Get a file you can't find or access.",
};

/**
 * Conversational client intake: pick a kind, then only the fields that kind
 * needs. Honest by design — the confirmation says exactly where the request
 * was recorded.
 */
export default function RequestForm({
  assets,
  onSubmit,
  doneHref,
  doneLabel = "View your requests",
  initialKind = null,
}: RequestFormProps) {
  const [kind, setKind] = useState<RequestKind | null>(initialKind);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<ClientRequestInput["priority"]>("standard");
  const [requestedDueDate, setRequestedDueDate] = useState("");
  const [sourceAssetId, setSourceAssetId] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [aspectRatios, setAspectRatios] = useState<string[]>([]);
  const [assetReference, setAssetReference] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [recorded, setRecorded] = useState(false);

  function collectInput(currentKind: RequestKind): ClientRequestInput {
    return {
      ...defaultRequestInput(currentKind),
      title,
      priority,
      requestedDueDate,
      sourceAssetId: sourceAssetId || null,
      platform: platform || null,
      durationSeconds: currentKind === "social_cutdown" ? durationSeconds : null,
      aspectRatios: currentKind === "resize" ? aspectRatios : [],
      assetReference: currentKind === "asset_retrieval" ? assetReference : null,
      notes,
    };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!kind) return;
    const input = collectInput(kind);
    const validation = validateRequestInput(input);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    const result = onSubmit(validation.value);
    if (!result.ok) {
      setErrors([result.reason ?? "The request could not be recorded."]);
      return;
    }
    setErrors([]);
    setRecorded(true);
  }

  if (recorded) {
    return (
      <div
        data-testid="request-confirmation"
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center"
      >
        <CheckCircle2 size={22} className="mx-auto text-[var(--green)]" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-[var(--ink)]">Request recorded (local preview)</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[var(--muted)]">
          {kind ? REQUEST_KIND_LABELS[kind] : "Request"} · {title}. The request is saved in this
          demo workspace only — nothing was dispatched to the production team.
        </p>
        <a
          href={doneHref}
          className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
        >
          {doneLabel}
        </a>
      </div>
    );
  }

  if (!kind) {
    return (
      <section aria-label="Choose a request type" data-testid="request-kind-picker">
        <h2 className="text-sm font-bold text-[var(--ink)]">What do you need?</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Pick the closest match — the next step only asks for what that kind needs.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Request kind">
          {REQUEST_KINDS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked="false"
              data-testid={`request-kind-${candidate}`}
              onClick={() => setKind(candidate)}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left hover:border-[var(--border-active)]"
            >
              <span className="block text-xs font-bold text-[var(--ink)]">
                {REQUEST_KIND_LABELS[candidate]}
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted)]">
                {KIND_HINTS[candidate]}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="request-form"
      data-kind={kind}
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
      noValidate
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setKind(null);
            setErrors([]);
          }}
          data-testid="request-back"
          className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-[var(--accent)]"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Back
        </button>
        <p className="text-[10px] font-bold uppercase text-[var(--dim)]">
          {REQUEST_KIND_LABELS[kind]}
        </p>
      </div>

      <label className={LABEL_CLASS}>
        Short title
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Short title"
          data-testid="request-title"
          className={FIELD_CLASS}
        />
      </label>

      {kindRequiresSourceAsset(kind) ? (
        <label className={LABEL_CLASS}>
          Source asset
          <select
            value={sourceAssetId}
            onChange={(event) => setSourceAssetId(event.target.value)}
            aria-label="Source asset"
            data-testid="request-source-asset"
            className={FIELD_CLASS}
          >
            <option value="">Choose an asset…</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {kind === "asset_retrieval" ? (
        <label className={LABEL_CLASS}>
          Describe the asset you need
          <input
            type="text"
            value={assetReference}
            onChange={(event) => setAssetReference(event.target.value)}
            aria-label="Describe the asset you need"
            data-testid="request-asset-reference"
            placeholder="e.g. The roadshow sizzle reel from March"
            className={FIELD_CLASS}
          />
        </label>
      ) : null}

      {kindRequiresPlatform(kind) ? (
        <label className={LABEL_CLASS}>
          Platform
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            aria-label="Target platform"
            data-testid="request-platform"
            className={FIELD_CLASS}
          >
            <option value="">Choose a platform…</option>
            {REQUEST_PLATFORMS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {kind === "social_cutdown" ? (
        <label className={LABEL_CLASS}>
          Duration (seconds)
          <input
            type="number"
            min={1}
            value={durationSeconds}
            onChange={(event) => setDurationSeconds(Number(event.target.value))}
            aria-label="Cutdown duration in seconds"
            data-testid="request-duration"
            className={FIELD_CLASS}
          />
        </label>
      ) : null}

      {kind === "resize" ? (
        <fieldset>
          <legend className="text-[10px] font-bold uppercase text-[var(--muted)]">
            Aspect ratios
          </legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {RESIZE_ASPECT_RATIOS.map((ratio) => {
              const active = aspectRatios.includes(ratio);
              return (
                <button
                  key={ratio}
                  type="button"
                  aria-pressed={active}
                  data-testid={`request-ratio-${ratio.replace(":", "-")}`}
                  onClick={() =>
                    setAspectRatios((current) =>
                      active ? current.filter((item) => item !== ratio) : [...current, ratio],
                    )
                  }
                  className={`min-h-11 rounded-[var(--radius-sm)] border px-3 text-xs font-bold ${
                    active
                      ? "border-[var(--accent)] bg-[var(--cvp-blue-tint)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {ratio}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="text-[10px] font-bold uppercase text-[var(--muted)]">Priority</legend>
        <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Priority">
          {REQUEST_PRIORITIES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={priority === option}
              data-testid={`request-priority-${option}`}
              onClick={() => setPriority(option)}
              className={`min-h-11 flex-1 rounded-[var(--radius-sm)] border px-3 text-xs font-bold ${
                priority === option
                  ? "border-[var(--accent)] bg-[var(--cvp-blue-tint)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {REQUEST_PRIORITY_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className={LABEL_CLASS}>
        Requested due date
        <input
          type="date"
          value={requestedDueDate}
          onChange={(event) => setRequestedDueDate(event.target.value)}
          aria-label="Requested due date"
          data-testid="request-due-date"
          className={FIELD_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        Notes (optional)
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          aria-label="Notes"
          data-testid="request-notes"
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs normal-case text-[var(--ink)]"
        />
      </label>

      {errors.length > 0 ? (
        <div
          role="alert"
          data-testid="request-error-summary"
          className="rounded-[var(--radius-sm)] bg-[var(--red-dim)] px-3 py-2"
        >
          <p className="text-xs font-bold text-[var(--red)]">
            {errors.length === 1 ? "Fix this to record the request:" : "Fix these to record the request:"}
          </p>
          <ul className="mt-1 list-disc pl-4 text-xs leading-5 text-[var(--red)]">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="submit"
        data-testid="request-submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
      >
        Record request
      </button>
    </form>
  );
}
