import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeTranscriptProviderInvocation,
  buildTranscriptSourceBinding,
  createSafeDemoTranscript,
  createSafeDemoTranscriptProvider,
  DEFAULT_TRANSCRIPT_PRIVACY,
  deterministicDigest,
  invokeTranscriptProvider,
  planTranscriptBatch,
  parseTranscriptDocument,
  transcriptFromLegacyRow,
  transcriptTelemetry,
  validateTranscriptDocument,
  type TranscriptDocument,
  type TranscriptProviderAdapter,
  type TranscriptRequest,
} from "../lib/transcript/core.ts";

function source(versionId = "00000000-0000-4000-8000-000000000002") {
  return buildTranscriptSourceBinding({
    assetId: "00000000-0000-4000-8000-000000000001",
    versionId,
    versionNumber: 2,
    versionCreatedAt: "2026-07-14T12:00:00.000Z",
    durationMs: 22_000,
    fileSizeBytes: 48_000_000,
    mediaSha256: "a".repeat(64),
  });
}

function request(overrides: Partial<TranscriptRequest> = {}): TranscriptRequest {
  return {
    jobId: "00000000-0000-5000-8000-000000000010",
    source: source(),
    languageTag: "en-US",
    diarization: true,
    verbatim: true,
    privacy: DEFAULT_TRANSCRIPT_PRIVACY,
    budget: { maxCostMicrounits: 0, maxLatencyMs: 5_000 },
    replaySeed: "fixture-replay-1",
    ...overrides,
  };
}

test("safe transcript replay is deterministic, immutable, and waveform aligned", () => {
  const first = createSafeDemoTranscript(request());
  const second = createSafeDemoTranscript(request());

  assert.deepEqual(first, second);
  assert.equal(first.provenance.replay.outputDigest, second.provenance.replay.outputDigest);
  assert.equal(validateTranscriptDocument(first).ok, true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.tokens), true);

  for (const token of first.tokens) {
    assert.equal(token.alignment.startBin, Math.floor(token.startMs / first.waveform.binDurationMs));
    assert.equal(
      token.alignment.endBin,
      Math.floor(Math.max(token.endMs - 1, token.startMs) / first.waveform.binDurationMs),
    );
  }
});

test("source-version tampering invalidates provenance and replay", () => {
  const transcript = createSafeDemoTranscript(request());
  const tampered = {
    ...transcript,
    source: { ...transcript.source, versionId: "00000000-0000-4000-8000-000000000099" },
  } as TranscriptDocument;
  const validation = validateTranscriptDocument(tampered);

  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.ok(validation.errors.some((error) => error.includes("Source identity digest")));
    assert.ok(validation.errors.some((error) => error.includes("replay output digest")));
  }
});

test("safe-demo integrity rejects forged content even with a recomputed public replay digest", () => {
  const transcript = createSafeDemoTranscript(request());
  const forged = {
    ...transcript,
    tokens: transcript.tokens.map((token, index) =>
      index === 0 ? { ...token, text: "Injected", normalizedText: "injected" } : token
    ),
  } as TranscriptDocument;
  const digestBasis = {
    ...forged,
    provenance: {
      ...forged.provenance,
      replay: { ...forged.provenance.replay, outputDigest: "" },
    },
  };
  const forgedWithDigest = {
    ...forged,
    provenance: {
      ...forged.provenance,
      replay: {
        ...forged.provenance.replay,
        outputDigest: deterministicDigest(digestBasis),
      },
    },
  } as TranscriptDocument;

  const validation = validateTranscriptDocument(forgedWithDigest);
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.ok(validation.errors.some((error) => error.includes("canonical deterministic fixture")));
    assert.equal(validation.errors.some((error) => error.includes("replay output digest mismatch")), false);
  }
});

test("malformed transcript payloads fail closed without leaking parser exceptions", () => {
  const parsed = parseTranscriptDocument({ source: null });

  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.ok(parsed.errors.length > 0);
});

