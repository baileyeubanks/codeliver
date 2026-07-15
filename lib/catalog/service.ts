import { createHash } from "node:crypto";
import {
  CATALOG_RECEIPT_SCHEMA_VERSION,
  CATALOG_SCHEMA_VERSION,
  type CatalogAction,
  type CatalogAuditResult,
  type CatalogDiscoveryResult,
  type CatalogItem,
  type CatalogItemView,
  type CatalogMutationResult,
  type CatalogPrincipal,
  type CatalogReceipt,
  type CatalogReceiptOutcome,
  type CatalogRepository,
  type CatalogRole,
} from "./contracts";
import { asCatalogError, CatalogError } from "./errors";
import {
  parseDiscoveryInput,
  parseIngestInput,
  parseRevertInput,
  parseTransitionInput,
} from "./validation";

interface CatalogServiceOptions {
  repository: CatalogRepository;
  now?: () => Date;
  monotonicNow?: () => number;
  onReceipt?: (receipt: CatalogReceipt) => void;
}

interface CursorPayload {
  version: 1;
  tenantScope: string;
  filterFingerprint: string;
  generation: number;
  offset: number;
}

const PERMISSIONS: Record<CatalogAction, ReadonlySet<CatalogRole>> = {
  discover: new Set(["owner", "admin", "member", "viewer"]),
  ingest: new Set(["owner", "admin"]),
  transition: new Set(["owner", "admin"]),
  revert: new Set(["owner"]),
  audit: new Set(["owner", "admin"]),
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function rawRequestId(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = (value as Record<string, unknown>).requestId;
    if (typeof candidate === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidate)) {
      return candidate;
    }
  }
  return crypto.randomUUID();
}

function rawAssetId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.assetId === "string") return input.assetId.slice(0, 128);
  if (input.version && typeof input.version === "object" && !Array.isArray(input.version)) {
    const assetId = (input.version as Record<string, unknown>).assetId;
    if (typeof assetId === "string") return assetId.slice(0, 128);
  }
  return null;
}

export class CatalogService {
  private readonly repository: CatalogRepository;
  private readonly now: () => Date;
  private readonly monotonicNow: () => number;
  private readonly onReceipt?: (receipt: CatalogReceipt) => void;

  constructor(options: CatalogServiceOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.onReceipt = options.onReceipt;
  }

