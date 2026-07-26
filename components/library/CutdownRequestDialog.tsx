"use client";

import { useState } from "react";
import { X } from "lucide-react";

export interface CutdownRequestInput {
  platform: string;
  durationSeconds: number;
  note: string;
}

export interface CutdownRequestDialogProps {
  assetTitle: string;
  /** Suggested platforms from the asset's curated metadata. */
  platforms: string[];
  /** Records the request; returns ok or a truthful failure reason. */
  onSubmit: (input: CutdownRequestInput) => { ok: boolean; reason?: string };
  onClose: () => void;
}

const DURATION_PRESETS = [15, 30, 60, 90];

/**
 * Request-a-cutdown mini form. Honest by design: the request is recorded in
 * the local demo store and the confirmation says exactly that.
 */
export default function CutdownRequestDialog({
  assetTitle,
  platforms,
  onSubmit,
  onClose,
}: CutdownRequestDialogProps) {
  const platformOptions = platforms.length > 0 ? platforms : ["youtube", "linkedin", "instagram"];
  const [platform, setPlatform] = useState(platformOptions[0]);
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = onSubmit({ platform, durationSeconds, note });
    if (!result.ok) {
      setError(result.reason ?? "The request could not be recorded.");
      return;
    }
    setError(null);
    setRecorded(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(10,29,61,0.45)] px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Request a cutdown of ${assetTitle}`}
        data-testid="cutdown-dialog"
        className="w-full max-w-md overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-[var(--dim)]">Request a cutdown</p>
            <h2 className="truncate text-sm font-bold text-[var(--ink)]">{assetTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cutdown request"
            className="text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {recorded ? (
          <div className="px-4 py-5 text-center" data-testid="cutdown-confirmation">
            <p className="text-sm font-bold text-[var(--ink)]">Request recorded (local preview)</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {platform} · {durationSeconds}s cutdown of {assetTitle}. The request is saved in this
              demo workspace only — nothing was dispatched to an editor.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex min-h-9 items-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
            <label className="block text-[10px] font-bold uppercase text-[var(--muted)]">
              Source asset
              <input
                type="text"
                value={assetTitle}
                readOnly
                aria-label="Source asset"
                className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs normal-case text-[var(--muted)]"
              />
            </label>

            <label className="block text-[10px] font-bold uppercase text-[var(--muted)]">
              Platform
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                aria-label="Target platform"
                data-testid="cutdown-platform"
                className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-xs normal-case text-[var(--ink)]"
              >
                {platformOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[10px] font-bold uppercase text-[var(--muted)]">
              Duration (seconds)
              <input
                type="number"
                min={1}
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(Number(event.target.value))}
                aria-label="Cutdown duration in seconds"
                data-testid="cutdown-duration"
                className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-xs normal-case text-[var(--ink)]"
              />
            </label>
            <div className="flex gap-1" aria-label="Duration presets">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDurationSeconds(preset)}
                  aria-pressed={durationSeconds === preset}
                  className={`min-h-7 rounded-[var(--radius-sm)] border px-2 text-[10px] font-bold ${
                    durationSeconds === preset
                      ? "border-[var(--accent)] bg-[var(--cvp-blue-tint)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {preset}s
                </button>
              ))}
            </div>

            <label className="block text-[10px] font-bold uppercase text-[var(--muted)]">
              Note for the editor (optional)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                aria-label="Note for the editor"
                data-testid="cutdown-note"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs normal-case text-[var(--ink)]"
              />
            </label>

            {error ? (
              <p role="alert" className="text-xs font-bold text-[var(--red)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              data-testid="cutdown-submit"
              className="inline-flex min-h-9 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
            >
              Record request
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
