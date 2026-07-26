import { sha256 } from "./canonical";
import { MeteringError, safeIntegerAdd, safeIntegerMultiply } from "./policy";
import type {
  CommercialPricingTerms,
  MeteredOperation,
  NativeUsage,
  OperationRate,
  RateCatalog,
} from "./types";
import { NATIVE_USAGE_DIMENSIONS } from "./types";

function rate(
  definition: Omit<OperationRate, "minimumBasisPoints" | "maximumBasisPoints"> &
    Partial<Pick<OperationRate, "minimumBasisPoints" | "maximumBasisPoints">>,
): OperationRate {
  return {
    minimumBasisPoints: definition.meterClass === "paid_compute" ? 8_500 : 10_000,
    maximumBasisPoints: definition.meterClass === "paid_compute" ? 12_500 : 10_000,
    ...definition,
  };
}

const rates: Record<MeteredOperation, OperationRate> = {
  manual_edit: rate({
    operation: "manual_edit",
    meterClass: "free_collaboration",
    displayName: "Manual edit",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Human editing is free collaboration.",
  }),
  comment: rate({
    operation: "comment",
    meterClass: "free_collaboration",
    displayName: "Comment",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Comments never consume Co-Credits.",
  }),
  approval: rate({
    operation: "approval",
    meterClass: "free_collaboration",
    displayName: "Approval",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Approvals never consume Co-Credits.",
  }),
  metadata_update: rate({
    operation: "metadata_update",
    meterClass: "free_collaboration",
    displayName: "Metadata update",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Metadata work is free collaboration.",
  }),
  share: rate({
    operation: "share",
    meterClass: "free_collaboration",
    displayName: "Share",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Creating and using review access is free collaboration.",
  }),
  existing_proxy_playback: rate({
    operation: "existing_proxy_playback",
    meterClass: "free_collaboration",
    displayName: "Existing proxy playback",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Playback of an existing proxy never consumes Co-Credits.",
  }),
  review_history: rate({
    operation: "review_history",
    meterClass: "free_collaboration",
    displayName: "Review history",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Project-grant review history is a service obligation.",
  }),
  approved_final_download: rate({
    operation: "approved_final_download",
    meterClass: "free_collaboration",
    displayName: "Approved final download",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "A commissioned approved final is never credit-gated.",
  }),
  ai_research: rate({
    operation: "ai_research",
    meterClass: "paid_compute",
    displayName: "AI research",
    baseCoUnits: 20,
    components: [
      { dimension: "search_calls", blockSize: 1, coUnitsPerBlock: 12 },
      { dimension: "input_tokens", blockSize: 1_000, coUnitsPerBlock: 2 },
      { dimension: "output_tokens", blockSize: 1_000, coUnitsPerBlock: 8 },
    ],
    customerBoundary: "AI retrieval and synthesis require a reservation.",
  }),
  ai_generation: rate({
    operation: "ai_generation",
    meterClass: "paid_compute",
    displayName: "AI generation",
    baseCoUnits: 15,
    components: [
      { dimension: "input_tokens", blockSize: 1_000, coUnitsPerBlock: 2 },
      { dimension: "output_tokens", blockSize: 1_000, coUnitsPerBlock: 10 },
    ],
    customerBoundary: "Generated text requires a reservation.",
  }),
  transcription: rate({
    operation: "transcription",
    meterClass: "paid_compute",
    displayName: "Transcription",
    baseCoUnits: 10,
    components: [
      { dimension: "audio_milliseconds", blockSize: 60_000, coUnitsPerBlock: 90 },
    ],
    customerBoundary: "New transcription requires a reservation.",
  }),
  translation: rate({
    operation: "translation",
    meterClass: "paid_compute",
    displayName: "Translation",
    baseCoUnits: 10,
    components: [
      { dimension: "translated_characters", blockSize: 1_000, coUnitsPerBlock: 18 },
    ],
    customerBoundary: "New machine translation requires a reservation.",
  }),
  media_analysis: rate({
    operation: "media_analysis",
    meterClass: "paid_compute",
    displayName: "Media analysis",
    baseCoUnits: 15,
    components: [
      {
        dimension: "analyzed_media_milliseconds",
        blockSize: 60_000,
        coUnitsPerBlock: 75,
      },
    ],
    customerBoundary: "New media analysis requires a reservation.",
  }),
  generated_media: rate({
    operation: "generated_media",
    meterClass: "paid_compute",
    displayName: "Generated media",
    baseCoUnits: 40,
    components: [
      { dimension: "generated_megapixels", blockSize: 1, coUnitsPerBlock: 55 },
    ],
    customerBoundary: "Generated media requires a reservation and provenance.",
  }),
  new_transcode: rate({
    operation: "new_transcode",
    meterClass: "paid_compute",
    displayName: "New transcode",
    baseCoUnits: 10,
    components: [
      {
        dimension: "transcoded_media_milliseconds",
        blockSize: 60_000,
        coUnitsPerBlock: 45,
      },
    ],
    customerBoundary: "A new transcode requires a reservation.",
  }),
  preview_render: rate({
    operation: "preview_render",
    meterClass: "paid_compute",
    displayName: "Preview render",
    baseCoUnits: 25,
    components: [
      {
        dimension: "rendered_pixel_milliseconds",
        blockSize: 1_000_000_000,
        coUnitsPerBlock: 18,
      },
    ],
    customerBoundary: "A newly computed preview requires a reservation.",
  }),
  export_render: rate({
    operation: "export_render",
    meterClass: "paid_compute",
    displayName: "Export render",
    baseCoUnits: 50,
    components: [
      {
        dimension: "rendered_pixel_milliseconds",
        blockSize: 1_000_000_000,
        coUnitsPerBlock: 30,
      },
    ],
    customerBoundary: "A new export render requires a reservation.",
  }),
  storage_byte_hours: rate({
    operation: "storage_byte_hours",
    meterClass: "storage",
    displayName: "Storage",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Storage is a separate meter and cannot drain AI credits.",
  }),
  egress_bytes: rate({
    operation: "egress_bytes",
    meterClass: "egress",
    displayName: "Egress",
    baseCoUnits: 0,
    components: [],
    customerBoundary: "Egress is a separate meter and cannot drain AI credits.",
  }),
};

