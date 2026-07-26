import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustAnalysisCandidate,
  analyzeTranscript,
  audioAnalysisTelemetry,
  candidateToEditDecisionInput,
  composeAcceptedCandidates,
  decideAnalysisCandidate,
  hasRecordedAnalysisProvenance,
  planAudioAnalysisBatch,
  validateAudioAnalysisRun,
  type AnalysisCalibrationProfile,
} from "../lib/audio-analysis/core.ts";
import {
  buildTranscriptSourceBinding,
  createSafeDemoTranscript,
  DEFAULT_TRANSCRIPT_PRIVACY,
  transcriptFromLegacyRow,
  type TranscriptRequest,
} from "../lib/transcript/core.ts";

function fixture() {
  const source = buildTranscriptSourceBinding({
    assetId: "00000000-0000-4000-8000-000000000101",
    versionId: "00000000-0000-4000-8000-000000000102",
    versionNumber: 1,
    versionCreatedAt: "2026-07-14T12:00:00.000Z",
    durationMs: 22_000,
    fileSizeBytes: 10_000,
  });
  const request: TranscriptRequest = {
    jobId: "00000000-0000-5000-8000-000000000103",
    source,
    languageTag: "en-US",
    diarization: true,
    verbatim: true,
    privacy: DEFAULT_TRANSCRIPT_PRIVACY,
    budget: { maxCostMicrounits: 0, maxLatencyMs: 5_000 },
    replaySeed: "analysis-test",
  };
  return createSafeDemoTranscript(request);
}

test("analysis fuses verbatim fillers and waveform-confirmed silence deterministically", () => {
  const transcript = fixture();
  const first = analyzeTranscript({ transcript });
  const second = analyzeTranscript({ transcript });

  assert.deepEqual(first, second);
  assert.equal(first.metrics.fillerCandidates, 2);
  assert.equal(first.metrics.silenceCandidates, 3);
  assert.equal(first.mutationPerformed, false);
  assert.deepEqual(validateAudioAnalysisRun(first), []);

  const silence = first.candidates.find((candidate) => candidate.detector === "silence");
  assert.ok(silence);
  assert.equal(silence.evidence.type, "silence");
  if (silence.evidence.type === "silence") {
    assert.ok(silence.evidence.quietBinRatio >= 0.9);
    assert.equal(silence.evidence.waveformSource, "safe_demo");
  }
});

test("legacy timing without acoustic evidence suppresses silence candidates", () => {
  const safe = fixture();
  const legacy = transcriptFromLegacyRow({
    id: "00000000-0000-4000-8000-000000000120",
    asset_id: safe.source.assetId,
    version_id: safe.source.versionId,
    language: "en",
    status: "completed",
    created_at: "2026-07-14T13:00:00.000Z",
    segments: [
      { start: 0.5, end: 2, text: "Well um start" },
      { start: 5, end: 7, text: "Continue after a gap" },
    ],
  }, safe.source);
  const run = analyzeTranscript({ transcript: legacy });

  assert.equal(run.metrics.fillerCandidates, 1);
  assert.equal(run.metrics.silenceCandidates, 0);
  assert.equal(run.metrics.suppressedSilenceGaps, 1);
});

test("analysis rejects transcript replay tampering even when version ids look valid", () => {
  const safe = fixture();
  const tampered = {
    ...safe,
    tokens: safe.tokens.map((token, index) => index === 0 ? { ...token, text: "Changed" } : token),
  };

  assert.throws(() => analyzeTranscript({ transcript: tampered }), /replay digest is invalid/i);
});

test("uncalibrated candidates cannot display as high confidence", () => {
  const run = analyzeTranscript({ transcript: fixture() });

  assert.ok(run.candidates.every((candidate) => candidate.confidence.displayBand === "review_required"));
  assert.ok(run.candidates.every((candidate) => candidate.confidence.highConfidenceGate === "blocked"));
});

test("95 percent precision gate also requires a sufficiently sized evaluation corpus", () => {
  const smallProfile: AnalysisCalibrationProfile = {
    id: "small-filler-profile",
    detector: "filler_word",
    version: "1",
    corpusId: "cco-eval",
    corpusVersion: "1",
    evaluatedExamples: 99,
    precision: 1,
    expectedCalibrationError: 0.02,
    bins: [{ lowerInclusive: 0, upperInclusive: 1, calibratedProbability: 0.97 }],
    createdAt: "2026-07-14T12:00:00.000Z",
  };
  const certifiedProfile = { ...smallProfile, id: "certified-filler-profile", evaluatedExamples: 100, precision: 0.95 };

  const provisional = analyzeTranscript({ transcript: fixture(), calibrationProfiles: [smallProfile] });
  const certified = analyzeTranscript({ transcript: fixture(), calibrationProfiles: [certifiedProfile] });
  const provisionalFiller = provisional.candidates.find((candidate) => candidate.detector === "filler_word");
  const certifiedFiller = certified.candidates.find((candidate) => candidate.detector === "filler_word");

  assert.equal(provisionalFiller?.confidence.displayBand, "review_required");
  assert.equal(certifiedFiller?.confidence.displayBand, "high");
  assert.equal(certifiedFiller?.confidence.highConfidenceGate, "corpus_precision_verified");
});

