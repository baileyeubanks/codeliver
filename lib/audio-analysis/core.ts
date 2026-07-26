import type {
  TranscriptDocument,
  TranscriptSourceBinding,
  TranscriptToken,
} from "../transcript/core";
import type {
  EditDecisionInput,
} from "../edit-decisions";
import type {
  EditDecisionSource,
  EditDecisionStatus,
  EditDecisionType,
} from "../types/codeliver";

export const AUDIO_ANALYSIS_SCHEMA_VERSION = "cco.audio-analysis.v1" as const;
export const AUDIO_ANALYSIS_PIPELINE_VERSION = "cco-audio-analysis-1.0.0" as const;
export const AUDIO_ANALYSIS_CONFIG_VERSION = "filler-silence-safe-v1" as const;

const MAX_ANALYSIS_CANDIDATES = 10_000;
const MAX_ANALYSIS_BATCH_ITEMS = 100;

export type AnalysisDetectorKind = "filler_word" | "silence";
export type CandidateRisk =
  | "adjacent_speech"
  | "cross_speaker_boundary"
  | "estimated_timing"
  | "uncalibrated"
  | "no_acoustic_evidence";
export type CalibrationStatus = "uncalibrated" | "provisional" | "certified";
export type ConfidenceDisplayBand = "review_required" | "low" | "medium" | "high";

export interface AnalysisCalibrationBin {
  readonly lowerInclusive: number;
  readonly upperInclusive: number;
  readonly calibratedProbability: number;
}

export interface AnalysisCalibrationProfile {
  readonly id: string;
  readonly detector: AnalysisDetectorKind;
  readonly version: string;
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly evaluatedExamples: number;
  readonly precision: number;
  readonly expectedCalibrationError: number;
  readonly bins: readonly AnalysisCalibrationBin[];
  readonly createdAt: string;
}

export interface CandidateConfidence {
  readonly raw: number;
  readonly calibrated: number | null;
  readonly calibrationProfileId: string | null;
  readonly calibrationStatus: CalibrationStatus;
  readonly displayBand: ConfidenceDisplayBand;
  readonly highConfidenceGate: "blocked" | "corpus_precision_verified";
}

export interface CandidatePreviewWindow {
  readonly sourceContextStartMs: number;
  readonly sourceContextEndMs: number;
  readonly proposedStartMs: number;
  readonly proposedEndMs: number;
  readonly preRollMs: number;
  readonly postRollMs: number;
}

export interface FillerEvidence {
  readonly type: "filler_word";
  readonly tokenIds: readonly string[];
  readonly normalizedText: string;
  readonly providerTokenConfidence: number | null;
}

export interface SilenceEvidence {
  readonly type: "silence";
  readonly leftTokenId: string;
  readonly rightTokenId: string;
  readonly transcriptGapMs: number;
  readonly analyzedBinCount: number;
  readonly quietBinRatio: number;
  readonly meanPeak: number;
  readonly maxPeak: number;
  readonly waveformSource: string;
}

export type AnalysisEvidence = FillerEvidence | SilenceEvidence;

export interface CandidateReview {
  readonly status: Exclude<EditDecisionStatus, "applied">;
  readonly revision: number;
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  readonly rationale: string | null;
  readonly supersedesCandidateId: string | null;
}

export interface AnalysisCandidate {
  readonly schemaVersion: typeof AUDIO_ANALYSIS_SCHEMA_VERSION;
  readonly id: string;
  readonly runId: string;
  readonly transcriptId: string;
  readonly source: TranscriptSourceBinding;
  readonly detector: AnalysisDetectorKind;
  readonly detectorVersion: string;
  readonly decisionType: Extract<EditDecisionType, "remove_filler" | "remove_silence">;
  readonly decisionSource: Extract<EditDecisionSource, "filler_scan" | "silence_scan">;
  readonly startMs: number;
  readonly endMs: number;
  readonly label: string;
  readonly confidence: CandidateConfidence;
  readonly evidence: AnalysisEvidence;
  readonly risks: readonly CandidateRisk[];
  readonly preview: CandidatePreviewWindow;
  readonly review: CandidateReview;
  readonly deterministicReplayKey: string;
}

export interface AudioAnalysisConfig {
  readonly version: typeof AUDIO_ANALYSIS_CONFIG_VERSION;
  readonly fillerLexicon: readonly string[];
  readonly minimumSilenceMs: number;
  readonly speechGuardMs: number;
  readonly contextMs: number;
  readonly quietPeakThreshold: number;
  readonly requiredQuietBinRatio: number;
  readonly maxCandidates: number;
}

export interface AudioAnalysisBudget {
  readonly maxEstimatedLatencyMs: number;
  readonly maxInputTokens: number;
  readonly maxCandidates: number;
  readonly maxCostMicrounits: number;
}

export interface AudioAnalysisMetrics {
  readonly inputTokens: number;
  readonly waveformBins: number;
  readonly fillerCandidates: number;
  readonly silenceCandidates: number;
  readonly suppressedSilenceGaps: number;
  readonly estimatedLatencyMs: number;
  readonly estimatedCostMicrounits: 0;
}

export interface AudioAnalysisReplay {
  readonly algorithm: "fnv1a64-v1";
  readonly inputDigest: string;
  readonly configurationDigest: string;
  readonly outputDigest: string;
}

export interface AudioAnalysisRun {
  readonly schemaVersion: typeof AUDIO_ANALYSIS_SCHEMA_VERSION;
  readonly runId: string;
  readonly transcriptId: string;
  readonly source: TranscriptSourceBinding;
  readonly pipelineVersion: typeof AUDIO_ANALYSIS_PIPELINE_VERSION;
  readonly configuration: AudioAnalysisConfig;
  readonly calibrationProfiles: readonly AnalysisCalibrationProfile[];
  readonly candidates: readonly AnalysisCandidate[];
  readonly metrics: AudioAnalysisMetrics;
  readonly replay: AudioAnalysisReplay;
  readonly createdAt: string;
  readonly mutationPerformed: false;
}