  ingest(principal: CatalogPrincipal, rawInput: unknown): CatalogMutationResult {
    const startedAt = this.monotonicNow();
    const fallbackRequestId = rawRequestId(rawInput);
    try {
      const input = parseIngestInput(rawInput);
      this.authorize(principal, input.tenantId, "ingest");

      const digest = hash(stableStringify({
        action: "ingest",
        expectedRevision: input.expectedRevision,
        metadata: input.metadata,
        restrictedMetadata: input.restrictedMetadata,
        version: input.version,
      }));
      const replay = this.replay<CatalogMutationResult>(
        principal,
        input.idempotencyKey,
        digest,
        input.requestId,
        startedAt,
      );
      if (replay) return replay;

      const before = this.repository.getItem(principal.tenantId, input.version.assetId);
      const currentRevision = before?.revision ?? 0;
      if (currentRevision !== input.expectedRevision) {
        throw new CatalogError(
          "revision_conflict",
          `expectedRevision ${input.expectedRevision} does not match current revision ${currentRevision}.`,
          409,
        );
      }

      if (before && input.version.sequence < before.version.sequence) {
        throw new CatalogError(
          "stale_asset_version",
          "The supplied asset version is older than the catalog binding.",
          409,
        );
      }

      if (before && input.version.sequence === before.version.sequence) {
        const sameBinding = input.version.versionId === before.version.versionId
          && input.version.checksum === before.version.checksum;
        if (!sameBinding) {
          throw new CatalogError(
            "version_conflict",
            "The version sequence is already bound to a different immutable version.",
            409,
          );
        }
      }

      if (before && input.version.sequence > before.version.sequence
        && input.version.versionId === before.version.versionId) {
        throw new CatalogError(
          "version_conflict",
          "A version identifier cannot be reused for a different sequence.",
          409,
        );
      }

      const versionOwner = this.repository.getAssetIdForVersion(
        principal.tenantId,
        input.version.versionId,
      );
      if (versionOwner && versionOwner !== input.version.assetId) {
        throw new CatalogError(
          "version_conflict",
          "The immutable version identifier is already bound to another asset.",
          409,
        );
      }

      const occurredAt = this.now().toISOString();
      const contentFingerprint = hash(stableStringify({
        metadata: input.metadata,
        restrictedMetadata: input.restrictedMetadata,
        version: input.version,
      }));
      const isNoop = before?.contentFingerprint === contentFingerprint;
      const after: CatalogItem = isNoop && before
        ? before
        : {
            schemaVersion: CATALOG_SCHEMA_VERSION,
            tenantId: principal.tenantId,
            version: clone(input.version),
            metadata: clone(input.metadata),
            restrictedMetadata: clone(input.restrictedMetadata),
            lifecycleState: before?.lifecycleState ?? "active",
            revision: currentRevision + 1,
            contentFingerprint,
            createdAt: before?.createdAt ?? occurredAt,
            updatedAt: occurredAt,
            updatedBy: principal.actorId,
            revertedFromOperationId: null,
          };
      const operationId = this.operationId(principal.tenantId, input.idempotencyKey, digest);

      if (!isNoop) {
        this.repository.putItem(after);
        this.repository.putOperation({
          operationId,
          tenantId: principal.tenantId,
          action: "ingest",
          actorId: principal.actorId,
          before,
          after,
          occurredAt,
        });
      }

      const receipt = this.receipt({
        action: "ingest",
        actor: principal,
        assetId: after.version.assetId,
        durationMs: this.elapsed(startedAt),
        operationId,
        outcome: isNoop ? "noop" : "applied",
        requestId: input.requestId,
        revision: after.revision,
        versionId: after.version.versionId,
      });
      const result = { item: this.view(after, principal.role), receipt };
      this.recordReceipt(receipt);
      this.repository.putIdempotency({
        tenantId: principal.tenantId,
        key: input.idempotencyKey,
        digest,
        value: result,
      });
      return result;
    } catch (error) {
      this.recordFailure("ingest", principal, fallbackRequestId, rawAssetId(rawInput), startedAt, error);
      throw error;
    }
  }

  transition(principal: CatalogPrincipal, rawInput: unknown): CatalogMutationResult {
    const startedAt = this.monotonicNow();
    const fallbackRequestId = rawRequestId(rawInput);
    try {
      const input = parseTransitionInput(rawInput);
      this.authorize(principal, input.tenantId, "transition");
      const digest = hash(stableStringify({
        action: "transition",
        assetId: input.assetId,
        expectedRevision: input.expectedRevision,
        targetState: input.targetState,
      }));
      const replay = this.replay<CatalogMutationResult>(
        principal,
        input.idempotencyKey,
        digest,
        input.requestId,
        startedAt,
      );
      if (replay) return replay;

      const before = this.repository.getItem(principal.tenantId, input.assetId);
      if (!before) throw new CatalogError("not_found", "Catalog item not found.", 404);
      if (before.revision !== input.expectedRevision) {
        throw new CatalogError(
          "revision_conflict",
          `expectedRevision ${input.expectedRevision} does not match current revision ${before.revision}.`,
          409,
        );
      }

      const isNoop = before.lifecycleState === input.targetState;
      const occurredAt = this.now().toISOString();
      const after: CatalogItem = isNoop
        ? before
        : {
            ...before,
            lifecycleState: input.targetState,
            revision: before.revision + 1,
            updatedAt: occurredAt,
            updatedBy: principal.actorId,
            revertedFromOperationId: null,
          };
      const operationId = this.operationId(principal.tenantId, input.idempotencyKey, digest);
      if (!isNoop) {
        this.repository.putItem(after);
        this.repository.putOperation({
          operationId,
          tenantId: principal.tenantId,
          action: "transition",
          actorId: principal.actorId,
          before,
          after,
          occurredAt,
        });
      }

      const receipt = this.receipt({
        action: "transition",
        actor: principal,
        assetId: after.version.assetId,
        durationMs: this.elapsed(startedAt),
        operationId,
        outcome: isNoop ? "noop" : "applied",
        requestId: input.requestId,
        revision: after.revision,
        versionId: after.version.versionId,
      });
      const result = { item: this.view(after, principal.role), receipt };
      this.recordReceipt(receipt);
      this.repository.putIdempotency({
        tenantId: principal.tenantId,
        key: input.idempotencyKey,
        digest,
        value: result,
      });
      return result;
    } catch (error) {
      this.recordFailure("transition", principal, fallbackRequestId, rawAssetId(rawInput), startedAt, error);
      throw error;
    }
  }