test("human accept and reject decisions are explicit and terminal", () => {
  const run = analyzeTranscript({ transcript: fixture() });
  const accepted = decideAnalysisCandidate(run.candidates[0], "accept", {
    actorId: "reviewer-1",
    decidedAt: "2026-07-14T15:00:00.000Z",
    rationale: "Natural join in preview",
  });
  const rejected = decideAnalysisCandidate(run.candidates[1], "reject", {
    actorId: "reviewer-1",
    decidedAt: "2026-07-14T15:01:00.000Z",
  });

  assert.equal(accepted.review.status, "accepted");
  assert.equal(rejected.review.status, "rejected");
  assert.throws(() => decideAnalysisCandidate(accepted, "reject", {
    actorId: "reviewer-1",
    decidedAt: "2026-07-14T15:02:00.000Z",
  }), /Only proposed/i);
});

test("adjustment creates a new proposed revision without changing source evidence", () => {
  const candidate = analyzeTranscript({ transcript: fixture() }).candidates[0];
  const adjusted = adjustAnalysisCandidate(candidate, {
    startMs: candidate.startMs + 10,
    endMs: candidate.endMs - 10,
  });

  assert.notEqual(adjusted.id, candidate.id);
  assert.equal(adjusted.review.revision, 1);
  assert.equal(adjusted.review.supersedesCandidateId, candidate.id);
  assert.deepEqual(adjusted.evidence, candidate.evidence);
  assert.equal(adjusted.review.status, "proposed");
});

test("accepted candidates compile to a reversible non-publishing composition", () => {
  const run = analyzeTranscript({ transcript: fixture() });
  const accepted = run.candidates.slice(0, 2).map((candidate, index) => decideAnalysisCandidate(
    candidate,
    "accept",
    { actorId: "reviewer-1", decidedAt: `2026-07-14T15:0${index}:00.000Z` },
  ));
  const composition = composeAcceptedCandidates(run.source, accepted);
  const excludedDuration = composition.spans
    .filter((span) => span.kind === "exclude")
    .reduce((sum, span) => sum + span.sourceEndMs - span.sourceStartMs, 0);

  assert.equal(composition.reversible, true);
  assert.equal(composition.sourceMediaMutated, false);
  assert.equal(composition.publicationAllowed, false);
  assert.equal(composition.compositionDurationMs, composition.sourceDurationMs - excludedDuration);
  assert.ok(composition.spans.some((span) => span.kind === "keep"));
});

test("candidate conversion reuses edit-decision types and is idempotent", () => {
  const candidate = analyzeTranscript({ transcript: fixture() }).candidates[0];
  const first = candidateToEditDecisionInput(candidate);
  const second = candidateToEditDecisionInput(candidate);

  assert.deepEqual(first, second);
  assert.match(first.client_request_id, /^[0-9a-f-]{36}$/);
  assert.ok(first.decision_type === "remove_filler" || first.decision_type === "remove_silence");
  assert.equal(first.metadata.media_mutation, false);
  assert.equal(first.metadata.source_identity_digest, candidate.source.identityDigest);
});

test("recorded analysis provenance rejects stale or partially forged scan decisions", () => {
  const candidate = analyzeTranscript({ transcript: fixture() }).candidates[0];
  const decision = candidateToEditDecisionInput(candidate);

  assert.equal(hasRecordedAnalysisProvenance(decision.metadata, candidate.source), true);
  assert.equal(hasRecordedAnalysisProvenance({ ...decision.metadata, media_mutation: true }, candidate.source), false);
  assert.equal(hasRecordedAnalysisProvenance(decision.metadata, {
    ...candidate.source,
    identityDigest: "fnv1a64:stale",
  }), false);
});

test("invalid analysis budgets fail before planning or candidate generation", () => {
  assert.throws(() => analyzeTranscript({
    transcript: fixture(),
    budget: { maxEstimatedLatencyMs: 1, maxInputTokens: 0, maxCandidates: 0, maxCostMicrounits: 0 },
  }), /Analysis budget is invalid/i);
  assert.throws(() => planAudioAnalysisBatch({
    transcripts: [fixture()],
    maxConcurrency: 1,
    budget: { maxEstimatedLatencyMs: 1, maxInputTokens: 1, maxCandidates: 0, maxCostMicrounits: 0 },
  }), /Analysis budget is invalid/i);
});

test("analysis telemetry cannot leak transcript text or filler evidence", () => {
  const run = analyzeTranscript({ transcript: fixture() });
  const serialized = JSON.stringify(audioAnalysisTelemetry(run));

  assert.equal(serialized.includes("welcome"), false);
  assert.equal(serialized.includes("um"), false);
  assert.equal(serialized.includes(run.source.versionId), true);
  assert.equal(serialized.includes('"contentLogged":false'), true);
});
