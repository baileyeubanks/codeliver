import type { Version } from "@/lib/types/codeliver";
import {
  buildTranscriptSourceBinding,
  DEFAULT_TRANSCRIPT_PRIVACY,
  deterministicUuid,
  type TranscriptBudget,
  type TranscriptRequest,
  type TranscriptSourceBinding,
} from "@/lib/transcript/core";

export const DURABLE_MEDIA_INTELLIGENCE_CAPABILITY = Object.freeze({
  configured: false,
  persistence: "append_only_adapter_required",
  queue: "durable_queue_adapter_required",
  requiredAuthority: Object.freeze([
    "trusted_source_sha256_receipt",
    "atomic_artifact_and_audit_commit",
    "tenant_scoped_idempotency",
    "lease_fencing_and_cancellation",
    "retention_and_legal_hold_policy",
  ]),
  paidProviderCallsEnabled: false,
  sourceMediaMutation: false,
});

export function durableMediaIntelligenceUnavailable(operation: string) {
  return Object.freeze({
    error: `${operation} requires a configured durable media-intelligence authority`,
    code: "durable_authority_unavailable",
    capability: DURABLE_MEDIA_INTELLIGENCE_CAPABILITY,
  });
}

export function transcriptSourceFromVersion(version: Version): TranscriptSourceBinding {
  if (
    typeof version.duration_seconds !== "number" ||
    !Number.isFinite(version.duration_seconds) ||
    version.duration_seconds <= 0
  ) {
    throw new TypeError("The selected media version has no valid duration");
  }

  return buildTranscriptSourceBinding({
    assetId: version.asset_id,
    versionId: version.id,
    versionNumber: version.version_number,
    versionCreatedAt: version.created_at,
    durationMs: Math.round(version.duration_seconds * 1_000),
    fileSizeBytes: version.file_size,
    mediaSha256: null,
  });
}

export function buildSafeDemoTranscriptRequest(input: {
  readonly source: TranscriptSourceBinding;
  readonly clientRequestId: string;
  readonly languageTag?: string | null;
  readonly budget?: TranscriptBudget;
}): TranscriptRequest {
  const clientRequestId = input.clientRequestId.trim();
  if (!clientRequestId || clientRequestId.length > 160) {
    throw new TypeError("client_request_id is required and must be at most 160 characters");
  }
  const languageTag = input.languageTag?.trim() || null;
  if (languageTag && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(languageTag)) {
    throw new TypeError("language_tag must be a BCP 47 language tag");
  }
  const budget = input.budget ?? {
    maxCostMicrounits: 0,
    maxLatencyMs: 5_000,
  };
  if (
    !Number.isInteger(budget.maxCostMicrounits) ||
    budget.maxCostMicrounits < 0 ||
    !Number.isInteger(budget.maxLatencyMs) ||
    budget.maxLatencyMs < 1
  ) {
    throw new TypeError("Transcript budget is invalid");
  }

  return Object.freeze({
    jobId: deterministicUuid({
      kind: "safe-demo-transcript-job",
      clientRequestId,
      sourceIdentity: input.source.identityDigest,
    }),
    source: input.source,
    languageTag,
    diarization: true,
    verbatim: true,
    privacy: DEFAULT_TRANSCRIPT_PRIVACY,
    budget: Object.freeze({ ...budget }),
    replaySeed: clientRequestId,
  });
}