export interface AnalysisDecisionContext {
  readonly actorId: string;
  readonly decidedAt: string;
  readonly rationale?: string | null;
}

export interface CompositionSpan {
  readonly kind: "keep" | "exclude";
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly compositionStartMs: number;
  readonly compositionEndMs: number;
  readonly candidateIds: readonly string[];
}

export interface ReversibleCompositionPreview {
  readonly schemaVersion: "cco.composition-preview.v1";
  readonly compositionId: string;
  readonly source: TranscriptSourceBinding;
  readonly sourceDurationMs: number;
  readonly compositionDurationMs: number;
  readonly spans: readonly CompositionSpan[];
  readonly acceptedCandidateIds: readonly string[];
  readonly reversible: true;
  readonly sourceMediaMutated: false;
  readonly publicationAllowed: false;
  readonly deterministicReplayKey: string;
}

export interface RecordedAnalysisEditDecision {
  readonly id: string;
  readonly assetId: string;
  readonly versionId: string;
  readonly status: EditDecisionStatus;
  readonly decisionType: EditDecisionType;
  readonly startSeconds: number;
  readonly endSeconds: number | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasRecordedAnalysisProvenance(
  metadata: unknown,
  source: TranscriptSourceBinding,
): boolean {
  if (!isPlainRecord(metadata)) return false;
  return (
    metadata.schema_version === AUDIO_ANALYSIS_SCHEMA_VERSION &&
    metadata.source_identity_digest === source.identityDigest &&
    typeof metadata.candidate_id === "string" &&
    typeof metadata.analysis_run_id === "string" &&
    typeof metadata.transcript_id === "string" &&
    typeof metadata.deterministic_replay_key === "string" &&
    metadata.media_mutation === false
  );
}

export interface EvaluationLabel {
  readonly id: string;
  readonly detector: AnalysisDetectorKind;
  readonly startMs: number;
  readonly endMs: number;
}

export interface DetectorEvaluationMetrics {
  readonly detector: AnalysisDetectorKind;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly precision: number;
  readonly recall: number;
  readonly candidateRatePerMinute: number;
}

export interface AnalysisEvaluationReport {
  readonly reportId: string;
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly sourceDurationMs: number;
  readonly metrics: readonly DetectorEvaluationMetrics[];
  readonly replayDigest: string;
}

export interface AnalysisDriftReport {
  readonly baselineReportId: string;
  readonly currentReportId: string;
  readonly alerts: readonly string[];
  readonly withinTolerance: boolean;
}

export interface AnalysisSloSample {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly replayMatched: boolean;
  readonly contentLogged: boolean;
}

export interface AnalysisSloReport {
  readonly availability: number;
  readonly p95LatencyMs: number;
  readonly replayMismatchCount: number;
  readonly contentLoggingViolationCount: number;
  readonly withinSlo: boolean;
  readonly breaches: readonly string[];
}

export interface AudioAnalysisBatchPlanItem {
  readonly transcriptId: string;
  readonly source: TranscriptSourceBinding;
  readonly inputTokens: number;
  readonly waveformBins: number;
  readonly estimatedLatencyMs: number;
  readonly estimatedCostMicrounits: 0;
}

export interface AudioAnalysisBatchPlan {
  readonly planId: string;
  readonly items: readonly AudioAnalysisBatchPlanItem[];
  readonly maxConcurrency: number;
  readonly totalInputTokens: number;
  readonly criticalPathEstimatedLatencyMs: number;
  readonly totalEstimatedCostMicrounits: 0;
  readonly withinBudget: boolean;
  readonly rejectionReasons: readonly string[];
  readonly deterministicReplayKey: string;
}

export const DEFAULT_AUDIO_ANALYSIS_CONFIG: AudioAnalysisConfig = Object.freeze({
  version: AUDIO_ANALYSIS_CONFIG_VERSION,
  fillerLexicon: Object.freeze(["um", "uh", "erm", "hmm"]),
  minimumSilenceMs: 700,
  speechGuardMs: 100,
  contextMs: 1_000,
  quietPeakThreshold: 0.08,
  requiredQuietBinRatio: 0.9,
  maxCandidates: 2_000,
});

export const DEFAULT_AUDIO_ANALYSIS_BUDGET: AudioAnalysisBudget = Object.freeze({
  maxEstimatedLatencyMs: 30_000,
  maxInputTokens: 250_000,
  maxCandidates: 2_000,
  maxCostMicrounits: 0,
});

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Deterministic data must use finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  throw new TypeError(`Unsupported deterministic value: ${typeof value}`);
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hash64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function digest(value: unknown): string {
  return `fnv1a64:${hash64(stableJson(value))}`;
}

function uuid(value: unknown): string {
  const serialized = stableJson(value);
  const chars = `${hash64(`left:${serialized}`)}${hash64(`right:${serialized}`)}`.split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const joined = chars.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, places = 4): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function assertSourceTimeRange(startMs: number, endMs: number, durationMs: number): void {
  if (
    !Number.isInteger(startMs) ||
    !Number.isInteger(endMs) ||
    startMs < 0 ||
    endMs <= startMs ||
    endMs > durationMs
  ) {
    throw new TypeError("Candidate source-time range is invalid");
  }
}

function sameSource(left: TranscriptSourceBinding, right: TranscriptSourceBinding): boolean {
  return (
    left.assetId === right.assetId &&
    left.versionId === right.versionId &&
    left.identityDigest === right.identityDigest
  );
}

function profileStatus(profile: AnalysisCalibrationProfile | undefined): CalibrationStatus {
  if (!profile || profile.evaluatedExamples === 0) return "uncalibrated";
  if (profile.precision >= 0.95 && profile.evaluatedExamples >= 100) return "certified";
  return "provisional";
}

function calibrateConfidence(
  raw: number,
  profile: AnalysisCalibrationProfile | undefined,
): CandidateConfidence {
  const status = profileStatus(profile);
  const bin = profile?.bins.find(
    (item) => raw >= item.lowerInclusive && raw <= item.upperInclusive,
  );
  const calibrated = bin ? clamp(bin.calibratedProbability) : null;
  const highConfidenceAllowed = status === "certified" && calibrated !== null;
  let displayBand: ConfidenceDisplayBand = "review_required";
  if (highConfidenceAllowed) {
    if (calibrated >= 0.9) displayBand = "high";
    else if (calibrated >= 0.65) displayBand = "medium";
    else displayBand = "low";
  }
  return Object.freeze({
    raw: round(clamp(raw)),
    calibrated: calibrated === null ? null : round(calibrated),
    calibrationProfileId: profile?.id ?? null,
    calibrationStatus: status,
    displayBand,
    highConfidenceGate: highConfidenceAllowed ? "corpus_precision_verified" : "blocked",
  });
}

function profileFor(
  detector: AnalysisDetectorKind,
  profiles: readonly AnalysisCalibrationProfile[],
): AnalysisCalibrationProfile | undefined {
  return profiles.find((profile) => profile.detector === detector);
}

function tokenGapRisks(
  left: TranscriptToken | undefined,
  right: TranscriptToken | undefined,
  timingEstimated: boolean,
): CandidateRisk[] {
  const risks: CandidateRisk[] = ["uncalibrated"];
  if (left && right && (left.speakerId !== right.speakerId)) risks.push("cross_speaker_boundary");
  if (left && right && right.startMs - left.endMs < 160) risks.push("adjacent_speech");
  if (timingEstimated) risks.push("estimated_timing");
  return risks;
}

function contextWindow(
  startMs: number,
  endMs: number,
  durationMs: number,
  contextMs: number,
): CandidatePreviewWindow {
  return Object.freeze({
    sourceContextStartMs: Math.max(0, startMs - contextMs),
    sourceContextEndMs: Math.min(durationMs, endMs + contextMs),
    proposedStartMs: startMs,
    proposedEndMs: endMs,
    preRollMs: Math.min(contextMs, startMs),
    postRollMs: Math.min(contextMs, durationMs - endMs),
  });
}

function reviewPending(): CandidateReview {
  return Object.freeze({
    status: "proposed",
    revision: 0,
    decidedAt: null,
    decidedBy: null,
    rationale: null,
    supersedesCandidateId: null,
  });
}

function estimatedLatencyMs(document: TranscriptDocument): number {
  return Math.max(1, Math.ceil(document.tokens.length * 0.08 + document.waveform.peaks.length * 0.015));
}

function validateConfig(config: AudioAnalysisConfig): void {
  if (config.version !== AUDIO_ANALYSIS_CONFIG_VERSION) throw new TypeError("Unsupported analysis config version");
  if (config.fillerLexicon.length === 0) throw new TypeError("Filler lexicon cannot be empty");
  if (config.fillerLexicon.some((word) => !word.trim() || word !== word.toLowerCase())) {
    throw new TypeError("Filler lexicon entries must be normalized lowercase words");
  }
  if (!Number.isInteger(config.minimumSilenceMs) || config.minimumSilenceMs < 100) {
    throw new TypeError("minimumSilenceMs must be an integer of at least 100ms");
  }
  if (!Number.isInteger(config.speechGuardMs) || config.speechGuardMs < 0) {
    throw new TypeError("speechGuardMs must be a non-negative integer");
  }
  if (config.quietPeakThreshold < 0 || config.quietPeakThreshold > 1) {
    throw new TypeError("quietPeakThreshold must be between 0 and 1");
  }
  if (config.requiredQuietBinRatio < 0 || config.requiredQuietBinRatio > 1) {
    throw new TypeError("requiredQuietBinRatio must be between 0 and 1");
  }
  if (!Number.isInteger(config.maxCandidates) || config.maxCandidates < 1 || config.maxCandidates > MAX_ANALYSIS_CANDIDATES) {
    throw new TypeError(`maxCandidates must be between 1 and ${MAX_ANALYSIS_CANDIDATES}`);
  }
}

function ensureBudget(
  document: TranscriptDocument,
  config: AudioAnalysisConfig,
  budget: AudioAnalysisBudget,
): void {
  assertAudioAnalysisBudget(budget);
  const latency = estimatedLatencyMs(document);
  if (document.tokens.length > budget.maxInputTokens) throw new RangeError("Analysis input token budget exceeded");
  if (config.maxCandidates > budget.maxCandidates) throw new RangeError("Analysis candidate budget exceeded");
  if (latency > budget.maxEstimatedLatencyMs) throw new RangeError("Analysis latency budget exceeded");
}

function assertAudioAnalysisBudget(budget: AudioAnalysisBudget): void {
  if (
    !Number.isInteger(budget.maxEstimatedLatencyMs) ||
    budget.maxEstimatedLatencyMs < 1 ||
    !Number.isInteger(budget.maxInputTokens) ||
    budget.maxInputTokens < 1 ||
    !Number.isInteger(budget.maxCandidates) ||
    budget.maxCandidates < 1 ||
    budget.maxCandidates > MAX_ANALYSIS_CANDIDATES ||
    !Number.isInteger(budget.maxCostMicrounits) ||
    budget.maxCostMicrounits < 0
  ) {
    throw new RangeError("Analysis budget is invalid");
  }
}

function assertTranscriptAuthority(document: TranscriptDocument): void {
  const sourceDigest = digest({
    assetId: document.source.assetId,
    versionId: document.source.versionId,
    versionNumber: document.source.versionNumber,
    versionCreatedAt: document.source.versionCreatedAt,
    durationMs: document.source.durationMs,
    fileSizeBytes: document.source.fileSizeBytes,
    mediaSha256: document.source.mediaSha256,
  });
  if (sourceDigest !== document.source.identityDigest) {
    throw new TypeError("Transcript source identity digest is invalid");
  }
  const outputDigest = digest({
    ...document,
    provenance: {
      ...document.provenance,
      replay: { ...document.provenance.replay, outputDigest: "" },
    },
  });
  if (outputDigest !== document.provenance.replay.outputDigest) {
    throw new TypeError("Transcript deterministic replay digest is invalid");
  }
  if (
    document.waveform.durationMs !== document.source.durationMs ||
    document.waveform.peaks.length !== Math.ceil(document.source.durationMs / document.waveform.binDurationMs)
  ) {
    throw new TypeError("Transcript waveform does not cover the exact source timeline");
  }
}

function candidateReplayBasis(
  candidate: AnalysisCandidate,
): Omit<AnalysisCandidate, "deterministicReplayKey"> {
  return Object.fromEntries(
    Object.entries(candidate).filter(([key]) => key !== "deterministicReplayKey"),
  ) as Omit<AnalysisCandidate, "deterministicReplayKey">;
}

function finalizeCandidate(candidate: Omit<AnalysisCandidate, "deterministicReplayKey">): AnalysisCandidate {
  return deepFreeze({
    ...candidate,
    deterministicReplayKey: digest(candidate),
  });
}

function candidateOutputDigest(run: Omit<AudioAnalysisRun, "replay"> & { replay: Omit<AudioAnalysisReplay, "outputDigest"> }): string {
  return digest({ ...run, replay: { ...run.replay, outputDigest: "" } });
}

export function audioAnalysisInputDigest(document: TranscriptDocument): string {
  return digest({
    transcriptId: document.documentId,
    transcriptReplay: document.provenance.replay.outputDigest,
    source: document.source,
  });
}

export function audioAnalysisConfigurationDigest(config: AudioAnalysisConfig): string {
  return digest(config);
}

export function analyzeTranscript(input: {
  readonly transcript: TranscriptDocument;
  readonly config?: AudioAnalysisConfig;
  readonly calibrationProfiles?: readonly AnalysisCalibrationProfile[];
  readonly budget?: AudioAnalysisBudget;
}): AudioAnalysisRun {
  const document = input.transcript;
  const config = input.config ?? DEFAULT_AUDIO_ANALYSIS_CONFIG;
  const profiles = input.calibrationProfiles ?? [];
  const budget = input.budget ?? DEFAULT_AUDIO_ANALYSIS_BUDGET;
  validateConfig(config);
  assertTranscriptAuthority(document);
  ensureBudget(document, config, budget);
  if (!document.source.versionId || !document.source.identityDigest) {
    throw new TypeError("Analysis requires immutable source-version provenance");
  }
  if (!document.provenance.replay.outputDigest) {
    throw new TypeError("Analysis requires deterministic transcript replay provenance");
  }

  const configurationDigest = audioAnalysisConfigurationDigest(config);
  const inputDigest = audioAnalysisInputDigest(document);
  const runId = uuid({
    kind: "audio-analysis-run",
    inputDigest,
    configurationDigest,
    calibrationProfiles: profiles.map((profile) => profile.id),
  });
  const candidates: AnalysisCandidate[] = [];
  const fillerSet = new Set(config.fillerLexicon);
  const timingEstimated = document.tokens.some(
    (token) => token.alignment.basis === "estimated_segment",
  );

  for (const [index, token] of document.tokens.entries()) {
    if (!fillerSet.has(token.normalizedText)) continue;
    const left = document.tokens[index - 1];
    const right = document.tokens[index + 1];
    const detector: AnalysisDetectorKind = "filler_word";
    const raw = token.confidence === null ? 0.5 : 0.55 + token.confidence * 0.4;
    const evidence: FillerEvidence = Object.freeze({
      type: "filler_word",
      tokenIds: Object.freeze([token.id]),
      normalizedText: token.normalizedText,
      providerTokenConfidence: token.confidence,
    });
    const base = {
      schemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
      id: uuid({ runId, detector, tokenId: token.id, startMs: token.startMs, endMs: token.endMs }),
      runId,
      transcriptId: document.documentId,
      source: document.source,
      detector,
      detectorVersion: "filler-lexicon-v1",
      decisionType: "remove_filler" as const,
      decisionSource: "filler_scan" as const,
      startMs: token.startMs,
      endMs: token.endMs,
      label: `Review filler: ${token.text}`,
      confidence: calibrateConfidence(raw, profileFor(detector, profiles)),
      evidence,
      risks: Object.freeze(tokenGapRisks(left, right, timingEstimated)),
      preview: contextWindow(token.startMs, token.endMs, document.source.durationMs, config.contextMs),
      review: reviewPending(),
    };
    candidates.push(finalizeCandidate(base));
  }

  let suppressedSilenceGaps = 0;
  if (document.waveform.source !== "unavailable") {
    for (let index = 0; index < document.tokens.length - 1; index += 1) {
      const left = document.tokens[index];
      const right = document.tokens[index + 1];
      const transcriptGapMs = right.startMs - left.endMs;
      if (transcriptGapMs < config.minimumSilenceMs) continue;
      const proposedStartMs = left.endMs + config.speechGuardMs;
      const proposedEndMs = right.startMs - config.speechGuardMs;
      if (proposedEndMs <= proposedStartMs) {
        suppressedSilenceGaps += 1;
        continue;
      }
      const startBin = Math.floor(proposedStartMs / document.waveform.binDurationMs);
      const endBinExclusive = Math.min(
        document.waveform.peaks.length,
        Math.ceil(proposedEndMs / document.waveform.binDurationMs),
      );
      const peaks = document.waveform.peaks.slice(startBin, endBinExclusive);
      if (peaks.length === 0) {
        suppressedSilenceGaps += 1;
        continue;
      }
      const quietBins = peaks.filter((peak) => peak <= config.quietPeakThreshold).length;
      const quietBinRatio = quietBins / peaks.length;
      const meanPeak = peaks.reduce((sum, peak) => sum + peak, 0) / peaks.length;
      const maxPeak = Math.max(...peaks);
      if (quietBinRatio < config.requiredQuietBinRatio || maxPeak > config.quietPeakThreshold * 1.5) {
        suppressedSilenceGaps += 1;
        continue;
      }
      const detector: AnalysisDetectorKind = "silence";
      const durationSignal = clamp((transcriptGapMs - config.minimumSilenceMs) / 2_000);
      const acousticSignal = clamp(1 - meanPeak / Math.max(config.quietPeakThreshold, 0.001));
      const raw = 0.45 + durationSignal * 0.25 + quietBinRatio * 0.2 + acousticSignal * 0.1;
      const risks = tokenGapRisks(left, right, timingEstimated);
      const evidence: SilenceEvidence = Object.freeze({
        type: "silence",
        leftTokenId: left.id,
        rightTokenId: right.id,
        transcriptGapMs,
        analyzedBinCount: peaks.length,
        quietBinRatio: round(quietBinRatio),
        meanPeak: round(meanPeak),
        maxPeak: round(maxPeak),
        waveformSource: document.waveform.source,
      });
      const base = {
        schemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
        id: uuid({
          runId,
          detector,
          leftTokenId: left.id,
          rightTokenId: right.id,
          proposedStartMs,
          proposedEndMs,
        }),
        runId,
        transcriptId: document.documentId,
        source: document.source,
        detector,
        detectorVersion: "waveform-gap-fusion-v1",
        decisionType: "remove_silence" as const,
        decisionSource: "silence_scan" as const,
        startMs: proposedStartMs,
        endMs: proposedEndMs,
        label: `Review ${round(transcriptGapMs / 1_000, 2)}s silence`,
        confidence: calibrateConfidence(raw, profileFor(detector, profiles)),
        evidence,
        risks: Object.freeze(risks),
        preview: contextWindow(proposedStartMs, proposedEndMs, document.source.durationMs, config.contextMs),
        review: reviewPending(),
      };
      candidates.push(finalizeCandidate(base));
    }
  } else {
    suppressedSilenceGaps = document.tokens.slice(0, -1).filter(
      (token, index) => document.tokens[index + 1].startMs - token.endMs >= config.minimumSilenceMs,
    ).length;
  }

  candidates.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
  if (candidates.length > config.maxCandidates || candidates.length > budget.maxCandidates) {
    throw new RangeError("Analysis candidate budget exceeded after detection");
  }
  const metrics: AudioAnalysisMetrics = Object.freeze({
    inputTokens: document.tokens.length,
    waveformBins: document.waveform.peaks.length,
    fillerCandidates: candidates.filter((candidate) => candidate.detector === "filler_word").length,
    silenceCandidates: candidates.filter((candidate) => candidate.detector === "silence").length,
    suppressedSilenceGaps,
    estimatedLatencyMs: estimatedLatencyMs(document),
    estimatedCostMicrounits: 0,
  });
  const runWithoutOutput = {
    schemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
    runId,
    transcriptId: document.documentId,
    source: document.source,
    pipelineVersion: AUDIO_ANALYSIS_PIPELINE_VERSION,
    configuration: config,
    calibrationProfiles: profiles,
    candidates,
    metrics,
    replay: {
      algorithm: "fnv1a64-v1" as const,
      inputDigest,
      configurationDigest,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    mutationPerformed: false as const,
  };
  const outputDigest = candidateOutputDigest(runWithoutOutput);
  return deepFreeze({
    ...runWithoutOutput,
    replay: { ...runWithoutOutput.replay, outputDigest },
  });
}

export function validateAudioAnalysisRun(run: AudioAnalysisRun): readonly string[] {
  const errors: string[] = [];
  if (run.schemaVersion !== AUDIO_ANALYSIS_SCHEMA_VERSION) errors.push("Unsupported analysis schema");
  if (run.pipelineVersion !== AUDIO_ANALYSIS_PIPELINE_VERSION) errors.push("Unsupported analysis pipeline");
  if (run.mutationPerformed !== false) errors.push("Analysis run must never mutate media");
  for (const candidate of run.candidates) {
    if (!sameSource(candidate.source, run.source)) errors.push(`Candidate ${candidate.id} source binding mismatch`);
    if (candidate.runId !== run.runId) errors.push(`Candidate ${candidate.id} run binding mismatch`);
    if (candidate.transcriptId !== run.transcriptId) errors.push(`Candidate ${candidate.id} transcript binding mismatch`);
    try {
      assertSourceTimeRange(candidate.startMs, candidate.endMs, run.source.durationMs);
    } catch {
      errors.push(`Candidate ${candidate.id} has an invalid range`);
    }
    if (candidate.deterministicReplayKey !== digest(candidateReplayBasis(candidate))) {
      errors.push(`Candidate ${candidate.id} replay key mismatch`);
    }
    if (candidate.confidence.displayBand === "high" && candidate.confidence.highConfidenceGate !== "corpus_precision_verified") {
      errors.push(`Candidate ${candidate.id} bypasses the high-confidence corpus gate`);
    }
  }
  const runWithoutOutput = {
    ...run,
    replay: {
      algorithm: run.replay.algorithm,
      inputDigest: run.replay.inputDigest,
      configurationDigest: run.replay.configurationDigest,
    },
  };
  if (run.replay.outputDigest !== candidateOutputDigest(runWithoutOutput)) {
    errors.push("Analysis output replay digest mismatch");
  }
  return Object.freeze(errors);
}

export function validateAudioAnalysisRunAgainstTranscript(
  run: AudioAnalysisRun,
  transcript: TranscriptDocument,
): readonly string[] {
  const errors = [...validateAudioAnalysisRun(run)];
  if (run.transcriptId !== transcript.documentId) {
    errors.push("Analysis transcript id does not match the persisted transcript");
  }
  if (!sameSource(run.source, transcript.source)) {
    errors.push("Analysis source does not match the persisted transcript");
  }
  const inputDigest = audioAnalysisInputDigest(transcript);
  if (run.replay.inputDigest !== inputDigest) {
    errors.push("Analysis input replay digest does not match the persisted transcript");
  }
  const configurationDigest = audioAnalysisConfigurationDigest(run.configuration);
  if (run.replay.configurationDigest !== configurationDigest) {
    errors.push("Analysis configuration replay digest mismatch");
  }
  const expectedRunId = uuid({
    kind: "audio-analysis-run",
    inputDigest,
    configurationDigest,
    calibrationProfiles: run.calibrationProfiles.map((profile) => profile.id),
  });
  if (run.runId !== expectedRunId) {
    errors.push("Analysis run id does not match its transcript and configuration lineage");
  }
  return Object.freeze(errors);
}

export function decideAnalysisCandidate(
  candidate: AnalysisCandidate,
  decision: "accept" | "reject",
  context: AnalysisDecisionContext,
): AnalysisCandidate {
  if (candidate.review.status !== "proposed") {
    throw new TypeError("Only proposed candidates can be accepted or rejected");
  }
  if (!context.actorId.trim()) throw new TypeError("Decision actor is required");
  if (!Number.isFinite(Date.parse(context.decidedAt))) throw new TypeError("Decision timestamp is invalid");
  const updated = {
    ...candidate,
    review: Object.freeze({
      ...candidate.review,
      status: decision === "accept" ? "accepted" as const : "rejected" as const,
      decidedAt: new Date(context.decidedAt).toISOString(),
      decidedBy: context.actorId,
      rationale: context.rationale?.trim() || null,
    }),
  };
  return finalizeCandidate(candidateReplayBasis(updated));
}

export function adjustAnalysisCandidate(
  candidate: AnalysisCandidate,
  range: { readonly startMs: number; readonly endMs: number },
): AnalysisCandidate {
  if (candidate.review.status !== "proposed") {
    throw new TypeError("Only proposed candidates can be adjusted");
  }
  assertSourceTimeRange(range.startMs, range.endMs, candidate.source.durationMs);
  const adjustedId = uuid({
    candidateId: candidate.id,
    revision: candidate.review.revision + 1,
    range,
  });
  const adjusted = {
    ...candidate,
    id: adjustedId,
    startMs: range.startMs,
    endMs: range.endMs,
    preview: contextWindow(
      range.startMs,
      range.endMs,
      candidate.source.durationMs,
      Math.max(candidate.preview.preRollMs, candidate.preview.postRollMs),
    ),
    review: Object.freeze({
      status: "proposed" as const,
      revision: candidate.review.revision + 1,
      decidedAt: null,
      decidedBy: null,
      rationale: null,
      supersedesCandidateId: candidate.id,
    }),
  };
  return finalizeCandidate(candidateReplayBasis(adjusted));
}

export function candidateToEditDecisionInput(candidate: AnalysisCandidate): EditDecisionInput {
  assertSourceTimeRange(candidate.startMs, candidate.endMs, candidate.source.durationMs);
  const clientRequestId = uuid({
    kind: "analysis-edit-decision",
    candidateId: candidate.id,
    sourceIdentity: candidate.source.identityDigest,
  });
  return Object.freeze({
    decision_type: candidate.decisionType,
    source: candidate.decisionSource,
    start_seconds: candidate.startMs / 1_000,
    end_seconds: candidate.endMs / 1_000,
    label: candidate.label.slice(0, 160),
    confidence: candidate.confidence.calibrated ?? candidate.confidence.raw,
    client_request_id: clientRequestId,
    metadata: Object.freeze({
      schema_version: candidate.schemaVersion,
      candidate_id: candidate.id,
      analysis_run_id: candidate.runId,
      transcript_id: candidate.transcriptId,
      source_identity_digest: candidate.source.identityDigest,
      detector: candidate.detector,
      detector_version: candidate.detectorVersion,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      risks: candidate.risks,
      deterministic_replay_key: candidate.deterministicReplayKey,
      media_mutation: false,
    }),
  });
}

interface MergedExclusion {
  startMs: number;
  endMs: number;
  candidateIds: string[];
}

function mergeAcceptedCandidates(
  candidates: readonly { readonly id: string; readonly startMs: number; readonly endMs: number }[],
): MergedExclusion[] {
  const sorted = candidates
    .map((candidate) => ({
      startMs: candidate.startMs,
      endMs: candidate.endMs,
      candidateIds: [candidate.id],
    }))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: MergedExclusion[] = [];
  for (const range of sorted) {
    const prior = merged[merged.length - 1];
    if (prior && range.startMs <= prior.endMs) {
      prior.endMs = Math.max(prior.endMs, range.endMs);
      prior.candidateIds.push(...range.candidateIds);
    } else {
      merged.push({ ...range, candidateIds: [...range.candidateIds] });
    }
  }
  return merged;
}

function buildCompositionPreview(
  source: TranscriptSourceBinding,
  ranges: readonly { readonly id: string; readonly startMs: number; readonly endMs: number }[],
): ReversibleCompositionPreview {
  const exclusions = mergeAcceptedCandidates(ranges);
  const spans: CompositionSpan[] = [];
  let sourceCursor = 0;
  let compositionCursor = 0;
  for (const exclusion of exclusions) {
    if (exclusion.startMs > sourceCursor) {
      const duration = exclusion.startMs - sourceCursor;
      spans.push(Object.freeze({
        kind: "keep",
        sourceStartMs: sourceCursor,
        sourceEndMs: exclusion.startMs,
        compositionStartMs: compositionCursor,
        compositionEndMs: compositionCursor + duration,
        candidateIds: Object.freeze([]),
      }));
      compositionCursor += duration;
    }
    spans.push(Object.freeze({
      kind: "exclude",
      sourceStartMs: exclusion.startMs,
      sourceEndMs: exclusion.endMs,
      compositionStartMs: compositionCursor,
      compositionEndMs: compositionCursor,
      candidateIds: Object.freeze([...exclusion.candidateIds].sort()),
    }));
    sourceCursor = exclusion.endMs;
  }
  if (sourceCursor < source.durationMs) {
    const duration = source.durationMs - sourceCursor;
    spans.push(Object.freeze({
      kind: "keep",
      sourceStartMs: sourceCursor,
      sourceEndMs: source.durationMs,
      compositionStartMs: compositionCursor,
      compositionEndMs: compositionCursor + duration,
      candidateIds: Object.freeze([]),
    }));
    compositionCursor += duration;
  }
  const acceptedCandidateIds = ranges.map((range) => range.id).sort();
  const replayBasis = { source, acceptedCandidateIds, spans };
  return deepFreeze({
    schemaVersion: "cco.composition-preview.v1",
    compositionId: uuid({ kind: "composition-preview", replayBasis }),
    source,
    sourceDurationMs: source.durationMs,
    compositionDurationMs: compositionCursor,
    spans,
    acceptedCandidateIds,
    reversible: true,
    sourceMediaMutated: false,
    publicationAllowed: false,
    deterministicReplayKey: digest(replayBasis),
  });
}

export function composeAcceptedCandidates(
  source: TranscriptSourceBinding,
  candidates: readonly AnalysisCandidate[],
): ReversibleCompositionPreview {
  const accepted = candidates.filter((candidate) => candidate.review.status === "accepted");
  for (const candidate of accepted) {
    if (!sameSource(candidate.source, source)) throw new TypeError("Composition candidate source binding mismatch");
    assertSourceTimeRange(candidate.startMs, candidate.endMs, source.durationMs);
  }
  return buildCompositionPreview(source, accepted);
}

export function composeAcceptedEditDecisions(
  source: TranscriptSourceBinding,
  decisions: readonly RecordedAnalysisEditDecision[],
): ReversibleCompositionPreview {
  const accepted = decisions.filter((decision) => decision.status === "accepted");
  const ranges = accepted.map((decision) => {
    if (decision.assetId !== source.assetId || decision.versionId !== source.versionId) {
      throw new TypeError("Recorded edit decision source binding mismatch");
    }
    if (decision.decisionType !== "remove_filler" && decision.decisionType !== "remove_silence") {
      throw new TypeError("Composition preview only accepts transcript/audio-analysis decisions");
    }
    if (decision.endSeconds === null) throw new TypeError("Analysis edit decisions require an end time");
    const startMs = Math.round(decision.startSeconds * 1_000);
    const endMs = Math.round(decision.endSeconds * 1_000);
    assertSourceTimeRange(startMs, endMs, source.durationMs);
    return { id: decision.id, startMs, endMs };
  });
  return buildCompositionPreview(source, ranges);
}

function intersectionOverUnion(
  left: { startMs: number; endMs: number },
  right: { startMs: number; endMs: number },
): number {
  const intersection = Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));
  const union = Math.max(left.endMs, right.endMs) - Math.min(left.startMs, right.startMs);
  return union <= 0 ? 0 : intersection / union;
}

