import assert from "node:assert/strict";
import test from "node:test";
import { analyzePortfolio } from "./analyze";
import { PortfolioAnalyticsError } from "./errors";
import { executePortfolioAnalytics } from "./service";
import {
  PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
  PORTFOLIO_ANALYTICS_READ_PERMISSION,
  type PortfolioAnalyticsPrincipal,
  type PortfolioAnalyticsQuery,
  type PortfolioAnalyticsSource,
  type PortfolioVersionFact,
} from "./types";
import { parsePortfolioAnalyticsQuery } from "./validation";

function id(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

const tenantId = id(1);
const projectId = id(2);
const principal: PortfolioAnalyticsPrincipal = {
  subjectId: id(3),
  tenantId,
  permissions: [PORTFOLIO_ANALYTICS_READ_PERMISSION],
};

function rawQuery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
    tenantId,
    idempotencyKey: "portfolio-test-0001",
    projectIds: [projectId],
    window: {
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-31T23:59:59Z",
      asOf: "2026-02-01T00:00:00Z",
    },
    filters: {},
    page: { limit: 1 },
    snapshot: { mode: "capture" },
    ...overrides,
  };
}

function fact(sequence: number, overrides: Partial<PortfolioVersionFact> = {}): PortfolioVersionFact {
  return {
    tenantId,
    projectId,
    assetId: id(100 + sequence),
    assetUpdatedAt: "2026-01-20T00:00:00.000Z",
    fileType: "video",
    versionId: id(200 + sequence),
    versionNumber: 1,
    versionCreatedAt: "2026-01-10T00:00:00.000Z",
    fileSizeBytes: "9007199254740991",
    durationMilliseconds: "2500",
    ...overrides,
  };
}

function expectCode(code: PortfolioAnalyticsError["code"]): (error: unknown) => boolean {
  return (error) => error instanceof PortfolioAnalyticsError && error.code === code;
}

test("rejects forged tenants before touching the source", async () => {
  const forged = parsePortfolioAnalyticsQuery(rawQuery({ tenantId: id(999) }));
  let reads = 0;
  const source: PortfolioAnalyticsSource = {
    async loadCaptureFacts() {
      reads += 1;
      return [];
    },
    async loadReplayFacts() {
      reads += 1;
      return [];
    },
  };
  await assert.rejects(() => executePortfolioAnalytics(principal, forged, source), expectCode("FORBIDDEN"));
  assert.equal(reads, 0);
});

test("rejects privilege escalation without the explicit read permission", () => {
  const query = parsePortfolioAnalyticsQuery(rawQuery());
  assert.throws(
    () => analyzePortfolio({ ...principal, permissions: [] }, query, []),
    expectCode("FORBIDDEN"),
  );
});

test("rejects a cross-tenant fact even after authorization", () => {
  const query = parsePortfolioAnalyticsQuery(rawQuery());
  assert.throws(
    () => analyzePortfolio(principal, query, [fact(1, { tenantId: id(999) })]),
    expectCode("FORBIDDEN"),
  );
});

test("deduplicates identical facts and sums decimal metrics without float overflow", () => {
  const query = parsePortfolioAnalyticsQuery(rawQuery({ page: { limit: 10 } }));
  const first = fact(1);
  const second = fact(2, { fileType: "audio", durationMilliseconds: "3750" });
  const result = analyzePortfolio(principal, query, [second, first, first]);
  assert.equal(result.totals.versionCount, 2);
  assert.equal(result.totals.distinctAssetCount, 2);
  assert.equal(result.totals.storageBytesAdded, "18014398509481982");
  assert.equal(result.totals.durationMillisecondsAdded, "6250");
  assert.equal(result.receipt.duplicateFactCount, 1);
  assert.equal(result.byFileType.audio, 1);
  assert.equal(result.byFileType.video, 1);
});

test("is deterministic for an identical idempotent capture", () => {
  const query = parsePortfolioAnalyticsQuery(rawQuery({ page: { limit: 10 } }));
  const facts = [fact(2), fact(1)];
  assert.deepEqual(
    analyzePortfolio(principal, query, facts),
    analyzePortfolio(principal, query, [...facts].reverse()),
  );
});

test("replays a captured binding while ignoring later unbound versions", () => {
  const captureQuery = parsePortfolioAnalyticsQuery(rawQuery({ page: { limit: 10 } }));
  const originalFacts = [fact(1), fact(2)];
  const captured = analyzePortfolio(principal, captureQuery, originalFacts);
  const replayQuery: PortfolioAnalyticsQuery = {
    ...captureQuery,
    snapshot: { mode: "replay", binding: captured.snapshot.binding },
  };
  const replayed = analyzePortfolio(principal, replayQuery, originalFacts);
  assert.equal(replayed.snapshot.id, captured.snapshot.id);
  assert.equal(replayed.receipt.receiptId, captured.receipt.receiptId);
  assert.deepEqual(replayed.totals, captured.totals);

  const laterUnboundFact = fact(3, { versionCreatedAt: "2026-01-25T00:00:00.000Z" });
  assert.throws(
    () => analyzePortfolio(principal, replayQuery, [...originalFacts, laterUnboundFact]),
    expectCode("SNAPSHOT_CONFLICT"),
  );
  // The source adapter's replay path requests only bound IDs; the pure contract
  // rejects accidental extra rows instead of silently mixing snapshots.
});

