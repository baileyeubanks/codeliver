"use client";

import { ArrowUpRight } from "lucide-react";
import type { PipelineStageSignal, PipelineSurface } from "@/lib/covideopro/pipeline.ts";

const STATE_LABEL: Record<PipelineStageSignal["state"], string> = {
  complete: "Complete",
  active: "Active",
  upcoming: "Upcoming",
};

const SURFACE_LABEL: Record<PipelineSurface, string> = {
  creative: "Creative",
  plan: "Plan",
  sequences: "Sequences",
  delivery: "Delivery",
};

/**
 * The master narrative's stage rhythm — four cards, real state, real
 * progress, and a named doorway into each studio. No generic "View all."
 */
export default function PipelineStrip({
  stages,
  onOpen,
}: {
  stages: PipelineStageSignal[];
  onOpen: (surface: PipelineSurface) => void;
}) {
  return (
    <section aria-label="Production pipeline" className="cv-pipeline">
      {stages.map((stage) => (
        <article key={stage.id} className="cv-pipeline-card" data-state={stage.state}>
          <header>
            <strong>{stage.label}</strong>
            <span className="cv-pipeline-state">{STATE_LABEL[stage.state]}</span>
          </header>
          <div
            className="cv-pipeline-bar"
            role="progressbar"
            aria-valuenow={stage.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${stage.label} progress`}
          >
            <i style={{ width: `${stage.progress}%` }} />
          </div>
          <small>Owner · {stage.owner}</small>
          <small>Next · {stage.nextAction}</small>
          <button type="button" onClick={() => onOpen(stage.surface)}>
            Open {SURFACE_LABEL[stage.surface]} <ArrowUpRight size={13} />
          </button>
        </article>
      ))}
    </section>
  );
}