export function evaluateAnalysisCandidates(input: {
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly sourceDurationMs: number;
  readonly candidates: readonly AnalysisCandidate[];
  readonly labels: readonly EvaluationLabel[];
  readonly matchThreshold?: number;
}): AnalysisEvaluationReport {
  if (!input.corpusId.trim() || !input.corpusVersion.trim()) throw new TypeError("Evaluation corpus identity is required");
  if (!Number.isInteger(input.sourceDurationMs) || input.sourceDurationMs <= 0) {
    throw new TypeError("Evaluation source duration is invalid");
  }
  const threshold = input.matchThreshold ?? 0.5;
  if (threshold <= 0 || threshold > 1) throw new TypeError("Evaluation match threshold must be between 0 and 1");
  const metrics = (["filler_word", "silence"] as const).map((detector) => {
    const candidates = input.candidates.filter((candidate) => candidate.detector === detector);
    const labels = input.labels.filter((label) => label.detector === detector);
    const matchedLabels = new Set<string>();
    let truePositives = 0;
    for (const candidate of candidates) {
      const match = labels
        .filter((label) => !matchedLabels.has(label.id))
        .map((label) => ({ label, score: intersectionOverUnion(candidate, label) }))
        .sort((left, right) => right.score - left.score)[0];
      if (match && match.score >= threshold) {
        matchedLabels.add(match.label.id);
        truePositives += 1;
      }
    }
    const falsePositives = candidates.length - truePositives;
    const falseNegatives = labels.length - truePositives;
    return Object.freeze({
      detector,
      truePositives,
      falsePositives,
      falseNegatives,
      precision: candidates.length === 0 ? (labels.length === 0 ? 1 : 0) : round(truePositives / candidates.length),
      recall: labels.length === 0 ? 1 : round(truePositives / labels.length),
      candidateRatePerMinute: round(candidates.length / (input.sourceDurationMs / 60_000)),
    });
  });
  const replayBasis = {
    corpusId: input.corpusId,
    corpusVersion: input.corpusVersion,
    sourceDurationMs: input.sourceDurationMs,
    candidateIds: input.candidates.map((candidate) => candidate.id).sort(),
    labels: input.labels,
    threshold,
    metrics,
  };
  return deepFreeze({
    reportId: uuid({ kind: "analysis-evaluation", replayBasis }),
    corpusId: input.corpusId,
    corpusVersion: input.corpusVersion,
    sourceDurationMs: input.sourceDurationMs,
    metrics,
    replayDigest: digest(replayBasis),
  });
}