  revert(principal: CatalogPrincipal, rawInput: unknown): CatalogMutationResult {
    const startedAt = this.monotonicNow();
    const fallbackRequestId = rawRequestId(rawInput);
    try {
      const input = parseRevertInput(rawInput);
      this.authorize(principal, input.tenantId, "revert");
      const digest = hash(stableStringify({
        action: "revert",
        expectedRevision: input.expectedRevision,
        operationId: input.operationId,
      }));
      const replay = this.replay<CatalogMutationResult>(
        principal,
        input.idempotencyKey,
        digest,
        input.requestId,
        startedAt,
      );
      if (replay) return replay;

      const target = this.repository.getOperation(principal.tenantId, input.operationId);
      if (!target) throw new CatalogError("not_found", "Catalog operation not found.", 404);
      if (target.action === "revert") {
        throw new CatalogError(
          "operation_not_reversible",
          "Revert operations cannot be targeted by another revert.",
          409,
        );
      }

      const current = this.repository.getItem(principal.tenantId, target.after.version.assetId);
      if (!current) throw new CatalogError("not_found", "Catalog item not found.", 404);
      if (current.revision !== input.expectedRevision || current.revision !== target.after.revision) {
        throw new CatalogError(
          "operation_not_reversible",
          "The operation is no longer the current item state and cannot be safely reverted.",
          409,
        );
      }

      const occurredAt = this.now().toISOString();
      const after: CatalogItem = target.before
        ? {
            ...target.before,
            revision: current.revision + 1,
            updatedAt: occurredAt,
            updatedBy: principal.actorId,
            revertedFromOperationId: target.operationId,
          }
        : {
            ...current,
            lifecycleState: "withdrawn",
            revision: current.revision + 1,
            updatedAt: occurredAt,
            updatedBy: principal.actorId,
            revertedFromOperationId: target.operationId,
          };
      const operationId = this.operationId(principal.tenantId, input.idempotencyKey, digest);
      this.repository.putItem(after);
      this.repository.putOperation({
        operationId,
        tenantId: principal.tenantId,
        action: "revert",
        actorId: principal.actorId,
        before: current,
        after,
        occurredAt,
      });

      const receipt = this.receipt({
        action: "revert",
        actor: principal,
        assetId: after.version.assetId,
        durationMs: this.elapsed(startedAt),
        operationId,
        outcome: "applied",
        requestId: input.requestId,
        revision: after.revision,
        versionId: after.version.versionId,
      });
      const result = { item: this.view(after, principal.role), receipt };
      this.recordReceipt(receipt);
      this.repository.putIdempotency({
        tenantId: principal.tenantId,
        key: input.idempotencyKey,
        digest,
        value: result,
      });
      return result;
    } catch (error) {
      this.recordFailure("revert", principal, fallbackRequestId, null, startedAt, error);
      throw error;
    }
  }