test("paid external provider is blocked before invocation without credentials and reservation", async () => {
  let invoked = false;
  const adapter: TranscriptProviderAdapter = {
    descriptor: {
      providerId: "external-test",
      adapterVersion: "1.0.0",
      model: "paid-model",
      mode: "external",
      networkAccess: "required",
      paid: true,
      supportsWordTiming: true,
      supportsDiarization: true,
      supportsVerbatim: true,
    },
    estimate: () => ({
      estimatedCostMicrounits: 25,
      estimatedLatencyMs: 1_000,
      billableAudioMs: 22_000,
      assumptions: [],
    }),
    async transcribe() {
      invoked = true;
      return createSafeDemoTranscript(request());
    },
  };

  await assert.rejects(
    invokeTranscriptProvider(adapter, request({
      budget: { maxCostMicrounits: 100, maxLatencyMs: 5_000 },
    }), {
      operation: "execute",
      explicitUserAction: true,
      credentialsPresent: false,
      allowNetwork: true,
      budgetReservationId: null,
    }),
    /credentials are required/i,
  );
  assert.equal(invoked, false);
});

test("provider cost and latency budgets fail closed", () => {
  const provider = createSafeDemoTranscriptProvider();
  const estimate = provider.estimate(request());

  assert.throws(() => authorizeTranscriptProviderInvocation(
    provider.descriptor,
    estimate,
    request({ budget: { maxCostMicrounits: 0, maxLatencyMs: 1 } }),
    {
      operation: "preview",
      explicitUserAction: true,
      credentialsPresent: false,
      allowNetwork: false,
      budgetReservationId: null,
    },
  ), /latency exceeds/i);
});

test("invalid provider estimates and invalid transcript budgets are rejected before work", () => {
  const provider = createSafeDemoTranscriptProvider();
  const invalidEstimate = {
    ...provider.estimate(request()),
    estimatedLatencyMs: Number.NaN,
  };

  assert.throws(() => authorizeTranscriptProviderInvocation(
    provider.descriptor,
    invalidEstimate,
    request(),
    {
      operation: "preview",
      explicitUserAction: true,
      credentialsPresent: false,
      allowNetwork: false,
      budgetReservationId: null,
    },
  ), /Provider estimate is invalid/i);
  assert.throws(() => authorizeTranscriptProviderInvocation(
    provider.descriptor,
    provider.estimate(request()),
    request({ budget: { maxCostMicrounits: Number.NaN, maxLatencyMs: 5_000 } }),
    {
      operation: "preview",
      explicitUserAction: true,
      credentialsPresent: false,
      allowNetwork: false,
      budgetReservationId: null,
    },
  ), /Transcript budget is invalid/i);
});

test("batch planning is deterministic and rejects duplicate source versions", () => {
  const provider = createSafeDemoTranscriptProvider();
  const first = request();
  const duplicate = request({ jobId: "00000000-0000-5000-8000-000000000011" });
  const planA = planTranscriptBatch({
    adapter: provider,
    requests: [first, duplicate],
    maxConcurrency: 2,
    budget: { maxCostMicrounits: 0, maxLatencyMs: 5_000 },
  });
  const planB = planTranscriptBatch({
    adapter: provider,
    requests: [first, duplicate],
    maxConcurrency: 2,
    budget: { maxCostMicrounits: 0, maxLatencyMs: 5_000 },
  });

  assert.deepEqual(planA, planB);
  assert.equal(planA.withinBudget, false);
  assert.ok(planA.rejectionReasons.some((reason) => reason.includes("Duplicate source version")));
});

test("legacy transcript adaptation is exact-version bound and marks estimated accessibility timing", () => {
  const binding = source();
  const transcript = transcriptFromLegacyRow({
    id: "00000000-0000-4000-8000-000000000050",
    asset_id: binding.assetId,
    version_id: binding.versionId,
    language: "en",
    status: "completed",
    created_at: "2026-07-14T13:00:00.000Z",
    segments: [{ start: 1, end: 3, text: "Legacy segment timing" }],
  }, binding);

  assert.equal(validateTranscriptDocument(transcript).ok, true);
  assert.equal(transcript.waveform.source, "unavailable");
  assert.ok(transcript.captions[0].accessibility.warnings.includes("estimated_timing"));
  assert.throws(() => transcriptFromLegacyRow({
    id: "row",
    asset_id: binding.assetId,
    version_id: "wrong-version",
    language: "en",
    status: "completed",
    created_at: "2026-07-14T13:00:00.000Z",
    segments: [{ start: 1, end: 2, text: "Wrong" }],
  }, binding), /not bound/i);
});

test("transcript telemetry contains identifiers and counts but no transcript content", () => {
  const transcript = createSafeDemoTranscript(request());
  const serialized = JSON.stringify(transcriptTelemetry(transcript));

  assert.equal(serialized.includes("welcome"), false);
  assert.equal(serialized.includes("Speaker 1"), false);
  assert.equal(serialized.includes(transcript.source.versionId), true);
});