test("rejects stale fingerprints and mixed identities for one asset version", () => {
  const query = parsePortfolioAnalyticsQuery(rawQuery({ page: { limit: 10 } }));
  const original = fact(1);
  const captured = analyzePortfolio(principal, query, [original]);
  const replayQuery: PortfolioAnalyticsQuery = {
    ...query,
    snapshot: { mode: "replay", binding: captured.snapshot.binding },
  };
  assert.throws(
    () => analyzePortfolio(principal, replayQuery, [{ ...original, fileSizeBytes: "8" }]),
    expectCode("SNAPSHOT_CONFLICT"),
  );
  assert.throws(
    () => analyzePortfolio(principal, query, [original, { ...original, versionId: id(999) }]),
    expectCode("SNAPSHOT_CONFLICT"),
  );
});

test("rejects conflicting duplicate events", () => {
  const query = parsePortfolioAnalyticsQuery(rawQuery());
  const original = fact(1);
  assert.throws(
    () => analyzePortfolio(principal, query, [original, { ...original, durationMilliseconds: "7" }]),
    expectCode("SNAPSHOT_CONFLICT"),
  );
});

test("binds opaque pagination cursors to one snapshot", () => {
  const captureQuery = parsePortfolioAnalyticsQuery(rawQuery({ page: { limit: 1 } }));
  const facts = [fact(1), fact(2)];
  const firstPage = analyzePortfolio(principal, captureQuery, facts);
  assert.ok(firstPage.page.nextCursor);
  const replayQuery: PortfolioAnalyticsQuery = {
    ...captureQuery,
    page: { limit: 1, cursor: firstPage.page.nextCursor! },
    snapshot: { mode: "replay", binding: firstPage.snapshot.binding },
  };
  const secondPage = analyzePortfolio(principal, replayQuery, facts);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(secondPage.items[0]?.versionId, firstPage.items[0]?.versionId);
  assert.equal(secondPage.page.nextCursor, null);

  assert.throws(
    () => analyzePortfolio(principal, { ...replayQuery, page: { limit: 1, cursor: "tampered" } }, facts),
    expectCode("INVALID_QUERY"),
  );
});

test("fails closed on malformed ranges, filters, and out-of-window facts", () => {
  assert.throws(
    () =>
      parsePortfolioAnalyticsQuery(
        rawQuery({
          window: {
            from: "2026-02-01T00:00:00Z",
            to: "2026-01-01T00:00:00Z",
            asOf: "2026-02-02T00:00:00Z",
          },
        }),
      ),
    expectCode("INVALID_QUERY"),
  );
  assert.throws(
    () => parsePortfolioAnalyticsQuery(rawQuery({ filters: { fileTypes: ["executable"] } })),
    expectCode("INVALID_QUERY"),
  );
  const query = parsePortfolioAnalyticsQuery(rawQuery());
  assert.throws(
    () => analyzePortfolio(principal, query, [fact(1, { versionCreatedAt: "2025-01-01T00:00:00Z" })]),
    expectCode("SOURCE_FAILURE"),
  );
});

test("enforces window, page, and source resource bounds", () => {
  assert.throws(
    () =>
      parsePortfolioAnalyticsQuery(
        rawQuery({
          window: {
            from: "2024-01-01T00:00:00Z",
            to: "2026-01-31T00:00:00Z",
            asOf: "2026-02-01T00:00:00Z",
          },
        }),
      ),
    expectCode("INVALID_QUERY"),
  );
  assert.throws(
    () => parsePortfolioAnalyticsQuery(rawQuery({ page: { limit: 101 } })),
    expectCode("INVALID_QUERY"),
  );
  const query = parsePortfolioAnalyticsQuery(rawQuery());
  const tooManyFacts = Array.from({ length: 1_001 }, (_, index) =>
    fact(index + 1, {
      assetId: id(10_000 + index),
      versionId: id(20_000 + index),
    }),
  );
  assert.throws(
    () => analyzePortfolio(principal, query, tooManyFacts),
    expectCode("RESOURCE_LIMIT"),
  );
});

test("is API-only and declares no user-interface accessibility impact", () => {
  const result = analyzePortfolio(principal, parsePortfolioAnalyticsQuery(rawQuery()), []);
  assert.deepEqual(result.accessibility, { surface: "api-only", userInterfaceChanged: false });
  assert.equal(result.receipt.readOnly, true);
  assert.match(result.snapshot.rollback, /source drift fails closed/);
});
