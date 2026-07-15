import { invalidQuery } from "./errors";
import {
  PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
  PORTFOLIO_LIMITS,
  type PortfolioAnalyticsFilters,
  type PortfolioAnalyticsQuery,
  type PortfolioFactBinding,
  type PortfolioFileType,
  type PortfolioSnapshotBinding,
  type PortfolioWindow,
} from "./types";

const FILE_TYPES = new Set<PortfolioFileType>([
  "audio",
  "document",
  "image",
  "other",
  "video",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidQuery(`${field} must be an object`, field);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    invalidQuery(`${field} must be a non-empty string no longer than ${maxLength} characters`, field);
  }
  return value;
}

function uuid(value: unknown, field: string): string {
  const parsed = string(value, field, 36);
  if (!UUID_PATTERN.test(parsed)) {
    invalidQuery(`${field} must be a UUID`, field);
  }
  return parsed.toLowerCase();
}

function iso(value: unknown, field: string): string {
  const parsed = string(value, field, 30);
  const milliseconds = Date.parse(parsed);
  if (!ISO_PATTERN.test(parsed) || !Number.isFinite(milliseconds)) {
    invalidQuery(`${field} must be an ISO-8601 UTC timestamp`, field);
  }
  return new Date(milliseconds).toISOString();
}

function uniqueSortedUuids(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    invalidQuery(`${field} must contain between 1 and ${max} UUIDs`, field);
  }
  const parsed = value.map((entry, index) => uuid(entry, `${field}[${index}]`));
  if (new Set(parsed).size !== parsed.length) {
    invalidQuery(`${field} cannot contain duplicates`, field);
  }
  return parsed.sort();
}

function parseWindow(value: unknown, field: string): PortfolioWindow {
  const input = record(value, field);
  const from = iso(input.from, `${field}.from`);
  const to = iso(input.to, `${field}.to`);
  const asOf = iso(input.asOf, `${field}.asOf`);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const asOfMs = Date.parse(asOf);
  if (fromMs > toMs) invalidQuery(`${field}.from must not be after ${field}.to`, field);
  if (toMs > asOfMs) invalidQuery(`${field}.to must not be after ${field}.asOf`, field);
  const maxWindowMs = PORTFOLIO_LIMITS.maxWindowDays * 24 * 60 * 60 * 1_000;
  if (toMs - fromMs > maxWindowMs) {
    invalidQuery(`${field} cannot exceed ${PORTFOLIO_LIMITS.maxWindowDays} days`, field);
  }
  return { from, to, asOf };
}

function parseFilters(value: unknown, field: string): PortfolioAnalyticsFilters {
  if (value === undefined) return {};
  const input = record(value, field);
  if (input.fileTypes === undefined) return {};
  if (!Array.isArray(input.fileTypes) || input.fileTypes.length === 0 || input.fileTypes.length > FILE_TYPES.size) {
    invalidQuery(`${field}.fileTypes must contain between 1 and ${FILE_TYPES.size} values`, `${field}.fileTypes`);
  }
  const fileTypes = input.fileTypes.map((entry, index) => {
    if (typeof entry !== "string" || !FILE_TYPES.has(entry as PortfolioFileType)) {
      invalidQuery(`${field}.fileTypes[${index}] is unsupported`, `${field}.fileTypes[${index}]`);
    }
    return entry as PortfolioFileType;
  });
  if (new Set(fileTypes).size !== fileTypes.length) {
    invalidQuery(`${field}.fileTypes cannot contain duplicates`, `${field}.fileTypes`);
  }
  return { fileTypes: fileTypes.sort() };
}

function parseFactBindings(value: unknown, field: string): PortfolioFactBinding[] {
  if (!Array.isArray(value) || value.length > PORTFOLIO_LIMITS.maxFacts) {
    invalidQuery(`${field} must contain at most ${PORTFOLIO_LIMITS.maxFacts} bindings`, field);
  }
  const seen = new Set<string>();
  const bindings = value.map((entry, index) => {
    const input = record(entry, `${field}[${index}]`);
    const versionId = uuid(input.versionId, `${field}[${index}].versionId`);
    const fingerprint = string(input.fingerprint, `${field}[${index}].fingerprint`, 64);
    if (!DIGEST_PATTERN.test(fingerprint)) {
      invalidQuery(`${field}[${index}].fingerprint must be a SHA-256 digest`, `${field}[${index}].fingerprint`);
    }
    if (seen.has(versionId)) invalidQuery(`${field} cannot bind a version more than once`, field);
    seen.add(versionId);
    return { versionId, fingerprint };
  });
  return bindings.sort((left, right) => left.versionId.localeCompare(right.versionId));
}

function parseBinding(value: unknown, field: string): PortfolioSnapshotBinding {
  const input = record(value, field);
  if (input.contractVersion !== PORTFOLIO_ANALYTICS_CONTRACT_VERSION) {
    invalidQuery(`${field}.contractVersion is unsupported`, `${field}.contractVersion`);
  }
  return {
    contractVersion: PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
    tenantId: uuid(input.tenantId, `${field}.tenantId`),
    projectIds: uniqueSortedUuids(input.projectIds, `${field}.projectIds`, PORTFOLIO_LIMITS.maxProjects),
    window: parseWindow(input.window, `${field}.window`),
    filters: parseFilters(input.filters, `${field}.filters`),
    facts: parseFactBindings(input.facts, `${field}.facts`),
  };
}

export function parsePortfolioAnalyticsQuery(value: unknown): PortfolioAnalyticsQuery {
  const input = record(value, "body");
  if (input.contractVersion !== PORTFOLIO_ANALYTICS_CONTRACT_VERSION) {
    invalidQuery("contractVersion is unsupported", "contractVersion");
  }
  const idempotencyKey = string(input.idempotencyKey, "idempotencyKey", 128);
  if (idempotencyKey.length < 8 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    invalidQuery("idempotencyKey must be 8-128 safe ASCII characters", "idempotencyKey");
  }

  const pageInput = input.page === undefined ? {} : record(input.page, "page");
  const limit = pageInput.limit === undefined ? 50 : pageInput.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > PORTFOLIO_LIMITS.maxPageSize) {
    invalidQuery(`page.limit must be an integer from 1 to ${PORTFOLIO_LIMITS.maxPageSize}`, "page.limit");
  }
  const cursor = pageInput.cursor === undefined ? undefined : string(pageInput.cursor, "page.cursor", 2_048);

  const snapshotInput = input.snapshot === undefined ? { mode: "capture" } : record(input.snapshot, "snapshot");
  let snapshot: PortfolioAnalyticsQuery["snapshot"];
  if (snapshotInput.mode === "capture") {
    snapshot = { mode: "capture" };
  } else if (snapshotInput.mode === "replay") {
    snapshot = { mode: "replay", binding: parseBinding(snapshotInput.binding, "snapshot.binding") };
  } else {
    invalidQuery("snapshot.mode must be capture or replay", "snapshot.mode");
  }

  return {
    contractVersion: PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
    tenantId: uuid(input.tenantId, "tenantId"),
    idempotencyKey,
    projectIds: uniqueSortedUuids(input.projectIds, "projectIds", PORTFOLIO_LIMITS.maxProjects),
    window: parseWindow(input.window, "window"),
    filters: parseFilters(input.filters, "filters"),
    page: { limit: limit as number, cursor },
    snapshot,
  };
}