export function compareAnalysisEvaluationRuns(
  baseline: AnalysisEvaluationReport,
  current: AnalysisEvaluationReport,
  tolerances: { readonly maxPrecisionDrop: number; readonly maxCandidateRateChangeRatio: number },
): AnalysisDriftReport {
  const alerts: string[] = [];
  for (const currentMetric of current.metrics) {
    const prior = baseline.metrics.find((metric) => metric.detector === currentMetric.detector);
    if (!prior) {
      alerts.push(`${currentMetric.detector}: missing baseline metric`);
      continue;
    }
    if (prior.precision - currentMetric.precision > tolerances.maxPrecisionDrop) {
      alerts.push(`${currentMetric.detector}: precision regression`);
    }
    const denominator = Math.max(prior.candidateRatePerMinute, 0.0001);
    const rateChange = Math.abs(currentMetric.candidateRatePerMinute - prior.candidateRatePerMinute) / denominator;
    if (rateChange > tolerances.maxCandidateRateChangeRatio) {
      alerts.push(`${currentMetric.detector}: candidate-rate drift`);
    }
  }
  return Object.freeze({
    baselineReportId: baseline.reportId,
    currentReportId: current.reportId,
    alerts: Object.freeze(alerts),
    withinTolerance: alerts.length === 0,
  });
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

export function evaluateAnalysisSlo(
  samples: readonly AnalysisSloSample[],
  objective: { readonly minimumAvailability: number; readonly maximumP95LatencyMs: number },
): AnalysisSloReport {
  if (samples.length === 0) throw new TypeError("SLO evaluation requires at least one sample");
  const availability = samples.filter((sample) => sample.success).length / samples.length;
  const p95LatencyMs = percentile95(samples.map((sample) => sample.latencyMs));
  const replayMismatchCount = samples.filter((sample) => !sample.replayMatched).length;
  const contentLoggingViolationCount = samples.filter((sample) => sample.contentLogged).length;
  const breaches: string[] = [];
  if (availability < objective.minimumAvailability) breaches.push("availability");
  if (p95LatencyMs > objective.maximumP95LatencyMs) breaches.push("p95_latency");
  if (replayMismatchCount > 0) breaches.push("deterministic_replay");
  if (contentLoggingViolationCount > 0) breaches.push("privacy_content_logging");
  return Object.freeze({
    availability: round(availability),
    p95LatencyMs,
    replayMismatchCount,
    contentLoggingViolationCount,
    withinSlo: breaches.length === 0,
    breaches: Object.freeze(breaches),
  });
}

export function audioAnalysisTelemetry(run: AudioAnalysisRun): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: run.schemaVersion,
    runId: run.runId,
    transcriptId: run.transcriptId,
    assetId: run.source.assetId,
    versionId: run.source.versionId,
    sourceIdentityDigest: run.source.identityDigest,
    pipelineVersion: run.pipelineVersion,
    configurationVersion: run.configuration.version,
    inputTokens: run.metrics.inputTokens,
    waveformBins: run.metrics.waveformBins,
    fillerCandidates: run.metrics.fillerCandidates,
    silenceCandidates: run.metrics.silenceCandidates,
    suppressedSilenceGaps: run.metrics.suppressedSilenceGaps,
    estimatedLatencyMs: run.metrics.estimatedLatencyMs,
    estimatedCostMicrounits: run.metrics.estimatedCostMicrounits,
    replayOutputDigest: run.replay.outputDigest,
    mutationPerformed: run.mutationPerformed,
    contentLogged: false,
  });
}