  discover(principal: CatalogPrincipal, rawInput: unknown): CatalogDiscoveryResult {
    const startedAt = this.monotonicNow();
    const fallbackRequestId = rawRequestId(rawInput);
    try {
      const input = parseDiscoveryInput(rawInput);
      this.authorize(principal, input.tenantId, "discover");
      const generation = this.repository.getGeneration(principal.tenantId);
      const filterFingerprint = hash(stableStringify({
        lifecycleState: input.lifecycleState,
        limit: input.limit,
        query: input.query,
        tags: input.tags,
      }));
      const offset = input.cursor
        ? this.decodeCursor(input.cursor, principal.tenantId, filterFingerprint, generation)
        : 0;

      const canSeeRestricted = principal.role === "owner" || principal.role === "admin";
      let items = this.repository.listItems(principal.tenantId).filter((item) =>
        canSeeRestricted || item.lifecycleState === "active",
      );
      if (input.lifecycleState) {
        items = items.filter((item) => item.lifecycleState === input.lifecycleState);
      }
      if (input.tags.length > 0) {
        items = items.filter((item) => input.tags.every((tag) => item.metadata.tags.includes(tag)));
      }
      if (input.query) {
        items = items.filter((item) => {
          const searchable = [
            item.metadata.title,
            item.metadata.description ?? "",
            item.metadata.tags.join(" "),
          ].join(" ").toLocaleLowerCase("en-US");
          return input.query.split(" ").every((term) => searchable.includes(term));
        });
      }
      items.sort((left, right) => {
        const byTitle = left.metadata.title.localeCompare(right.metadata.title, "en-US", {
          sensitivity: "base",
        });
        return byTitle || left.version.assetId.localeCompare(right.version.assetId);
      });

      const page = items.slice(offset, offset + input.limit);
      const nextOffset = offset + page.length;
      const nextCursor = nextOffset < items.length
        ? this.encodeCursor({
            version: 1,
            tenantScope: hash(principal.tenantId).slice(0, 24),
            filterFingerprint,
            generation,
            offset: nextOffset,
          })
        : null;
      const receipt = this.receipt({
        action: "discover",
        actor: principal,
        assetId: null,
        durationMs: this.elapsed(startedAt),
        operationId: this.readOperationId(principal, input.requestId, "discover"),
        outcome: "read",
        requestId: input.requestId,
        revision: null,
        versionId: null,
      });
      this.recordReceipt(receipt);
      return { items: page.map((item) => this.view(item, principal.role)), nextCursor, receipt };
    } catch (error) {
      this.recordFailure("discover", principal, fallbackRequestId, null, startedAt, error);
      throw error;
    }
  }

