export const TRANSCRIPT_SCHEMA_VERSION = "cco.transcript.v1" as const;
export const TRANSCRIPT_PIPELINE_VERSION = "cco-transcript-pipeline-1.0.0" as const;
export const SAFE_DEMO_TRANSCRIPT_FIXTURE_ID = "cco-safe-dialogue-v1" as const;

const MAX_MEDIA_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_TRANSCRIPT_TOKENS = 250_000;
const MAX_BATCH_ITEMS = 100;

export type TranscriptTokenKind = "word" | "filler" | "punctuation";
export type TranscriptAlignmentBasis =
  | "provider_word"
  | "estimated_segment"
  | "safe_demo";
export type TranscriptProviderMode = "demo" | "external" | "legacy_import";
export type TranscriptNetworkAccess = "none" | "required";

export interface TranscriptSourceBinding {
  readonly assetId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly versionCreatedAt: string;
  readonly durationMs: number;
  readonly fileSizeBytes: number | null;
  readonly mediaSha256: string | null;
  readonly identityDigest: string;
  readonly identityBasis: "version-record-v1";
}

export interface TranscriptProviderDescriptor {
  readonly providerId: string;
  readonly adapterVersion: string;
  readonly model: string;
  readonly mode: TranscriptProviderMode;
  readonly networkAccess: TranscriptNetworkAccess;
  readonly paid: boolean;
  readonly supportsWordTiming: boolean;
  readonly supportsDiarization: boolean;
  readonly supportsVerbatim: boolean;
}

export interface TranscriptLanguage {
  readonly requestedTag: string | null;
  readonly detectedTag: string;
  readonly confidence: number | null;
  readonly direction: "ltr" | "rtl";
}

export interface TranscriptSpeaker {
  readonly id: string;
  readonly label: string;
  readonly diarizationConfidence: number | null;
  readonly reviewState: "unreviewed" | "confirmed" | "corrected";
}

export interface WaveformTokenAlignment {
  readonly basis: TranscriptAlignmentBasis;
  readonly startBin: number;
  readonly endBin: number;
  readonly binDurationMs: number;
}

export interface TranscriptToken {
  readonly id: string;
  readonly index: number;
  readonly text: string;
  readonly normalizedText: string;
  readonly kind: TranscriptTokenKind;
  readonly startMs: number;
  readonly endMs: number;
  readonly confidence: number | null;
  readonly speakerId: string;
  readonly alignment: WaveformTokenAlignment;
}

export interface CaptionAccessibility {
  readonly charactersPerSecond: number;
  readonly maxLineCharacters: number;
  readonly warnings: readonly (
    | "reading_speed"
    | "line_length"
    | "missing_speaker"
    | "estimated_timing"
  )[];
}

export interface TranscriptSegment {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly speakerId: string;
  readonly tokenIds: readonly string[];
  readonly text: string;
  readonly confidence: number | null;
  readonly accessibility: CaptionAccessibility;
}

export interface CaptionCue {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly speakerId: string;
  readonly text: string;
  readonly accessibility: CaptionAccessibility;
}

export interface TranscriptWaveform {
  readonly durationMs: number;
  readonly binDurationMs: number;
  readonly peaks: readonly number[];
  readonly channel: "mono_mix";
  readonly source: "provider" | "safe_demo" | "unavailable";
  readonly sourceTimeOriginMs: 0;
}

export interface TranscriptPrivacyPolicy {
  readonly sourceMediaRetention: "none" | "provider_job";
  readonly providerContentLogging: "disabled" | "provider_policy";
  readonly applicationContentLogging: "metadata_only";
  readonly transcriptRetentionDays: number | null;
  readonly piiHandling: "preserve_for_authorized_review" | "redact_before_provider";
  readonly region: string | null;
}

export interface TranscriptReplayProvenance {
  readonly algorithm: "fnv1a64-v1";
  readonly fixtureId: string | null;
  readonly seed: string;
  readonly requestDigest: string;
  readonly outputDigest: string;
}

export interface TranscriptProvenance {
  readonly pipelineVersion: typeof TRANSCRIPT_PIPELINE_VERSION;
  readonly provider: TranscriptProviderDescriptor;
  readonly createdAt: string;
  readonly jobId: string;
  readonly privacy: TranscriptPrivacyPolicy;
  readonly replay: TranscriptReplayProvenance;
}

export interface TranscriptDocument {
  readonly schemaVersion: typeof TRANSCRIPT_SCHEMA_VERSION;
  readonly documentId: string;
  readonly status: "completed";
  readonly source: TranscriptSourceBinding;
  readonly language: TranscriptLanguage;
  readonly speakers: readonly TranscriptSpeaker[];
  readonly waveform: TranscriptWaveform;
  readonly tokens: readonly TranscriptToken[];
  readonly segments: readonly TranscriptSegment[];
  readonly captions: readonly CaptionCue[];
  readonly provenance: TranscriptProvenance;
}

export interface TranscriptProviderEstimate {
  readonly estimatedCostMicrounits: number;
  readonly estimatedLatencyMs: number;
  readonly billableAudioMs: number;
  readonly assumptions: readonly string[];
}

export interface TranscriptBudget {
  readonly maxCostMicrounits: number;
  readonly maxLatencyMs: number;
}

export interface TranscriptRequest {
  readonly jobId: string;
  readonly source: TranscriptSourceBinding;
  readonly languageTag: string | null;
  readonly diarization: boolean;
  readonly verbatim: true;
  readonly privacy: TranscriptPrivacyPolicy;
  readonly budget: TranscriptBudget;
  readonly replaySeed: string;
}

