import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTranscript,
  compareAnalysisEvaluationRuns,
  evaluateAnalysisCandidates,
  evaluateAnalysisSlo,
  planAudioAnalysisBatch,
  type AnalysisCandidate,
} from "../lib/audio-analysis/core.ts";
import {
  buildTranscriptSourceBinding,
  createSafeDemoTranscript,
  DEFAULT_TRANSCRIPT_PRIVACY,
  type TranscriptRequest,
} from "../lib/transcript/core.ts";

function transcript(seed: string, versionNumber = 1) {
  const source = buildTranscriptSourceBinding({
    assetId: "00000000-0000-4000-8000-000000000201",
    versionId: `00000000-0000-4000-8000-${versionNumber.toString().padStart(12, "0")}`,
    versionNumber,
    versionCreatedAt: `2026-07-${(13 + versionNumber).toString().padStart(2, "0")}T12:00:00.000Z`,
    durationMs: 22_000,
  });
  const request: TranscriptRequest = {
    jobId: `00000000-0000-5000-8000-${versionNumber.toString().padStart(12, "0")}`,
    source,
    languageTag: "en-US",
    diarization: true,
    verbatim: true,
    privacy: DEFAULT_TRANSCRIPT_PRIVACY,
    budget: { maxCostMicrounits: 0, maxLatencyMs: 5_000 },
    replaySeed: seed,
  };
  return createSafeDemoTranscript(request);
}

test("evaluation corpus metrics are replayable and detect precision/rate drift", () => {
  const run = analyzeTranscript({ transcript: transcript("eval") });
  const labels = run.candidates.map((candidate) => ({
    id: `label:${candidate.id}`,
    detector: candidate.detector,
    startMs: candidate.startMs,
    endMs: candidate.endMs,
  }));
  const baseline = evaluateAnalysisCandidates({
    corpusId: "cco-safe-eval",
    corpusVersion: "1",
    sourceDurationMs: run.source.durationMs,
    candidates: run.candidates,
    labels,
  });
  const falsePositive = {
    ...run.candidates[0],
    id: "false-positive-candidate",
    startMs: 19_000,
    endMs: 19_500,
  } as AnalysisCandidate;
  const current = evaluateAnalysisCandidates({
    corpusId: "cco-safe-eval",
    corpusVersion: "2",
    sourceDurationMs: run.source.durationMs,
    candidates: [...run.candidates, falsePositive],
    labels,
  });
  const drift = compareAnalysisEvaluationRuns(baseline, current, {
    maxPrecisionDrop: 0.05,
    maxCandidateRateChangeRatio: 0.1,
  });

  assert.ok(baseline.metrics.every((metric) => metric.precision === 1));
  assert.equal(drift.withinTolerance, false);
  assert.ok(drift.alerts.some((alert) => alert.includes("precision regression")));
  assert.ok(drift.alerts.some((alert) => alert.includes("candidate-rate drift")));
});

test("SLO evaluation treats replay and privacy violations as hard breaches", () => {
  const report = evaluateAnalysisSlo([
    { success: true, latencyMs: 100, replayMatched: true, contentLogged: false },
    { success: true, latencyMs: 150, replayMatched: false, contentLogged: false },
    { success: false, latencyMs: 900, replayMatched: true, contentLogged: true },
  ], {
    minimumAvailability: 0.99,
    maximumP95LatencyMs: 500,
  });

  assert.equal(report.withinSlo, false);
  assert.deepEqual(report.breaches, [
    "availability",
    "p95_latency",
    "deterministic_replay",
    "privacy_content_logging",
  ]);
});

test("analysis batch planner binds every version and rejects duplicate replay work", () => {
  const item = transcript("batch", 1);
  const plan = planAudioAnalysisBatch({
    transcripts: [item, item],
    maxConcurrency: 2,
    budget: {
      maxEstimatedLatencyMs: 10_000,
      maxInputTokens: 1_000,
      maxCandidates: 100,
      maxCostMicrounits: 0,
    },
  });

  assert.equal(plan.withinBudget, false);
  assert.ok(plan.rejectionReasons.some((reason) => reason.includes("Duplicate transcript")));
  assert.equal(plan.totalEstimatedCostMicrounits, 0);
});

test("analysis batch latency and token budgets reject oversized plans before execution", () => {
  const plan = planAudioAnalysisBatch({
    transcripts: [transcript("one", 1), transcript("two", 2)],
    maxConcurrency: 1,
    budget: {
      maxEstimatedLatencyMs: 1,
      maxInputTokens: 1,
      maxCandidates: 100,
      maxCostMicrounits: 0,
    },
  });

  assert.equal(plan.withinBudget, false);
  assert.ok(plan.rejectionReasons.includes("Batch input token budget exceeded"));
  assert.ok(plan.rejectionReasons.includes("Batch latency budget exceeded"));
});