  audit(principal: CatalogPrincipal, limit = 100, requestId = crypto.randomUUID()): CatalogAuditResult {
    const startedAt = this.monotonicNow();
    try {
      this.authorize(principal, principal.tenantId, "audit");
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        throw new CatalogError("invalid_request", "limit must be an integer between 1 and 200.", 400);
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(requestId)) {
        throw new CatalogError("invalid_request", "requestId contains unsupported characters.", 400);
      }
      const receipts = this.repository.listReceipts(principal.tenantId, limit);
      const receipt = this.receipt({
        action: "audit",
        actor: principal,
        assetId: null,
        durationMs: this.elapsed(startedAt),
        operationId: this.readOperationId(principal, requestId, "audit"),
        outcome: "read",
        requestId,
        revision: null,
        versionId: null,
      });
      this.recordReceipt(receipt);
      return { receipts, receipt };
    } catch (error) {
      this.recordFailure("audit", principal, requestId, null, startedAt, error);
      throw error;
    }
  }

  private authorize(principal: CatalogPrincipal, requestedTenantId: string, action: CatalogAction) {
    if (principal.tenantId !== requestedTenantId) {
      throw new CatalogError(
        "tenant_scope_mismatch",
        "The request tenant does not match the authenticated tenant scope.",
        403,
      );
    }
    if (!PERMISSIONS[action].has(principal.role)) {
      throw new CatalogError("forbidden", `The current role cannot perform catalog.${action}.`, 403);
    }
  }

  private replay<T extends CatalogMutationResult>(
    principal: CatalogPrincipal,
    key: string,
    digest: string,
    requestId: string,
    startedAt: number,
  ): T | null {
    const previous = this.repository.getIdempotency<T>(principal.tenantId, key);
    if (!previous) return null;
    if (previous.digest !== digest) {
      throw new CatalogError(
        "idempotency_conflict",
        "The idempotency key was already used for a different catalog mutation.",
        409,
      );
    }
    const replayReceipt: CatalogReceipt = {
      ...previous.value.receipt,
      requestId,
      outcome: "replayed",
      occurredAt: this.now().toISOString(),
      durationMs: this.elapsed(startedAt),
      errorCode: null,
    };
    this.recordReceipt(replayReceipt);
    return { ...clone(previous.value), receipt: replayReceipt };
  }

  private view(item: CatalogItem, role: CatalogRole): CatalogItemView {
    const view: CatalogItemView = {
      schemaVersion: item.schemaVersion,
      version: clone(item.version),
      metadata: clone(item.metadata),
      lifecycleState: item.lifecycleState,
      revision: item.revision,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
    if (role === "owner" || role === "admin") {
      view.restrictedMetadata = clone(item.restrictedMetadata);
    }
    return view;
  }

  private encodeCursor(cursor: CursorPayload): string {
    return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  }

  private decodeCursor(
    encoded: string,
    tenantId: string,
    filterFingerprint: string,
    generation: number,
  ): number {
    try {
      const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<CursorPayload>;
      if (decoded.version !== 1
        || decoded.tenantScope !== hash(tenantId).slice(0, 24)
        || decoded.filterFingerprint !== filterFingerprint
        || !Number.isSafeInteger(decoded.offset)
        || (decoded.offset ?? -1) < 0
        || (decoded.offset ?? 10_001) > 10_000) {
        throw new Error("invalid cursor");
      }
      if (decoded.generation !== generation) {
        throw new CatalogError(
          "stale_cursor",
          "The catalog changed after this cursor was issued; restart discovery from the first page.",
          409,
        );
      }
      return decoded.offset as number;
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      throw new CatalogError("invalid_cursor", "The discovery cursor is invalid.", 400);
    }
  }

  private operationId(tenantId: string, key: string, digest: string): string {
    return hash(`${tenantId}\u0000${key}\u0000${digest}`).slice(0, 48);
  }

  private readOperationId(principal: CatalogPrincipal, requestId: string, action: CatalogAction): string {
    return hash(`${principal.tenantId}\u0000${principal.actorId}\u0000${action}\u0000${requestId}`).slice(0, 48);
  }

  private elapsed(startedAt: number): number {
    return Math.max(0, Math.round((this.monotonicNow() - startedAt) * 1_000) / 1_000);
  }

  private receipt(input: {
    action: CatalogAction;
    actor: CatalogPrincipal;
    assetId: string | null;
    durationMs: number;
    operationId: string;
    outcome: CatalogReceiptOutcome;
    requestId: string;
    revision: number | null;
    versionId: string | null;
    errorCode?: string | null;
  }): CatalogReceipt {
    return {
      schemaVersion: CATALOG_RECEIPT_SCHEMA_VERSION,
      operationId: input.operationId,
      requestId: input.requestId,
      tenantId: input.actor.tenantId,
      actorId: input.actor.actorId,
      action: input.action,
      outcome: input.outcome,
      occurredAt: this.now().toISOString(),
      durationMs: input.durationMs,
      reference: {
        assetId: input.assetId,
        versionId: input.versionId,
        revision: input.revision,
      },
      errorCode: input.errorCode ?? null,
    };
  }

  private recordReceipt(receipt: CatalogReceipt): void {
    this.repository.putReceipt(receipt);
    try {
      this.onReceipt?.(clone(receipt));
    } catch {
      // Delivery to an observer is best-effort: a logging failure must never
      // turn an already-applied catalog mutation into an apparent failure.
      console.error(JSON.stringify({
        event: "catalog.control_plane.observer_error",
        operationId: receipt.operationId,
        tenantId: receipt.tenantId,
      }));
    }
  }

  private recordFailure(
    action: CatalogAction,
    principal: CatalogPrincipal,
    requestId: string,
    assetId: string | null,
    startedAt: number,
    error: unknown,
  ): void {
    const catalogError = asCatalogError(error);
    const receipt = this.receipt({
      action,
      actor: principal,
      assetId,
      durationMs: this.elapsed(startedAt),
      operationId: this.readOperationId(principal, requestId, action),
      outcome: catalogError.status === 403 ? "denied" : "rejected",
      requestId,
      revision: null,
      versionId: null,
      errorCode: catalogError.code,
    });
    this.recordReceipt(receipt);
  }
}