const catalogWithoutHash = {
  version: "cco-cu-contract-2026-07-14.v1",
  effectiveAt: "2026-07-14T00:00:00.000Z",
  status: "fixture" as const,
  rates,
};

export const DEFAULT_RATE_CATALOG: RateCatalog = Object.freeze({
  ...catalogWithoutHash,
  integrityHash: sha256(catalogWithoutHash),
});

export const UNPRICED_COMMERCIAL_TERMS: CommercialPricingTerms = Object.freeze({
  version: "commercial-unpriced.v1",
  currency: "USD",
  overageMicrosPerCoUnit: null,
  status: "unpriced",
});

export const DEMO_COMMERCIAL_TERMS: CommercialPricingTerms = Object.freeze({
  version: "commercial-demo-not-for-billing.v1",
  currency: "USD",
  overageMicrosPerCoUnit: 1_000,
  status: "demo",
});

function assertUsageValue(dimension: string, value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${dimension} must be a non-negative safe integer`);
  }
}

export function normalizeNativeUsage(usage: NativeUsage): NativeUsage {
  const normalized: NativeUsage = {};
  for (const [dimension, value] of Object.entries(usage).sort(([a], [b]) => a.localeCompare(b))) {
    if (value === undefined) continue;
    if (!NATIVE_USAGE_DIMENSIONS.includes(dimension as (typeof NATIVE_USAGE_DIMENSIONS)[number])) {
      throw new MeteringError(
        "unknown_usage_dimension",
        `${dimension} is not a recognized native usage dimension`,
      );
    }
    assertUsageValue(dimension, value);
    normalized[dimension as keyof NativeUsage] = value;
  }
  return normalized;
}

export function estimateCoUnits(
  catalog: RateCatalog,
  operation: MeteredOperation,
  usage: NativeUsage,
) {
  const operationRate = catalog.rates[operation];
  if (!operationRate) throw new TypeError(`Unknown metered operation: ${operation}`);

  const normalizedUsage = normalizeNativeUsage(usage);
  const allowedDimensions = new Set(
    operationRate.components.map((component) => component.dimension),
  );

  for (const dimension of Object.keys(normalizedUsage)) {
    if (!allowedDimensions.has(dimension as keyof NativeUsage)) {
      throw new TypeError(`${dimension} is not valid for ${operation}`);
    }
  }

  if (operationRate.meterClass !== "paid_compute") {
    return {
      meterClass: operationRate.meterClass,
      nativeUsage: normalizedUsage,
      coUnits: { min: 0, likely: 0, max: 0 },
      assumptions: [operationRate.customerBoundary],
    };
  }

  let likely = operationRate.baseCoUnits;
  const assumptions = [`Base: ${operationRate.baseCoUnits} CU.`];

  for (const component of operationRate.components) {
    const quantity = normalizedUsage[component.dimension] ?? 0;
    const blocks = Math.ceil(quantity / component.blockSize);
    const componentCoUnits = safeIntegerMultiply(
      blocks,
      component.coUnitsPerBlock,
      `${operation}.${component.dimension}.coUnits`,
    );
    likely = safeIntegerAdd(likely, componentCoUnits, `${operation}.likelyCoUnits`);
    assumptions.push(
      `${component.dimension}: ${quantity} in ${blocks} block(s) at ${component.coUnitsPerBlock} CU per ${component.blockSize}.`,
    );
  }

  const likelyBigInt = BigInt(likely);
  const min = Number(
    (likelyBigInt * BigInt(operationRate.minimumBasisPoints)) / 10_000n,
  );
  const max = Number(
    (likelyBigInt * BigInt(operationRate.maximumBasisPoints) + 9_999n) / 10_000n,
  );
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new MeteringError(
      "integer_overflow",
      `${operation} estimate exceeds the safe integer range`,
    );
  }

  return {
    meterClass: operationRate.meterClass,
    nativeUsage: normalizedUsage,
    coUnits: { min, likely, max },
    assumptions: [...assumptions, operationRate.customerBoundary],
  };
}

export function coUnitsToCredits(coUnits: number) {
  return coUnits / 1_000;
}