export function planAudioAnalysisBatch(input: {
  readonly transcripts: readonly TranscriptDocument[];
  readonly maxConcurrency: number;
  readonly budget: AudioAnalysisBudget;
}): AudioAnalysisBatchPlan {
  if (input.transcripts.length === 0 || input.transcripts.length > MAX_ANALYSIS_BATCH_ITEMS) {
    throw new TypeError(`Analysis batch must contain between 1 and ${MAX_ANALYSIS_BATCH_ITEMS} transcripts`);
  }
  if (!Number.isInteger(input.maxConcurrency) || input.maxConcurrency < 1 || input.maxConcurrency > 16) {
    throw new TypeError("Analysis maxConcurrency must be between 1 and 16");
  }
  assertAudioAnalysisBudget(input.budget);
  const seen = new Set<string>();
  const rejectionReasons: string[] = [];
  const items = input.transcripts.map((transcript) => {
    const key = `${transcript.source.assetId}:${transcript.source.versionId}:${transcript.documentId}`;
    if (seen.has(key)) rejectionReasons.push(`Duplicate transcript: ${key}`);
    seen.add(key);
    return Object.freeze({
      transcriptId: transcript.documentId,
      source: transcript.source,
      inputTokens: transcript.tokens.length,
      waveformBins: transcript.waveform.peaks.length,
      estimatedLatencyMs: estimatedLatencyMs(transcript),
      estimatedCostMicrounits: 0 as const,
    });
  });
  const totalInputTokens = items.reduce((sum, item) => sum + item.inputTokens, 0);
  if (totalInputTokens > input.budget.maxInputTokens) rejectionReasons.push("Batch input token budget exceeded");
  const latencies = items.map((item) => item.estimatedLatencyMs).sort((left, right) => right - left);
  const lanes = Array.from({ length: Math.min(input.maxConcurrency, items.length) }, () => 0);
  for (const latency of latencies) {
    let laneIndex = 0;
    for (let index = 1; index < lanes.length; index += 1) {
      if (lanes[index] < lanes[laneIndex]) laneIndex = index;
    }
    lanes[laneIndex] += latency;
  }
  const criticalPathEstimatedLatencyMs = Math.max(...lanes);
  if (criticalPathEstimatedLatencyMs > input.budget.maxEstimatedLatencyMs) {
    rejectionReasons.push("Batch latency budget exceeded");
  }
  const replayBasis = { items, maxConcurrency: input.maxConcurrency, budget: input.budget };
  return deepFreeze({
    planId: uuid({ kind: "audio-analysis-batch", replayBasis }),
    items,
    maxConcurrency: input.maxConcurrency,
    totalInputTokens,
    criticalPathEstimatedLatencyMs,
    totalEstimatedCostMicrounits: 0,
    withinBudget: rejectionReasons.length === 0,
    rejectionReasons,
    deterministicReplayKey: digest(replayBasis),
  });
}