export interface TranscriptInvocationAuthority {
  readonly operation: "preview" | "execute";
  readonly explicitUserAction: boolean;
  readonly credentialsPresent: boolean;
  readonly allowNetwork: boolean;
  readonly budgetReservationId: string | null;
}

export interface TranscriptProviderAdapter {
  readonly descriptor: TranscriptProviderDescriptor;
  estimate(request: TranscriptRequest): TranscriptProviderEstimate;
  transcribe(request: TranscriptRequest): Promise<TranscriptDocument>;
}

export interface TranscriptBatchPlanItem {
  readonly jobId: string;
  readonly source: TranscriptSourceBinding;
  readonly estimate: TranscriptProviderEstimate;
}

export interface TranscriptBatchPlan {
  readonly planId: string;
  readonly provider: TranscriptProviderDescriptor;
  readonly items: readonly TranscriptBatchPlanItem[];
  readonly maxConcurrency: number;
  readonly totalEstimatedCostMicrounits: number;
  readonly criticalPathEstimatedLatencyMs: number;
  readonly withinBudget: boolean;
  readonly rejectionReasons: readonly string[];
  readonly deterministicReplayKey: string;
}

export type TranscriptValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

export type TranscriptParseResult =
  | { readonly ok: true; readonly value: TranscriptDocument }
  | { readonly ok: false; readonly errors: readonly string[] };

export class TranscriptPolicyError extends Error {
  readonly code:
    | "explicit_action_required"
    | "preview_only"
    | "network_not_allowed"
    | "credentials_required"
    | "budget_reservation_required"
    | "invalid_budget"
    | "invalid_estimate"
    | "cost_budget_exceeded"
    | "latency_budget_exceeded"
    | "provider_contract_violation";

  constructor(code: TranscriptPolicyError["code"], message: string) {
    super(message);
    this.name = "TranscriptPolicyError";
    this.code = code;
  }
}

function normalizeCanonical(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical data must contain finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalizeCanonical);
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, normalizeCanonical(source[key])]),
    );
  }
  throw new TypeError(`Unsupported canonical value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value));
}

function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function deterministicDigest(value: unknown): string {
  return `fnv1a64:${fnv1a64(canonicalJson(value))}`;
}

export function deterministicUuid(value: unknown): string {
  const left = fnv1a64(`cco:uuid:left:${canonicalJson(value)}`);
  const right = fnv1a64(`cco:uuid:right:${canonicalJson(value)}`);
  const hex = `${left}${right}`.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function isIsoTimestamp(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function assertStableIdentifier(value: string, field: string): void {
  if (!value.trim() || value.length > 160) throw new TypeError(`${field} is invalid`);
}

function assertFiniteInteger(value: number, field: string, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
}

function assertTranscriptBudget(budget: TranscriptBudget, field: string): void {
  assertFiniteInteger(
    budget.maxCostMicrounits,
    `${field}.maxCostMicrounits`,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  assertFiniteInteger(
    budget.maxLatencyMs,
    `${field}.maxLatencyMs`,
    1,
    Number.MAX_SAFE_INTEGER,
  );
}

function assertProviderEstimate(estimate: TranscriptProviderEstimate): void {
  assertFiniteInteger(
    estimate.estimatedCostMicrounits,
    "estimatedCostMicrounits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  assertFiniteInteger(
    estimate.estimatedLatencyMs,
    "estimatedLatencyMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  assertFiniteInteger(
    estimate.billableAudioMs,
    "billableAudioMs",
    0,
    MAX_MEDIA_DURATION_MS,
  );
}

function computeSourceIdentity(
  source: Omit<TranscriptSourceBinding, "identityDigest" | "identityBasis">,
): string {
  return deterministicDigest({
    assetId: source.assetId,
    versionId: source.versionId,
    versionNumber: source.versionNumber,
    versionCreatedAt: source.versionCreatedAt,
    durationMs: source.durationMs,
    fileSizeBytes: source.fileSizeBytes,
    mediaSha256: source.mediaSha256,
  });
}

export function buildTranscriptSourceBinding(input: {
  readonly assetId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly versionCreatedAt: string;
  readonly durationMs: number;
  readonly fileSizeBytes?: number | null;
  readonly mediaSha256?: string | null;
}): TranscriptSourceBinding {
  assertStableIdentifier(input.assetId, "assetId");
  assertStableIdentifier(input.versionId, "versionId");
  assertFiniteInteger(input.versionNumber, "versionNumber", 1, 1_000_000);
  assertFiniteInteger(input.durationMs, "durationMs", 1, MAX_MEDIA_DURATION_MS);
  if (!isIsoTimestamp(input.versionCreatedAt)) throw new TypeError("versionCreatedAt is invalid");
  if (
    input.fileSizeBytes !== undefined &&
    input.fileSizeBytes !== null &&
    (!Number.isInteger(input.fileSizeBytes) || input.fileSizeBytes < 0)
  ) {
    throw new TypeError("fileSizeBytes must be a non-negative integer or null");
  }
  const mediaSha256 = input.mediaSha256?.toLowerCase() ?? null;
  if (mediaSha256 !== null && !/^[0-9a-f]{64}$/.test(mediaSha256)) {
    throw new TypeError("mediaSha256 must be a 64-character hexadecimal digest");
  }

  const identityFields = {
    assetId: input.assetId,
    versionId: input.versionId,
    versionNumber: input.versionNumber,
    versionCreatedAt: new Date(input.versionCreatedAt).toISOString(),
    durationMs: input.durationMs,
    fileSizeBytes: input.fileSizeBytes ?? null,
    mediaSha256,
  };

  return Object.freeze({
    ...identityFields,
    identityDigest: computeSourceIdentity(identityFields),
    identityBasis: "version-record-v1" as const,
  });
}

export function isSameTranscriptSource(
  left: TranscriptSourceBinding,
  right: TranscriptSourceBinding,
): boolean {
  return (
    left.assetId === right.assetId &&
    left.versionId === right.versionId &&
    left.identityDigest === right.identityDigest
  );
}

export const DEFAULT_TRANSCRIPT_PRIVACY: TranscriptPrivacyPolicy = Object.freeze({
  sourceMediaRetention: "none",
  providerContentLogging: "disabled",
  applicationContentLogging: "metadata_only",
  transcriptRetentionDays: 30,
  piiHandling: "preserve_for_authorized_review",
  region: null,
});

function confidenceOrNull(values: readonly (number | null)[]): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function buildAccessibility(
  text: string,
  startMs: number,
  endMs: number,
  options: { estimatedTiming: boolean; speakerPresent: boolean },
): CaptionAccessibility {
  const durationSeconds = Math.max((endMs - startMs) / 1_000, 0.001);
  const charactersPerSecond = Number((text.length / durationSeconds).toFixed(2));
  const warnings: CaptionAccessibility["warnings"][number][] = [];
  if (charactersPerSecond > 20) warnings.push("reading_speed");
  if (text.length > 42) warnings.push("line_length");
  if (!options.speakerPresent) warnings.push("missing_speaker");
  if (options.estimatedTiming) warnings.push("estimated_timing");
  return Object.freeze({
    charactersPerSecond,
    maxLineCharacters: text.length,
    warnings: Object.freeze(warnings),
  });
}

function waveformBinForTime(timeMs: number, binDurationMs: number, peakCount: number): number {
  return Math.min(Math.max(Math.floor(timeMs / binDurationMs), 0), Math.max(peakCount - 1, 0));
}

function freezeArray<T>(items: T[]): readonly T[] {
  return Object.freeze(items);
}

function computeTranscriptOutputDigest(document: TranscriptDocument): string {
  return deterministicDigest({
    ...document,
    provenance: {
      ...document.provenance,
      replay: { ...document.provenance.replay, outputDigest: "" },
    },
  });
}

function safeDemoRequestDigest(request: TranscriptRequest): string {
  return deterministicDigest({
    fixtureId: SAFE_DEMO_TRANSCRIPT_FIXTURE_ID,
    jobId: request.jobId,
    source: request.source,
    languageTag: request.languageTag,
    privacy: request.privacy,
    replaySeed: request.replaySeed,
  });
}

function safeDemoIntegrityErrors(document: TranscriptDocument): string[] {
  if (document.provenance.provider.providerId !== SAFE_DEMO_PROVIDER_DESCRIPTOR.providerId) {
    return [];
  }

  const errors: string[] = [];
  if (canonicalJson(document.provenance.provider) !== canonicalJson(SAFE_DEMO_PROVIDER_DESCRIPTOR)) {
    errors.push("Safe-demo provider descriptor does not match the installed fixture");
  }
  if (document.provenance.replay.fixtureId !== SAFE_DEMO_TRANSCRIPT_FIXTURE_ID) {
    errors.push("Safe-demo fixture id is invalid");
  }

  try {
    const expected = createSafeDemoTranscript({
      jobId: document.provenance.jobId,
      source: document.source,
      languageTag: document.language.requestedTag,
      diarization: true,
      verbatim: true,
      privacy: document.provenance.privacy,
      budget: { maxCostMicrounits: 0, maxLatencyMs: 1 },
      replaySeed: document.provenance.replay.seed,
    });
    if (canonicalJson(document) !== canonicalJson(expected)) {
      errors.push("Safe-demo transcript does not match the canonical deterministic fixture");
    }
  } catch {
    errors.push("Safe-demo transcript cannot be deterministically reconstructed");
  }

  return errors;
}

export function verifySafeDemoTranscriptIntegrity(
  document: TranscriptDocument,
): TranscriptValidationResult {
  const errors = safeDemoIntegrityErrors(document);
  return errors.length === 0 ? { ok: true } : { ok: false, errors: Object.freeze(errors) };
}

export function validateTranscriptDocument(document: TranscriptDocument): TranscriptValidationResult {
  const errors: string[] = [];
  if (document.schemaVersion !== TRANSCRIPT_SCHEMA_VERSION) errors.push("Unsupported schemaVersion");
  if (!document.documentId) errors.push("documentId is required");
  if (document.status !== "completed") errors.push("Only completed transcript documents are valid");
  if (document.source.identityBasis !== "version-record-v1") errors.push("Unknown source identity basis");
  if (document.source.identityDigest !== computeSourceIdentity(document.source)) {
    errors.push("Source identity digest does not match immutable version fields");
  }
  if (document.waveform.durationMs !== document.source.durationMs) {
    errors.push("Waveform duration must match the source version duration");
  }
  if (!Number.isInteger(document.waveform.binDurationMs) || document.waveform.binDurationMs <= 0) {
    errors.push("Waveform binDurationMs must be a positive integer");
  }
  const expectedPeaks = Math.ceil(document.source.durationMs / document.waveform.binDurationMs);
  if (document.waveform.peaks.length !== expectedPeaks) {
    errors.push("Waveform peak count does not cover the source timeline exactly");
  }
  if (document.waveform.peaks.some((peak) => !Number.isFinite(peak) || peak < 0 || peak > 1)) {
    errors.push("Waveform peaks must be finite values between 0 and 1");
  }
  if (document.tokens.length > MAX_TRANSCRIPT_TOKENS) errors.push("Transcript token limit exceeded");

  const speakerIds = new Set(document.speakers.map((speaker) => speaker.id));
  const tokenIds = new Set<string>();
  let priorStartMs = -1;
  document.tokens.forEach((token, index) => {
    if (token.index !== index) errors.push(`Token ${token.id} has a non-contiguous index`);
    if (tokenIds.has(token.id)) errors.push(`Duplicate token id ${token.id}`);
    tokenIds.add(token.id);
    if (!speakerIds.has(token.speakerId)) errors.push(`Token ${token.id} references an unknown speaker`);
    if (
      !Number.isInteger(token.startMs) ||
      !Number.isInteger(token.endMs) ||
      token.startMs < 0 ||
      token.endMs <= token.startMs ||
      token.endMs > document.source.durationMs
    ) {
      errors.push(`Token ${token.id} has an invalid source-time range`);
    }
    if (token.startMs < priorStartMs) errors.push(`Token ${token.id} is not source-time ordered`);
    priorStartMs = token.startMs;
    if (token.confidence !== null && (token.confidence < 0 || token.confidence > 1)) {
      errors.push(`Token ${token.id} has invalid confidence`);
    }
    const expectedStartBin = waveformBinForTime(
      token.startMs,
      document.waveform.binDurationMs,
      document.waveform.peaks.length,
    );
    const expectedEndBin = waveformBinForTime(
      Math.max(token.endMs - 1, token.startMs),
      document.waveform.binDurationMs,
      document.waveform.peaks.length,
    );
    if (
      token.alignment.binDurationMs !== document.waveform.binDurationMs ||
      token.alignment.startBin !== expectedStartBin ||
      token.alignment.endBin !== expectedEndBin
    ) {
      errors.push(`Token ${token.id} is not aligned to waveform bins`);
    }
  });

  const segmentIds = new Set<string>();
  for (const segment of document.segments) {
    if (segmentIds.has(segment.id)) errors.push(`Duplicate segment id ${segment.id}`);
    segmentIds.add(segment.id);
    if (!speakerIds.has(segment.speakerId)) errors.push(`Segment ${segment.id} has an unknown speaker`);
    if (segment.startMs < 0 || segment.endMs <= segment.startMs || segment.endMs > document.source.durationMs) {
      errors.push(`Segment ${segment.id} has an invalid source-time range`);
    }
    if (segment.tokenIds.some((tokenId) => !tokenIds.has(tokenId))) {
      errors.push(`Segment ${segment.id} references an unknown token`);
    }
  }

  if (document.provenance.pipelineVersion !== TRANSCRIPT_PIPELINE_VERSION) {
    errors.push("Unsupported transcript pipeline version");
  }
  if (document.provenance.replay.algorithm !== "fnv1a64-v1") {
    errors.push("Unsupported deterministic replay algorithm");
  }
  if (document.provenance.replay.outputDigest !== computeTranscriptOutputDigest(document)) {
    errors.push("Transcript replay output digest mismatch");
  }
  errors.push(...safeDemoIntegrityErrors(document));
  return errors.length === 0 ? { ok: true } : { ok: false, errors: Object.freeze(errors) };
}

export function parseTranscriptDocument(input: unknown): TranscriptParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: Object.freeze(["Transcript document must be an object"]) };
  }
  try {
    const value = input as TranscriptDocument;
    const validation = validateTranscriptDocument(value);
    return validation.ok ? { ok: true, value } : validation;
  } catch {
    return { ok: false, errors: Object.freeze(["Transcript document has an invalid shape"]) };
  }
}

interface DemoWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly confidence: number;
  readonly speakerId: "speaker-1" | "speaker-2";
  readonly segment: number;
}

const DEMO_WORDS: readonly DemoWord[] = Object.freeze([
  { text: "So", startMs: 400, endMs: 650, confidence: 0.98, speakerId: "speaker-1", segment: 0 },
  { text: "um", startMs: 760, endMs: 1_020, confidence: 0.93, speakerId: "speaker-1", segment: 0 },
  { text: "welcome", startMs: 1_160, endMs: 1_700, confidence: 0.99, speakerId: "speaker-1", segment: 0 },
  { text: "to", startMs: 1_780, endMs: 1_900, confidence: 0.99, speakerId: "speaker-1", segment: 0 },
  { text: "the", startMs: 1_960, endMs: 2_140, confidence: 0.98, speakerId: "speaker-1", segment: 0 },
  { text: "review.", startMs: 2_220, endMs: 2_750, confidence: 0.97, speakerId: "speaker-1", segment: 0 },
  { text: "Today", startMs: 4_400, endMs: 4_800, confidence: 0.99, speakerId: "speaker-1", segment: 1 },
  { text: "we", startMs: 4_860, endMs: 5_020, confidence: 0.99, speakerId: "speaker-1", segment: 1 },
  { text: "are", startMs: 5_080, endMs: 5_300, confidence: 0.98, speakerId: "speaker-1", segment: 1 },
  { text: "checking", startMs: 5_360, endMs: 5_900, confidence: 0.97, speakerId: "speaker-1", segment: 1 },
  { text: "the", startMs: 5_960, endMs: 6_120, confidence: 0.98, speakerId: "speaker-1", segment: 1 },
  { text: "audio.", startMs: 6_200, endMs: 6_650, confidence: 0.99, speakerId: "speaker-1", segment: 1 },
  { text: "I", startMs: 8_350, endMs: 8_470, confidence: 0.99, speakerId: "speaker-2", segment: 2 },
  { text: "think", startMs: 8_500, endMs: 8_820, confidence: 0.97, speakerId: "speaker-2", segment: 2 },
  { text: "uh", startMs: 8_910, endMs: 9_160, confidence: 0.91, speakerId: "speaker-2", segment: 2 },
  { text: "the", startMs: 9_240, endMs: 9_420, confidence: 0.98, speakerId: "speaker-2", segment: 2 },
  { text: "middle", startMs: 9_500, endMs: 9_900, confidence: 0.96, speakerId: "speaker-2", segment: 2 },
  { text: "pause", startMs: 9_980, endMs: 10_360, confidence: 0.98, speakerId: "speaker-2", segment: 2 },
  { text: "works,", startMs: 10_440, endMs: 10_820, confidence: 0.97, speakerId: "speaker-2", segment: 2 },
  { text: "but", startMs: 11_000, endMs: 11_220, confidence: 0.98, speakerId: "speaker-2", segment: 2 },
  { text: "keep", startMs: 11_280, endMs: 11_600, confidence: 0.99, speakerId: "speaker-2", segment: 2 },
  { text: "the", startMs: 11_660, endMs: 11_820, confidence: 0.98, speakerId: "speaker-2", segment: 2 },
  { text: "ending.", startMs: 11_900, endMs: 12_400, confidence: 0.99, speakerId: "speaker-2", segment: 2 },
  { text: "Great.", startMs: 14_000, endMs: 14_420, confidence: 0.99, speakerId: "speaker-1", segment: 3 },
  { text: "We", startMs: 14_560, endMs: 14_740, confidence: 0.99, speakerId: "speaker-1", segment: 3 },
  { text: "will", startMs: 14_800, endMs: 15_020, confidence: 0.98, speakerId: "speaker-1", segment: 3 },
  { text: "preview", startMs: 15_100, endMs: 15_580, confidence: 0.99, speakerId: "speaker-1", segment: 3 },
  { text: "every", startMs: 15_660, endMs: 16_000, confidence: 0.98, speakerId: "speaker-1", segment: 3 },
  { text: "change", startMs: 16_080, endMs: 16_480, confidence: 0.99, speakerId: "speaker-1", segment: 3 },
  { text: "before", startMs: 16_560, endMs: 16_920, confidence: 0.99, speakerId: "speaker-1", segment: 3 },
  { text: "accepting", startMs: 17_000, endMs: 17_520, confidence: 0.98, speakerId: "speaker-1", segment: 3 },
  { text: "it.", startMs: 17_600, endMs: 17_900, confidence: 0.99, speakerId: "speaker-1", segment: 3 },
]);

function normalizeWord(value: string): string {
  return value.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function demoTimingScale(durationMs: number): number {
  return Math.min(1, Math.max((durationMs - 100) / 18_000, 0.05));
}

function buildDemoPeaks(durationMs: number, binDurationMs: number, words: readonly DemoWord[]): number[] {
  const count = Math.ceil(durationMs / binDurationMs);
  return Array.from({ length: count }, (_, index) => {
    const startMs = index * binDurationMs;
    const endMs = Math.min(startMs + binDurationMs, durationMs);
    const hasSpeech = words.some((word) => word.startMs < endMs && word.endMs > startMs);
    const jitter = Number.parseInt(fnv1a64(`waveform:${index}`).slice(-2), 16) / 255;
    return Number((hasSpeech ? 0.48 + jitter * 0.38 : 0.012 + jitter * 0.018).toFixed(4));
  });
}

function finalizeTranscript(
  document: Omit<TranscriptDocument, "provenance"> & {
    readonly provenance: Omit<TranscriptProvenance, "replay"> & {
      readonly replay: Omit<TranscriptReplayProvenance, "outputDigest">;
    };
  },
): TranscriptDocument {
  const provisional = {
    ...document,
    provenance: {
      ...document.provenance,
      replay: { ...document.provenance.replay, outputDigest: "" },
    },
  } as TranscriptDocument;
  const complete = {
    ...provisional,
    provenance: {
      ...provisional.provenance,
      replay: {
        ...provisional.provenance.replay,
        outputDigest: computeTranscriptOutputDigest(provisional),
      },
    },
  } as TranscriptDocument;
  return deepFreeze(complete);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function createSafeDemoTranscript(request: TranscriptRequest): TranscriptDocument {
  const scale = demoTimingScale(request.source.durationMs);
  const scaledWords = DEMO_WORDS.map((word) => ({
    ...word,
    startMs: Math.max(0, Math.round(word.startMs * scale)),
    endMs: Math.min(request.source.durationMs, Math.max(1, Math.round(word.endMs * scale))),
  })).filter((word) => word.endMs > word.startMs);
  const binDurationMs = Math.max(100, Math.ceil(request.source.durationMs / 100_000));
  const peaks = buildDemoPeaks(request.source.durationMs, binDurationMs, scaledWords);
  const requestDigest = safeDemoRequestDigest(request);
  const documentId = deterministicUuid({ requestDigest, kind: "transcript" });
  const speakers = freezeArray<TranscriptSpeaker>([
    Object.freeze({
      id: "speaker-1",
      label: "Speaker 1",
      diarizationConfidence: 0.97,
      reviewState: "unreviewed" as const,
    }),
    Object.freeze({
      id: "speaker-2",
      label: "Speaker 2",
      diarizationConfidence: 0.94,
      reviewState: "unreviewed" as const,
    }),
  ]);
  const tokens = freezeArray<TranscriptToken>(
    scaledWords.map((word, index) => {
      const normalizedText = normalizeWord(word.text);
      return Object.freeze({
        id: deterministicUuid({ documentId, kind: "token", index }),
        index,
        text: word.text,
        normalizedText,
        kind: normalizedText === "um" || normalizedText === "uh" ? "filler" : "word",
        startMs: word.startMs,
        endMs: word.endMs,
        confidence: word.confidence,
        speakerId: word.speakerId,
        alignment: Object.freeze({
          basis: "safe_demo" as const,
          startBin: waveformBinForTime(word.startMs, binDurationMs, peaks.length),
          endBin: waveformBinForTime(Math.max(word.endMs - 1, word.startMs), binDurationMs, peaks.length),
          binDurationMs,
        }),
      });
    }),
  );
  const segments = freezeArray<TranscriptSegment>(
    [0, 1, 2, 3].flatMap((segmentNumber) => {
      const segmentTokens = tokens.filter((_, index) => scaledWords[index]?.segment === segmentNumber);
      if (segmentTokens.length === 0) return [];
      const text = segmentTokens.map((token) => token.text).join(" ");
      return [
        Object.freeze({
          id: deterministicUuid({ documentId, kind: "segment", segmentNumber }),
          startMs: segmentTokens[0].startMs,
          endMs: segmentTokens[segmentTokens.length - 1].endMs,
          speakerId: segmentTokens[0].speakerId,
          tokenIds: freezeArray(segmentTokens.map((token) => token.id)),
          text,
          confidence: confidenceOrNull(segmentTokens.map((token) => token.confidence)),
          accessibility: buildAccessibility(text, segmentTokens[0].startMs, segmentTokens[segmentTokens.length - 1].endMs, {
            estimatedTiming: false,
            speakerPresent: true,
          }),
        }),
      ];
    }),
  );
  const captions = freezeArray<CaptionCue>(
    segments.map((segment) =>
      Object.freeze({
        id: deterministicUuid({ documentId, kind: "caption", segmentId: segment.id }),
        startMs: segment.startMs,
        endMs: segment.endMs,
        speakerId: segment.speakerId,
        text: segment.text,
        accessibility: segment.accessibility,
      }),
    ),
  );

  return finalizeTranscript({
    schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    documentId,
    status: "completed",
    source: request.source,
    language: Object.freeze({
      requestedTag: request.languageTag,
      detectedTag: request.languageTag ?? "en-US",
      confidence: 0.99,
      direction: "ltr",
    }),
    speakers,
    waveform: Object.freeze({
      durationMs: request.source.durationMs,
      binDurationMs,
      peaks: freezeArray(peaks),
      channel: "mono_mix",
      source: "safe_demo",
      sourceTimeOriginMs: 0,
    }),
    tokens,
    segments,
    captions,
    provenance: {
      pipelineVersion: TRANSCRIPT_PIPELINE_VERSION,
      provider: SAFE_DEMO_PROVIDER_DESCRIPTOR,
      createdAt: "2026-01-01T00:00:00.000Z",
      jobId: request.jobId,
      privacy: request.privacy,
      replay: {
        algorithm: "fnv1a64-v1",
        fixtureId: SAFE_DEMO_TRANSCRIPT_FIXTURE_ID,
        seed: request.replaySeed,
        requestDigest,
      },
    },
  });
}

export const SAFE_DEMO_PROVIDER_DESCRIPTOR: TranscriptProviderDescriptor = Object.freeze({
  providerId: "safe-demo",
  adapterVersion: "1.0.0",
  model: SAFE_DEMO_TRANSCRIPT_FIXTURE_ID,
  mode: "demo",
  networkAccess: "none",
  paid: false,
  supportsWordTiming: true,
  supportsDiarization: true,
  supportsVerbatim: true,
});

export function createSafeDemoTranscriptProvider(): TranscriptProviderAdapter {
  return Object.freeze({
    descriptor: SAFE_DEMO_PROVIDER_DESCRIPTOR,
    estimate(request: TranscriptRequest): TranscriptProviderEstimate {
      return Object.freeze({
        estimatedCostMicrounits: 0,
        estimatedLatencyMs: Math.min(250, Math.max(25, Math.ceil(request.source.durationMs / 1_000))),
        billableAudioMs: 0,
        assumptions: Object.freeze([
          "Network-free deterministic fixture",
          "No customer media is read, retained, or transmitted",
        ]),
      });
    },
    async transcribe(request: TranscriptRequest): Promise<TranscriptDocument> {
      return createSafeDemoTranscript(request);
    },
  });
}

export function authorizeTranscriptProviderInvocation(
  descriptor: TranscriptProviderDescriptor,
  estimate: TranscriptProviderEstimate,
  request: TranscriptRequest,
  authority: TranscriptInvocationAuthority,
): void {
  try {
    assertTranscriptBudget(request.budget, "Transcript budget");
  } catch (error) {
    throw new TranscriptPolicyError(
      "invalid_budget",
      `Transcript budget is invalid${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
  try {
    assertProviderEstimate(estimate);
  } catch (error) {
    throw new TranscriptPolicyError(
      "invalid_estimate",
      `Provider estimate is invalid${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
  if (!authority.explicitUserAction) {
    throw new TranscriptPolicyError("explicit_action_required", "Transcript work requires an explicit user action");
  }
  if (descriptor.mode === "external" && authority.operation !== "execute") {
    throw new TranscriptPolicyError("preview_only", "External providers require an explicit execute action");
  }
  if (descriptor.networkAccess === "required" && !authority.allowNetwork) {
    throw new TranscriptPolicyError("network_not_allowed", "Network provider access is not authorized");
  }
  if (descriptor.networkAccess === "required" && !authority.credentialsPresent) {
    throw new TranscriptPolicyError("credentials_required", "Provider credentials are required");
  }
  if (descriptor.paid && !authority.budgetReservationId) {
    throw new TranscriptPolicyError(
      "budget_reservation_required",
      "Paid provider work requires a confirmed budget reservation",
    );
  }
  if (estimate.estimatedCostMicrounits > request.budget.maxCostMicrounits) {
    throw new TranscriptPolicyError("cost_budget_exceeded", "Estimated transcript cost exceeds the confirmed budget");
  }
  if (estimate.estimatedLatencyMs > request.budget.maxLatencyMs) {
    throw new TranscriptPolicyError("latency_budget_exceeded", "Estimated transcript latency exceeds the confirmed budget");
  }
}

export async function invokeTranscriptProvider(
  adapter: TranscriptProviderAdapter,
  request: TranscriptRequest,
  authority: TranscriptInvocationAuthority,
): Promise<{ readonly transcript: TranscriptDocument; readonly estimate: TranscriptProviderEstimate }> {
  const estimate = adapter.estimate(request);
  authorizeTranscriptProviderInvocation(adapter.descriptor, estimate, request, authority);
  const providerTranscript = await adapter.transcribe(request);
  const parsedTranscript = parseTranscriptDocument(providerTranscript);
  if (!parsedTranscript.ok) {
    throw new TranscriptPolicyError(
      "provider_contract_violation",
      `Provider returned an invalid transcript: ${parsedTranscript.errors.join("; ")}`,
    );
  }
  const transcript = parsedTranscript.value;
  if (!isSameTranscriptSource(transcript.source, request.source)) {
    throw new TranscriptPolicyError(
      "provider_contract_violation",
      "Provider transcript is not bound to the requested source version",
    );
  }
  if (transcript.provenance.provider.providerId !== adapter.descriptor.providerId) {
    throw new TranscriptPolicyError(
      "provider_contract_violation",
      "Provider transcript provenance does not match the invoked adapter",
    );
  }
  return Object.freeze({ transcript, estimate });
}

export function planTranscriptBatch(input: {
  readonly adapter: TranscriptProviderAdapter;
  readonly requests: readonly TranscriptRequest[];
  readonly maxConcurrency: number;
  readonly budget: TranscriptBudget;
}): TranscriptBatchPlan {
  if (input.requests.length === 0 || input.requests.length > MAX_BATCH_ITEMS) {
    throw new TypeError(`Batch must contain between 1 and ${MAX_BATCH_ITEMS} items`);
  }
  assertFiniteInteger(input.maxConcurrency, "maxConcurrency", 1, 16);
  assertTranscriptBudget(input.budget, "Batch budget");
  const jobIds = new Set<string>();
  const sourceKeys = new Set<string>();
  const rejectionReasons: string[] = [];
  const items = input.requests.map((request) => {
    assertTranscriptBudget(request.budget, `Transcript request ${request.jobId} budget`);
    if (jobIds.has(request.jobId)) rejectionReasons.push(`Duplicate jobId: ${request.jobId}`);
    jobIds.add(request.jobId);
    const sourceKey = `${request.source.assetId}:${request.source.versionId}`;
    if (sourceKeys.has(sourceKey)) rejectionReasons.push(`Duplicate source version: ${sourceKey}`);
    sourceKeys.add(sourceKey);
    const estimate = input.adapter.estimate(request);
    assertProviderEstimate(estimate);
    return Object.freeze({
      jobId: request.jobId,
      source: request.source,
      estimate,
    });
  });
  const totalEstimatedCostMicrounits = items.reduce(
    (sum, item) => sum + item.estimate.estimatedCostMicrounits,
    0,
  );
  const latencies = items
    .map((item) => item.estimate.estimatedLatencyMs)
    .sort((left, right) => right - left);
  const lanes = Array.from({ length: Math.min(input.maxConcurrency, items.length) }, () => 0);
  for (const latency of latencies) {
    let laneIndex = 0;
    for (let index = 1; index < lanes.length; index += 1) {
      if (lanes[index] < lanes[laneIndex]) laneIndex = index;
    }
    lanes[laneIndex] += latency;
  }
  const criticalPathEstimatedLatencyMs = Math.max(...lanes);
  if (totalEstimatedCostMicrounits > input.budget.maxCostMicrounits) {
    rejectionReasons.push("Batch estimated cost exceeds the confirmed budget");
  }
  if (criticalPathEstimatedLatencyMs > input.budget.maxLatencyMs) {
    rejectionReasons.push("Batch critical-path latency exceeds the confirmed budget");
  }
  const replayBasis = {
    provider: input.adapter.descriptor,
    items,
    maxConcurrency: input.maxConcurrency,
    budget: input.budget,
  };
  return deepFreeze({
    planId: deterministicUuid({ kind: "transcript-batch-plan", replayBasis }),
    provider: input.adapter.descriptor,
    items,
    maxConcurrency: input.maxConcurrency,
    totalEstimatedCostMicrounits,
    criticalPathEstimatedLatencyMs,
    withinBudget: rejectionReasons.length === 0,
    rejectionReasons,
    deterministicReplayKey: deterministicDigest(replayBasis),
  });
}

export interface LegacyTranscriptionRow {
  readonly id: string;
  readonly asset_id: string;
  readonly version_id: string | null;
  readonly language: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly segments: unknown;
}

function legacySegments(value: unknown): { startMs: number; endMs: number; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const startSeconds = record.start;
    const endSeconds = record.end;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (
      typeof startSeconds !== "number" ||
      typeof endSeconds !== "number" ||
      !Number.isFinite(startSeconds) ||
      !Number.isFinite(endSeconds) ||
      startSeconds < 0 ||
      endSeconds <= startSeconds ||
      !text
    ) {
      return [];
    }
    return [{ startMs: Math.round(startSeconds * 1_000), endMs: Math.round(endSeconds * 1_000), text }];
  });
}

export function transcriptFromLegacyRow(
  row: LegacyTranscriptionRow,
  source: TranscriptSourceBinding,
): TranscriptDocument {
  if (row.asset_id !== source.assetId || row.version_id !== source.versionId) {
    throw new TypeError("Legacy transcript row is not bound to the requested source version");
  }
  const imported = legacySegments(row.segments).filter((segment) => segment.endMs <= source.durationMs);
  if (imported.length === 0) throw new TypeError("Legacy transcript has no valid source-time segments");
  const binDurationMs = Math.max(100, Math.ceil(source.durationMs / 100_000));
  const peakCount = Math.ceil(source.durationMs / binDurationMs);
  const requestDigest = deterministicDigest({ row, source });
  const documentId = deterministicUuid({ rowId: row.id, source: source.identityDigest });
  const speakers = freezeArray<TranscriptSpeaker>([
    Object.freeze({
      id: "speaker-unknown",
      label: "Unknown speaker",
      diarizationConfidence: null,
      reviewState: "unreviewed" as const,
    }),
  ]);
  const tokens: TranscriptToken[] = [];
  const segments: TranscriptSegment[] = [];
  for (const [segmentIndex, segment] of imported.entries()) {
    const words = segment.text.split(/\s+/).filter(Boolean);
    const tokenDuration = Math.max(1, Math.floor((segment.endMs - segment.startMs) / Math.max(words.length, 1)));
    const segmentTokens = words.map((text, wordIndex) => {
      const startMs = segment.startMs + tokenDuration * wordIndex;
      const endMs =
        wordIndex === words.length - 1 ? segment.endMs : Math.min(segment.endMs, startMs + tokenDuration);
      const normalizedText = normalizeWord(text);
      const token: TranscriptToken = Object.freeze({
        id: deterministicUuid({ documentId, segmentIndex, wordIndex }),
        index: tokens.length + wordIndex,
        text,
        normalizedText,
        kind: normalizedText === "um" || normalizedText === "uh" ? "filler" : "word",
        startMs,
        endMs,
        confidence: null,
        speakerId: "speaker-unknown",
        alignment: Object.freeze({
          basis: "estimated_segment" as const,
          startBin: waveformBinForTime(startMs, binDurationMs, peakCount),
          endBin: waveformBinForTime(Math.max(endMs - 1, startMs), binDurationMs, peakCount),
          binDurationMs,
        }),
      });
      return token;
    });
    tokens.push(...segmentTokens);
    segments.push(
      Object.freeze({
        id: deterministicUuid({ documentId, segmentIndex }),
        startMs: segment.startMs,
        endMs: segment.endMs,
        speakerId: "speaker-unknown",
        tokenIds: freezeArray(segmentTokens.map((token) => token.id)),
        text: segment.text,
        confidence: null,
        accessibility: buildAccessibility(segment.text, segment.startMs, segment.endMs, {
          estimatedTiming: true,
          speakerPresent: false,
        }),
      }),
    );
  }
  const captions = segments.map((segment) =>
    Object.freeze({
      id: deterministicUuid({ documentId, kind: "caption", segmentId: segment.id }),
      startMs: segment.startMs,
      endMs: segment.endMs,
      speakerId: segment.speakerId,
      text: segment.text,
      accessibility: segment.accessibility,
    }),
  );
  const provider: TranscriptProviderDescriptor = Object.freeze({
    providerId: "legacy-transcriptions-table",
    adapterVersion: "1.0.0",
    model: "unknown",
    mode: "legacy_import",
    networkAccess: "none",
    paid: false,
    supportsWordTiming: false,
    supportsDiarization: false,
    supportsVerbatim: false,
  });
  return finalizeTranscript({
    schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    documentId,
    status: "completed",
    source,
    language: Object.freeze({
      requestedTag: null,
      detectedTag: row.language || "und",
      confidence: null,
      direction: "ltr",
    }),
    speakers,
    waveform: Object.freeze({
      durationMs: source.durationMs,
      binDurationMs,
      peaks: freezeArray(Array.from({ length: peakCount }, () => 0)),
      channel: "mono_mix",
      source: "unavailable",
      sourceTimeOriginMs: 0,
    }),
    tokens: freezeArray(tokens),
    segments: freezeArray(segments),
    captions: freezeArray(captions),
    provenance: {
      pipelineVersion: TRANSCRIPT_PIPELINE_VERSION,
      provider,
      createdAt: isIsoTimestamp(row.created_at) ? new Date(row.created_at).toISOString() : "1970-01-01T00:00:00.000Z",
      jobId: `legacy:${row.id}`,
      privacy: DEFAULT_TRANSCRIPT_PRIVACY,
      replay: {
        algorithm: "fnv1a64-v1",
        fixtureId: null,
        seed: row.id,
        requestDigest,
      },
    },
  });
}

export function transcriptTelemetry(document: TranscriptDocument): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: document.schemaVersion,
    documentId: document.documentId,
    assetId: document.source.assetId,
    versionId: document.source.versionId,
    sourceIdentityDigest: document.source.identityDigest,
    providerId: document.provenance.provider.providerId,
    providerMode: document.provenance.provider.mode,
    pipelineVersion: document.provenance.pipelineVersion,
    durationMs: document.source.durationMs,
    tokenCount: document.tokens.length,
    segmentCount: document.segments.length,
    speakerCount: document.speakers.length,
    languageTag: document.language.detectedTag,
    replayOutputDigest: document.provenance.replay.outputDigest,
    contentLogged: false,
  });
}
