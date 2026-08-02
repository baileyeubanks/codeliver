import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Readable } from "node:stream";

import type { StorageRuntimeConfig } from "../storage/config";
import type { StorageAdapter, StorageReadiness } from "../storage/contracts";
import type {
  MalwareScanHook,
  MalwareScanResult,
  TrustedMalwareScanResult,
} from "../storage/malware";
import type {
  AppendUploadPartInput,
  AppendUploadPartResult,
  AppendPublicIntakeUploadPartInput,
  CreatePublicIntakeUploadSessionInput,
  CreateUploadSessionInput,
  CreateUploadSessionResult,
  UploadSession,
  UploadSessionEvent,
  UploadSessionState,
} from "./session";
import type { UploadSessionRepository } from "./session-repository";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { bigintToSafeNumber } from "../storage/config.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { createMalwareScanHook } from "../storage/malware.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { buildUploadWorkflowReadiness, type UploadWorkflowReadiness } from "../storage/release-readiness.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { buildPublicIntakeQuarantineObjectKey, buildVersionedObjectKey, hashStorageNamespace } from "../storage/object-key.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { createStorageRuntime } from "../storage/runtime.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { UploadOrchestrationError } from "./errors.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { FileUploadSessionRepository } from "./session-repository.ts";

const ACTIVE_UPLOAD_STATES = new Set<UploadSessionState>(["receiving", "verifying"]);
const QUOTA_STATES = new Set<UploadSessionState>([
  "receiving",
  "verifying",
  "quarantined",
  "committed",
  "rejected",
  "failed",
]);
const AUTHORITY_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UploadAuthorityContext {
  uploadId: string;
  projectId: string;
  folderId: string | null;
  authoritySessionId: string | null;
}

export interface PostCommitHook {
  onCommitted(session: UploadSession, signal?: AbortSignal): Promise<void>;
}

export interface UploadDiagnostics {
  storage: StorageReadiness;
  limits: {
    maxUploadBytes: string;
    maxChunkBytes: string;
    tenantQuotaBytes: string;
    maxConcurrentUploads: number;
    malwareScanTimeoutMs: number;
    derivativeHookTimeoutMs: number;
  };
  sessionControl: {
    ready: boolean;
    activeCount: number;
    quarantinedCount: number;
    attentionCount: number;
    allocatedBytes: string;
    inFlightBytes: string;
    quotaRemainingBytes: string;
    oldestQuarantineAt: string | null;
    error: string | null;
  };
  workflow: UploadWorkflowReadiness;
}

export interface UploadSessionReleaseReadiness {
  originalReady: boolean;
  scannerReady: boolean;
  derivativeState: UploadSession["derivatives"]["state"];
  signedDeliveryReady: false;
  failClosed: true;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSha256(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new UploadOrchestrationError(
      "UPLOAD_INVALID",
      "Expected object checksum must be a SHA-256 hex digest"
    );
  }
  return normalized;
}

function failClosedScanResult(
  value: MalwareScanResult,
  now: () => Date
): MalwareScanResult {
  if (
    value &&
    ["clean", "infected", "pending", "error"].includes(value.verdict) &&
    typeof value.engine === "string" &&
    value.engine.trim().length > 0 &&
    (value.signature === null || typeof value.signature === "string") &&
    typeof value.detail === "string" &&
    typeof value.scannedAt === "string"
  ) {
    return value;
  }
  return {
    verdict: "error",
    engine: "scanner-contract",
    signature: null,
    detail: "Malware scanner returned an invalid result; object remains quarantined",
    scannedAt: now().toISOString(),
  };
}

function requireText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new UploadOrchestrationError(
      "UPLOAD_INVALID",
      `${label} must be between 1 and ${maxLength} printable characters`
    );
  }
  return normalized;
}

function sessionsMatch(existing: UploadSession, input: {
  tenantKey: string;
  projectId: string;
  folderId: string | null;
  provider: StorageAdapter["kind"];
  filename: string;
  mimeType: string;
  size: number;
  version: number;
  expectedSha256: string | null;
}): boolean {
  return (
    existing.scopeKind !== "public-intake" &&
    existing.tenantKey === input.tenantKey &&
    existing.projectId === input.projectId &&
    existing.folderId === input.folderId &&
    existing.provider === input.provider &&
    existing.filename === input.filename &&
    existing.mimeType === input.mimeType &&
    existing.size === input.size &&
    existing.version === input.version &&
    existing.expectedSha256 === input.expectedSha256
  );
}

function publicIntakeSessionsMatch(existing: UploadSession, input: {
  formKeyHash: string;
  capabilityHash: string;
  provider: StorageAdapter["kind"];
  filename: string;
  mimeType: string;
  size: number;
  version: number;
  expectedSha256: string;
}): boolean {
  return (
    existing.scopeKind === "public-intake" &&
    existing.tenantKey === null &&
    existing.projectId === null &&
    existing.folderId === null &&
    existing.intakeFormKeyHash === input.formKeyHash &&
    existing.intakeCapabilityHash === input.capabilityHash &&
    existing.provider === input.provider &&
    existing.filename === input.filename &&
    existing.mimeType === input.mimeType &&
    existing.size === input.size &&
    existing.version === input.version &&
    existing.expectedSha256 === input.expectedSha256
  );
}

function intakeScopeKey(formKeyHash: string): string {
  return `public-intake:${formKeyHash}`;
}

function sessionAdmissionKey(session: UploadSession): string {
  return session.scopeKind === "public-intake"
    ? intakeScopeKey(session.intakeFormKeyHash!)
    : `project:${session.tenantKey!}`;
}

export class UploadOrchestrator {
  private readonly adapter: StorageAdapter;
  private readonly config: StorageRuntimeConfig;
  private readonly sessions: UploadSessionRepository;
  private readonly scanner: MalwareScanHook;
  private readonly postCommitHooks: PostCommitHook[];
  private readonly scannerReadiness: NonNullable<MalwareScanHook["readiness"]>;
  private readonly now: () => Date;

  constructor(input: {
    adapter: StorageAdapter;
    config: StorageRuntimeConfig;
    sessions: UploadSessionRepository;
    scanner: MalwareScanHook;
    postCommitHooks?: PostCommitHook[];
    now?: () => Date;
  }) {
    this.adapter = input.adapter;
    this.config = input.config;
    this.sessions = input.sessions;
    this.scanner = input.scanner;
    this.postCommitHooks = input.postCommitHooks ?? [];
    this.scannerReadiness = input.scanner.readiness ?? {
      mode: "configured-hook",
      configured: true,
      automaticReleaseReady: true,
      message: "Malware scanner hook is configured",
    };
    this.now = input.now ?? (() => new Date());
  }

  async diagnostics(tenantId: string): Promise<UploadDiagnostics> {
    const storage = await this.adapter.diagnose();
    let sessionControl: UploadDiagnostics["sessionControl"];
    try {
      const tenantKey = hashStorageNamespace(tenantId);
      const sessions = (await this.sessions.list()).filter(
        (session) =>
          session.scopeKind !== "public-intake" && session.tenantKey === tenantKey
      );
      const allocatedBytes = sessions
        .filter((session) => QUOTA_STATES.has(session.state))
        .reduce((total, session) => total + BigInt(session.size), 0n);
      const inFlightBytes = sessions
        .filter((session) => session.state !== "committed" && QUOTA_STATES.has(session.state))
        .reduce((total, session) => total + BigInt(session.size - session.offset), 0n);
      const quarantined = sessions.filter((session) => session.state === "quarantined");
      const quotaRemaining = this.config.tenantQuotaBytes - allocatedBytes;
      sessionControl = {
        ready: true,
        activeCount: sessions.filter((session) => ACTIVE_UPLOAD_STATES.has(session.state)).length,
        quarantinedCount: quarantined.length,
        attentionCount: sessions.filter((session) =>
          ["quarantined", "rejected", "failed"].includes(session.state)
        ).length,
        allocatedBytes: allocatedBytes.toString(),
        inFlightBytes: inFlightBytes.toString(),
        quotaRemainingBytes: (quotaRemaining > 0n ? quotaRemaining : 0n).toString(),
        oldestQuarantineAt:
          quarantined.map((session) => session.updatedAt).sort()[0] ?? null,
        error: null,
      };
    } catch (error) {
      storage.readyForWrites = false;
      storage.checks.push({
        key: "session-control",
        status: "fail",
        message: "Upload session control is unavailable",
      });
      sessionControl = {
        ready: false,
        activeCount: 0,
        quarantinedCount: 0,
        attentionCount: 0,
        allocatedBytes: "0",
        inFlightBytes: "0",
        quotaRemainingBytes: "0",
        oldestQuarantineAt: null,
        error: error instanceof Error ? error.message : "Session control failed",
      };
    }
    return {
      storage,
      limits: {
        maxUploadBytes: this.config.maxUploadBytes.toString(),
        maxChunkBytes: this.config.maxChunkBytes.toString(),
        tenantQuotaBytes: this.config.tenantQuotaBytes.toString(),
        maxConcurrentUploads: this.config.maxConcurrentUploads,
        malwareScanTimeoutMs: this.config.malwareScanTimeoutMs,
        derivativeHookTimeoutMs: this.config.derivativeHookTimeoutMs,
      },
      sessionControl,
      workflow: buildUploadWorkflowReadiness({
        storage,
        scanner: this.scannerReadiness,
        derivativeHooksConfigured: this.postCommitHooks.length > 0,
      }),
    };
  }

  releaseReadiness(session: UploadSession): UploadSessionReleaseReadiness {
    if (session.scopeKind === "public-intake") {
      return {
        originalReady: false,
        scannerReady: session.scan?.verdict === "clean",
        derivativeState: "blocked",
        signedDeliveryReady: false,
        failClosed: true,
      };
    }
    const originalReady = Boolean(
      session.state === "committed" &&
        session.scan?.verdict === "clean" &&
        session.receipt &&
        session.computedSha256 &&
        session.receipt.sha256 === session.computedSha256
    );
    return {
      originalReady,
      scannerReady: originalReady && session.scan?.verdict === "clean",
      derivativeState: session.derivatives.state,
      signedDeliveryReady: false,
      failClosed: true,
    };
  }

  private async event(
    session: UploadSession,
    event: string,
    detail?: UploadSessionEvent["detail"]
  ): Promise<void> {
    await this.sessions.appendEvent(session.id, {
      at: this.now().toISOString(),
      event,
      state: session.state,
      offset: session.offset,
      revision: session.revision,
      detail,
    });
  }

  private async save(session: UploadSession): Promise<void> {
    const expectedRevision = session.revision;
    const next: UploadSession = {
      ...session,
      revision: expectedRevision + 1,
      updatedAt: this.now().toISOString(),
    };
    await this.sessions.save(next, expectedRevision);
    Object.assign(session, next);
  }

  private assertTenant(session: UploadSession, tenantId: string): void {
    if (
      session.scopeKind === "public-intake" ||
      session.tenantKey !== hashStorageNamespace(tenantId)
    ) {
      throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
    }
  }

  private assertIntakeCapability(session: UploadSession, capabilityHash: string): void {
    const expected = session.intakeCapabilityHash;
    if (
      session.scopeKind !== "public-intake" ||
      typeof expected !== "string" ||
      expected.length !== capabilityHash.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(capabilityHash))
    ) {
      throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
    }
  }

  private async admit(admissionKey: string, size: number): Promise<void> {
    const readiness = await this.adapter.diagnose();
    if (!readiness.readyForWrites) {
      throw new UploadOrchestrationError(
        "UPLOAD_BACKPRESSURE",
        readiness.checks
          .filter((check) => check.status === "fail")
          .map((check) => check.message)
          .join("; ") || "Storage is not ready",
        true
      );
    }

    if (BigInt(size) > this.config.maxUploadBytes) {
      throw new UploadOrchestrationError("UPLOAD_QUOTA", "Upload exceeds the size limit");
    }
    const allSessions = await this.sessions.list();
    const sessions = allSessions.filter(
      (session) => sessionAdmissionKey(session) === admissionKey
    );
    const available = readiness.capacity?.availableBytes;
    const reservedInFlightBytes = allSessions
      .filter(
        (session) => session.state !== "committed" && QUOTA_STATES.has(session.state)
      )
      .reduce(
        (total, session) => total + BigInt(session.size - session.offset),
        0n
      );
    if (
      available !== null &&
      available !== undefined &&
      BigInt(available) - this.config.reservedBytes - reservedInFlightBytes <
        BigInt(size)
    ) {
      throw new UploadOrchestrationError(
        "UPLOAD_BACKPRESSURE",
        "Storage capacity is below the reserved upload admission threshold",
        true
      );
    }
    const activeCount = sessions.filter((session) =>
      ACTIVE_UPLOAD_STATES.has(session.state)
    ).length;
    if (activeCount >= this.config.maxConcurrentUploads) {
      throw new UploadOrchestrationError(
        "UPLOAD_BACKPRESSURE",
        "Tenant concurrent-upload limit reached",
        true
      );
    }

    const allocatedBytes = sessions
      .filter((session) => QUOTA_STATES.has(session.state))
      .reduce((total, session) => total + BigInt(session.size), 0n);
    if (allocatedBytes + BigInt(size) > this.config.tenantQuotaBytes) {
      throw new UploadOrchestrationError("UPLOAD_QUOTA", "Tenant storage quota exceeded");
    }
  }

  async createSession(input: CreateUploadSessionInput): Promise<CreateUploadSessionResult> {
    const tenantKey = hashStorageNamespace(input.tenantId);
    const projectId = requireText(input.projectId, "Project id", 256);
    const filename = requireText(input.filename, "Filename", 512);
    const mimeType = requireText(input.mimeType, "MIME type", 256);
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 256);
    const folderId = input.folderId
      ? requireText(input.folderId, "Folder id", 256)
      : null;
    const version = input.version ?? 1;
    const expectedSha256 = normalizeSha256(input.expectedSha256);
    if (!Number.isSafeInteger(input.size) || input.size <= 0) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload size must be positive");
    }
    if (!Number.isSafeInteger(version) || version <= 0) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Version must be positive");
    }

    const idempotencyKeyHash = sha256(`${tenantKey}\u0000${idempotencyKey}`);
    const matchInput = {
      tenantKey,
      projectId,
      folderId,
      provider: this.adapter.kind,
      filename,
      mimeType,
      size: input.size,
      version,
      expectedSha256,
    };
    const createUnderLock = async (): Promise<CreateUploadSessionResult> => {
      const existing = await this.sessions.findByIdempotencyHash(idempotencyKeyHash);
      if (existing) {
        if (!sessionsMatch(existing, matchInput)) {
          throw new UploadOrchestrationError(
            "UPLOAD_CONFLICT",
            "Idempotency key is already bound to different upload metadata"
          );
        }
        return { session: existing, resumed: true };
      }

      await this.admit(`project:${tenantKey}`, input.size);
      const uploadId = randomUUID();
      const providerHandle = await this.adapter.beginMultipart(uploadId);
      const createdAt = this.now();
      const session: UploadSession = {
        schemaVersion: 1,
        id: uploadId,
        scopeKind: "project",
        tenantKey,
        projectId,
        folderId,
        intakeFormKeyHash: null,
        intakeCapabilityHash: null,
        idempotencyKeyHash,
        filename,
        mimeType,
        size: input.size,
        offset: 0,
        version,
        provider: this.adapter.kind,
        providerHandle,
        state: "receiving",
        expectedSha256,
        computedSha256: null,
        objectKey: null,
        receipt: null,
        scan: null,
        partCount: 0,
        lastPartSha256: null,
        lastPartOffset: null,
        mediaIngestAuthoritySessionId: null,
        assetId: null,
        catalog: {
          state: "pending",
          attempts: 0,
          lastError: null,
          updatedAt: createdAt.toISOString(),
        },
        derivatives: {
          state: this.postCommitHooks.length > 0 ? "pending" : "blocked",
          attempts: 0,
          lastError:
            this.postCommitHooks.length > 0
              ? null
              : "No durable derivative enqueue hook is configured",
          updatedAt: createdAt.toISOString(),
        },
        recovery: {
          attempts: 0,
          lastAction: "none",
          lastRecoveredAt: null,
        },
        legalHold: false,
        revision: 1,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + this.config.sessionTtlMs).toISOString(),
        lastError: null,
      };

      let sessionPersisted = false;
      try {
        const result = await this.sessions.createOrGet(session);
        if (!result.created) {
          await this.adapter.abortMultipart(providerHandle);
          if (!sessionsMatch(result.session, matchInput)) {
            throw new UploadOrchestrationError(
              "UPLOAD_CONFLICT",
              "Idempotency key raced with different upload metadata"
            );
          }
          return { session: result.session, resumed: true };
        }
        sessionPersisted = true;
        await this.event(session, "session-created", {
          provider: session.provider,
          size: session.size,
        });
        return { session, resumed: false };
      } catch (error) {
        if (!sessionPersisted) {
          await this.adapter.abortMultipart(providerHandle).catch(() => undefined);
        }
        throw error;
      }
    };
    return this.sessions.withAdmissionLock(() =>
      this.sessions.withTenantLock(tenantKey, createUnderLock)
    );
  }

  async createPublicIntakeSession(
    input: CreatePublicIntakeUploadSessionInput
  ): Promise<CreateUploadSessionResult> {
    const formKey = requireText(input.formKey, "Intake form key", 68).toLowerCase();
    if (!/^ifm_[0-9a-f]{64}$/.test(formKey)) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Intake form key is invalid");
    }
    const formKeyHash = sha256(formKey);
    const capabilityHash = input.capabilityHash.trim().toLowerCase();
    if (!/^sha256:[0-9a-f]{64}$/.test(capabilityHash)) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Intake capability is invalid");
    }
    const filename = requireText(input.filename, "Filename", 512);
    const mimeType = requireText(input.mimeType, "MIME type", 256);
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 256);
    const version = input.version ?? 1;
    const expectedSha256 = normalizeSha256(input.expectedSha256);
    if (!expectedSha256) {
      throw new UploadOrchestrationError(
        "UPLOAD_INVALID",
        "Public intake requires a full-source SHA-256 checksum"
      );
    }
    if (!Number.isSafeInteger(input.size) || input.size <= 0) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload size must be positive");
    }
    if (!Number.isSafeInteger(version) || version <= 0) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Version must be positive");
    }

    const idempotencyKeyHash = sha256(
      `public-intake\u0000${formKeyHash}\u0000${idempotencyKey}`
    );
    const matchInput = {
      formKeyHash,
      capabilityHash,
      provider: this.adapter.kind,
      filename,
      mimeType,
      size: input.size,
      version,
      expectedSha256,
    };
    const createUnderLock = async (): Promise<CreateUploadSessionResult> => {
      const existing = await this.sessions.findByIdempotencyHash(idempotencyKeyHash);
      if (existing) {
        if (!publicIntakeSessionsMatch(existing, matchInput)) {
          throw new UploadOrchestrationError(
            "UPLOAD_CONFLICT",
            "Idempotency key is already bound to different intake upload metadata"
          );
        }
        return { session: existing, resumed: true };
      }

      await this.admit(intakeScopeKey(formKeyHash), input.size);
      const uploadId = randomUUID();
      const providerHandle = await this.adapter.beginMultipart(uploadId);
      const createdAt = this.now();
      const session: UploadSession = {
        schemaVersion: 1,
        id: uploadId,
        scopeKind: "public-intake",
        tenantKey: null,
        projectId: null,
        folderId: null,
        intakeFormKeyHash: formKeyHash,
        intakeCapabilityHash: capabilityHash,
        idempotencyKeyHash,
        filename,
        mimeType,
        size: input.size,
        offset: 0,
        version,
        provider: this.adapter.kind,
        providerHandle,
        state: "receiving",
        expectedSha256,
        computedSha256: null,
        objectKey: null,
        receipt: null,
        scan: null,
        partCount: 0,
        lastPartSha256: null,
        lastPartOffset: null,
        mediaIngestAuthoritySessionId: null,
        assetId: null,
        catalog: {
          state: "pending",
          attempts: 0,
          lastError: "Public intake uploads cannot enter the project asset catalog",
          updatedAt: createdAt.toISOString(),
        },
        derivatives: {
          state: "blocked",
          attempts: 0,
          lastError: "Public intake objects remain in the intake quarantine namespace",
          updatedAt: createdAt.toISOString(),
        },
        recovery: {
          attempts: 0,
          lastAction: "none",
          lastRecoveredAt: null,
        },
        legalHold: false,
        revision: 1,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + this.config.sessionTtlMs).toISOString(),
        lastError: null,
      };

      let sessionPersisted = false;
      try {
        const result = await this.sessions.createOrGet(session);
        if (!result.created) {
          await this.adapter.abortMultipart(providerHandle);
          if (!publicIntakeSessionsMatch(result.session, matchInput)) {
            throw new UploadOrchestrationError(
              "UPLOAD_CONFLICT",
              "Intake upload creation raced with different metadata"
            );
          }
          return { session: result.session, resumed: true };
        }
        sessionPersisted = true;
        await this.event(session, "public-intake-session-created", {
          provider: session.provider,
          size: session.size,
        });
        return { session, resumed: false };
      } catch (error) {
        if (!sessionPersisted) {
          await this.adapter.abortMultipart(providerHandle).catch(() => undefined);
        }
        throw error;
      }
    };

    return this.sessions.withAdmissionLock(() =>
      this.sessions.withIntakeLock(formKeyHash, createUnderLock)
    );
  }

  private objectKeyFor(session: UploadSession): string {
    if (session.scopeKind === "public-intake") {
      return buildPublicIntakeQuarantineObjectKey({
        formKeyHash: session.intakeFormKeyHash!,
        objectId: session.id,
        version: session.version,
        filename: session.filename,
      });
    }
    return buildVersionedObjectKey({
      tenantId: session.tenantKey!,
      projectId: session.projectId!,
      objectId: session.id,
      version: session.version,
      filename: session.filename,
    });
  }

  private async scanVerifiedBytes(
    session: UploadSession,
    sha256: string,
    openStream: () => Promise<Readable>
  ): Promise<MalwareScanResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<MalwareScanResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({
          verdict: "error",
          engine: "scanner-timeout",
          signature: null,
          detail: `Malware scan exceeded ${this.config.malwareScanTimeoutMs}ms`,
          scannedAt: this.now().toISOString(),
        });
      }, this.config.malwareScanTimeoutMs);
    });

    try {
      return await Promise.race([
        this.scanner.scan({
          uploadId: session.id,
          provider: session.provider,
          filename: session.filename,
          mimeType: session.mimeType,
          size: session.size,
          sha256,
          signal: controller.signal,
          openStream,
        }),
        timeout,
      ]);
    } catch (error) {
      controller.abort();
      return {
        verdict: "error",
        engine: "scanner-hook",
        signature: null,
        detail: error instanceof Error ? error.message : "Malware scanner failed",
        scannedAt: this.now().toISOString(),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async invokePostCommitHook(
    hook: PostCommitHook,
    session: UploadSession
  ): Promise<void> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new Error(
            `Derivative enqueue exceeded ${this.config.derivativeHookTimeoutMs}ms`
          )
        );
      }, this.config.derivativeHookTimeoutMs);
    });
    try {
      await Promise.race([hook.onCommitted(session, controller.signal), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
  }

  private async applyScanResult(
    session: UploadSession,
    scan: MalwareScanResult
  ): Promise<UploadSession> {
    scan = failClosedScanResult(scan, this.now);
    session.scan = scan;
    if (scan.verdict === "pending" || scan.verdict === "error") {
      if (session.scopeKind === "public-intake") {
        return this.placePublicIntakeQuarantineLocked(session);
      }
      session.state = "quarantined";
      await this.save(session);
      await this.event(session, "object-quarantined", { verdict: scan.verdict });
      return session;
    }
    if (scan.verdict === "infected") {
      session.state = "rejected";
      session.lastError = {
        code: "MALWARE_DETECTED",
        message: scan.detail,
        at: this.now().toISOString(),
      };
      await this.save(session);
      await this.event(session, "object-rejected", { verdict: scan.verdict });
      return session;
    }

    if (!session.computedSha256) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Verified checksum is missing before placement"
      );
    }
    const objectKey = this.objectKeyFor(session);
    session.objectKey = objectKey;
    session.derivatives = {
      state:
        session.scopeKind !== "public-intake" && this.postCommitHooks.length > 0
          ? "pending"
          : "blocked",
      attempts: session.derivatives.attempts,
      lastError:
        session.scopeKind === "public-intake"
          ? "Public intake objects remain in the intake quarantine namespace"
          : this.postCommitHooks.length > 0
          ? null
          : "No durable derivative enqueue hook is configured",
      updatedAt: this.now().toISOString(),
    };
    await this.save(session);
    await this.event(session, "placement-prepared", {
      objectKey,
      sha256: session.computedSha256,
    });
    return this.commitPreparedLocked(session, true);
  }

  private async placePublicIntakeQuarantineLocked(
    session: UploadSession
  ): Promise<UploadSession> {
    if (session.scopeKind !== "public-intake" || !session.computedSha256) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Public intake quarantine placement requires verified bytes"
      );
    }
    const objectKey = this.objectKeyFor(session);
    session.objectKey = objectKey;
    session.derivatives = {
      state: "blocked",
      attempts: session.derivatives.attempts,
      lastError: "Public intake objects remain in the intake quarantine namespace",
      updatedAt: this.now().toISOString(),
    };
    await this.save(session);
    await this.event(session, "public-intake-quarantine-placement-prepared", {
      objectKey,
      sha256: session.computedSha256,
    });

    const input = {
      handle: session.providerHandle,
      objectKey,
      size: session.size,
      sha256: session.computedSha256,
    };
    const reconciliation = await this.adapter.reconcileMultipartCommit(input);
    session.receipt =
      reconciliation.receipt ?? (await this.adapter.commitMultipart(input));
    session.state = "quarantined";
    await this.save(session);
    await this.event(session, "public-intake-object-quarantined", {
      objectKey,
      sha256: session.computedSha256,
      verdict: session.scan?.verdict ?? "pending",
    });
    return session;
  }

  private async runDerivativeHooksLocked(
    session: UploadSession,
    force = false
  ): Promise<void> {
    if (session.scopeKind === "public-intake") return;
    if (this.postCommitHooks.length === 0 || session.derivatives.state === "ready") {
      return;
    }
    if (session.derivatives.state === "error" && !force) return;

    session.derivatives = {
      state: "pending",
      attempts: session.derivatives.attempts + 1,
      lastError: null,
      updatedAt: this.now().toISOString(),
    };
    await this.save(session);
    await this.event(session, "derivative-enqueue-started", {
      attempt: session.derivatives.attempts,
    });

    try {
      for (const hook of this.postCommitHooks) {
        await this.invokePostCommitHook(hook, session);
      }
      session.derivatives = {
        state: "ready",
        attempts: session.derivatives.attempts,
        lastError: null,
        updatedAt: this.now().toISOString(),
      };
      await this.save(session);
      await this.event(session, "derivative-enqueue-ready");
    } catch (error) {
      session.derivatives = {
        state: "error",
        attempts: session.derivatives.attempts,
        lastError:
          error instanceof Error ? error.message : "Derivative enqueue failed",
        updatedAt: this.now().toISOString(),
      };
      await this.save(session);
      await this.event(session, "derivative-enqueue-failed", {
        message: session.derivatives.lastError,
      });
    }
  }

  private async commitPreparedLocked(
    session: UploadSession,
    recoverFirst: boolean
  ): Promise<UploadSession> {
    if (
      session.scan?.verdict !== "clean" ||
      !session.computedSha256 ||
      !session.objectKey
    ) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Placement requires a durable clean scan, checksum, and object key"
      );
    }
    const input = {
      handle: session.providerHandle,
      objectKey: session.objectKey,
      size: session.size,
      sha256: session.computedSha256,
    };
    let receipt = null;
    let placementRecovered = false;
    if (recoverFirst) {
      const reconciliation = await this.adapter.reconcileMultipartCommit(input);
      receipt = reconciliation.receipt;
      if (receipt) {
        placementRecovered = true;
        session.recovery = {
          attempts: session.recovery.attempts + 1,
          lastAction: "placement-recovered",
          lastRecoveredAt: this.now().toISOString(),
        };
      }
    }
    receipt ??= await this.adapter.commitMultipart(input);
    session.receipt = receipt;
    session.state = "committed";
    await this.save(session);
    await this.event(session, placementRecovered ? "object-commit-reconciled" : "object-committed", {
      objectKey: session.objectKey,
      sha256: session.computedSha256,
    });
    await this.runDerivativeHooksLocked(session);
    return session;
  }

  private async finalizeLocked(session: UploadSession): Promise<UploadSession> {
    if (session.state !== "verifying") {
      session.state = "verifying";
      await this.save(session);
      await this.event(session, "verification-started");
    }

    const inspection = await this.adapter.inspectMultipart(session.providerHandle);
    session.computedSha256 = inspection.sha256;
    if (inspection.size !== session.size) {
      session.state = "failed";
      session.lastError = {
        code: "SIZE_MISMATCH",
        message: `Expected ${session.size} bytes, found ${inspection.size}`,
        at: this.now().toISOString(),
      };
      await this.save(session);
      throw new UploadOrchestrationError("UPLOAD_STATE", session.lastError.message);
    }
    if (session.expectedSha256 && session.expectedSha256 !== inspection.sha256) {
      session.state = "rejected";
      session.lastError = {
        code: "CHECKSUM_MISMATCH",
        message: "Object checksum did not match the declared SHA-256",
        at: this.now().toISOString(),
      };
      await this.save(session);
      await this.event(session, "object-rejected", { reason: "checksum" });
      throw new UploadOrchestrationError("UPLOAD_CHECKSUM", session.lastError.message);
    }
    await this.save(session);
    await this.event(session, "object-checksum-verified", {
      sha256: inspection.sha256,
      size: inspection.size,
    });

    const scan = await this.scanVerifiedBytes(
      session,
      inspection.sha256,
      () => this.adapter.openMultipartReadStream(session.providerHandle)
    );
    return this.applyScanResult(session, scan);
  }

  private async recordRecoveryLocked(
    session: UploadSession,
    action: UploadSession["recovery"]["lastAction"],
    event: string,
    detail?: UploadSessionEvent["detail"]
  ): Promise<void> {
    session.recovery = {
      attempts: session.recovery.attempts + 1,
      lastAction: action,
      lastRecoveredAt: this.now().toISOString(),
    };
    await this.save(session);
    await this.event(session, event, detail);
  }

  private async failRecoveryLocked(
    session: UploadSession,
    error: unknown
  ): Promise<never> {
    const message =
      error instanceof Error ? error.message : "Upload recovery could not prove durable bytes";
    session.state = "failed";
    session.lastError = {
      code: "RECOVERY_FAILED",
      message,
      at: this.now().toISOString(),
    };
    await this.recordRecoveryLocked(
      session,
      "failed-closed",
      "recovery-failed-closed",
      { message }
    );
    throw new UploadOrchestrationError(
      "UPLOAD_STATE",
      "Upload recovery failed closed; durable bytes require operator review"
    );
  }

  private async reconcileStagingLocked(session: UploadSession): Promise<void> {
    try {
      const reconciliation = await this.adapter.reconcileMultipart(
        session.providerHandle,
        session.offset
      );
      if (reconciliation.action === "rolled-back") {
        await this.recordRecoveryLocked(
          session,
          "multipart-rolled-back",
          "multipart-rolled-back",
          {
            committedOffset: reconciliation.committedOffset,
            observedOffset: reconciliation.observedOffset,
          }
        );
      }
    } catch (error) {
      await this.failRecoveryLocked(session, error);
    }
  }

  private async recoverPlacedCandidateLocked(
    session: UploadSession
  ): Promise<UploadSession | null> {
    const objectKey = this.objectKeyFor(session);
    const inspection = await this.adapter.inspectStoredObject(objectKey);
    if (!inspection) return null;
    if (
      inspection.size !== session.size ||
      (session.expectedSha256 && inspection.sha256 !== session.expectedSha256)
    ) {
      return this.failRecoveryLocked(
        session,
        new Error("Recovered placement candidate failed size or checksum verification")
      );
    }

    session.computedSha256 = inspection.sha256;
    session.objectKey = objectKey;
    await this.recordRecoveryLocked(
      session,
      "verification-resumed",
      "placed-candidate-discovered",
      { objectKey, sha256: inspection.sha256 }
    );

    const scan = await this.scanVerifiedBytes(
      session,
      inspection.sha256,
      () => this.adapter.openStoredObjectReadStream(objectKey)
    );
    return this.applyScanResult(session, scan);
  }

  private async recoverLocked(session: UploadSession): Promise<UploadSession> {
    if (session.provider !== this.adapter.kind) {
      return this.failRecoveryLocked(
        session,
        new Error("Configured provider no longer matches the durable upload session")
      );
    }
    if (session.state === "committed") {
      await this.runDerivativeHooksLocked(session);
      return session;
    }
    if (["aborted", "rejected", "failed"].includes(session.state)) return session;

    if (session.state === "receiving") {
      await this.reconcileStagingLocked(session);
      if (session.offset < session.size) return session;
      await this.recordRecoveryLocked(
        session,
        "verification-resumed",
        "verification-recovered"
      );
      return this.finalizeLocked(session);
    }

    if (session.state === "quarantined") {
      if (session.objectKey && session.computedSha256) {
        const placed = await this.adapter.inspectStoredObject(session.objectKey);
        if (placed) {
          if (
            placed.size !== session.size ||
            placed.sha256 !== session.computedSha256
          ) {
            return this.failRecoveryLocked(
              session,
              new Error("Quarantined placement candidate no longer matches durable evidence")
            );
          }
          return session;
        }
      }
      await this.reconcileStagingLocked(session);
      return session;
    }

    if (
      session.state === "verifying" &&
      session.scan?.verdict === "clean" &&
      session.computedSha256 &&
      session.objectKey
    ) {
      try {
        const reconciliation = await this.adapter.reconcileMultipartCommit({
          handle: session.providerHandle,
          objectKey: session.objectKey,
          size: session.size,
          sha256: session.computedSha256,
        });
        if (reconciliation.receipt) {
          session.receipt = reconciliation.receipt;
          session.state = "committed";
          await this.recordRecoveryLocked(
            session,
            "placement-recovered",
            "object-commit-reconciled",
            { objectKey: session.objectKey }
          );
          await this.runDerivativeHooksLocked(session);
          return session;
        }
        await this.reconcileStagingLocked(session);
        await this.recordRecoveryLocked(
          session,
          "verification-resumed",
          "placement-resumed"
        );
        return this.commitPreparedLocked(session, false);
      } catch (error) {
        if (session.recovery.lastAction === "failed-closed") throw error;
        return this.failRecoveryLocked(session, error);
      }
    }

    if (session.state === "verifying") {
      const placed = await this.recoverPlacedCandidateLocked(session);
      if (placed) return placed;
    }
    await this.reconcileStagingLocked(session);
    await this.recordRecoveryLocked(
      session,
      "verification-resumed",
      "verification-recovered"
    );
    return this.finalizeLocked(session);
  }

  private async appendPartAuthorized(
    input: Omit<AppendUploadPartInput, "tenantId"> & { maxChunkBytes?: number },
    authorize: (session: UploadSession) => void
  ): Promise<AppendUploadPartResult> {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload offset is invalid");
    }
    if (
      input.maxChunkBytes !== undefined &&
      (!Number.isSafeInteger(input.maxChunkBytes) || input.maxChunkBytes <= 0)
    ) {
      throw new UploadOrchestrationError(
        "UPLOAD_INVALID",
        "Upload chunk limit is invalid"
      );
    }

    return this.sessions.withLock(input.uploadId, async () => {
      const durable = await this.sessions.get(input.uploadId);
      if (!durable) {
        throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
      }
      authorize(durable);
      const session = await this.recoverLocked(durable);
      if (session.state !== "receiving") {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          `Upload cannot accept bytes while ${session.state}`
        );
      }
      if (input.offset !== session.offset) {
        throw new UploadOrchestrationError(
          "UPLOAD_OFFSET",
          `Offset mismatch: expected ${session.offset}, got ${input.offset}`,
          true
        );
      }

      const durableOffset = session.offset;
      const receipt = await this.adapter.appendMultipart({
        handle: session.providerHandle,
        offset: input.offset,
        chunks: input.chunks,
        maxBytes:
          input.maxChunkBytes ??
          bigintToSafeNumber(this.config.maxChunkBytes, "Chunk limit"),
        expectedSize: session.size,
        expectedPartSha256: input.expectedPartSha256,
      });
      session.offset = receipt.offset;
      session.partCount += 1;
      session.lastPartSha256 = receipt.sha256;
      session.lastPartOffset = durableOffset;
      try {
        await this.save(session);
      } catch (error) {
        await this.adapter
          .reconcileMultipart(session.providerHandle, durableOffset)
          .catch(() => undefined);
        throw error;
      }
      await this.event(session, "part-accepted", {
        bytes: receipt.bytesWritten,
        sha256: receipt.sha256,
      });

      if (session.offset === session.size) {
        const finalized = await this.finalizeLocked(session);
        return { session: finalized, complete: true };
      }
      return { session, complete: false };
    });
  }

  async appendPart(input: AppendUploadPartInput): Promise<AppendUploadPartResult> {
    return this.appendPartAuthorized(input, (session) =>
      this.assertTenant(session, input.tenantId)
    );
  }

  async appendPublicIntakePart(
    input: AppendPublicIntakeUploadPartInput
  ): Promise<AppendUploadPartResult> {
    return this.appendPartAuthorized(input, (session) =>
      this.assertIntakeCapability(session, input.capabilityHash)
    );
  }

  async getSession(uploadId: string, tenantId: string): Promise<UploadSession | null> {
    const session = await this.sessions.get(uploadId);
    if (!session) return null;
    this.assertTenant(session, tenantId);
    return session;
  }

  async getPublicIntakeSession(
    uploadId: string,
    capabilityHash: string
  ): Promise<UploadSession | null> {
    const session = await this.sessions.get(uploadId);
    if (!session) return null;
    this.assertIntakeCapability(session, capabilityHash);
    return session;
  }

  async getAuthorityContext(
    uploadId: string
  ): Promise<UploadAuthorityContext | null> {
    const session = await this.sessions.get(uploadId);
    if (!session || session.scopeKind === "public-intake") return null;
    return {
      uploadId: session.id,
      projectId: session.projectId!,
      folderId: session.folderId,
      authoritySessionId: session.mediaIngestAuthoritySessionId ?? null,
    };
  }

  async bindMediaIngestAuthority(
    uploadId: string,
    tenantId: string,
    authoritySessionId: string
  ): Promise<UploadSession> {
    const normalizedAuthorityId = authoritySessionId.trim().toLowerCase();
    if (!AUTHORITY_SESSION_ID_PATTERN.test(normalizedAuthorityId)) {
      throw new UploadOrchestrationError(
        "UPLOAD_INVALID",
        "Media ingest authority binding is invalid"
      );
    }

    return this.sessions.withLock(uploadId, async () => {
      const session = await this.sessions.get(uploadId);
      if (!session) {
        throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
      }
      this.assertTenant(session, tenantId);
      if (
        session.mediaIngestAuthoritySessionId &&
        session.mediaIngestAuthoritySessionId !== normalizedAuthorityId
      ) {
        throw new UploadOrchestrationError(
          "UPLOAD_CONFLICT",
          "Upload authority is already bound"
        );
      }
      if (session.mediaIngestAuthoritySessionId === normalizedAuthorityId) {
        return session;
      }
      session.mediaIngestAuthoritySessionId = normalizedAuthorityId;
      await this.save(session);
      await this.event(session, "media-ingest-authority-bound");
      return session;
    });
  }

  async recoverSession(uploadId: string, tenantId: string): Promise<UploadSession | null> {
    return this.sessions.withLock(uploadId, async () => {
      const session = await this.sessions.get(uploadId);
      if (!session) return null;
      this.assertTenant(session, tenantId);
      return this.recoverLocked(session);
    });
  }

  async recoverPublicIntakeSession(
    uploadId: string,
    capabilityHash: string
  ): Promise<UploadSession | null> {
    return this.sessions.withLock(uploadId, async () => {
      const session = await this.sessions.get(uploadId);
      if (!session) return null;
      this.assertIntakeCapability(session, capabilityHash);
      return this.recoverLocked(session);
    });
  }

  async applyTrustedScanResult(
    uploadId: string,
    tenantId: string,
    scan: TrustedMalwareScanResult
  ): Promise<UploadSession> {
    return this.sessions.withLock(uploadId, async () => {
      const durable = await this.sessions.get(uploadId);
      if (!durable) {
        throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
      }
      this.assertTenant(durable, tenantId);
      const session = await this.recoverLocked(durable);
      if (session.state !== "quarantined") {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Only quarantined uploads can accept a scan result"
        );
      }
      if (
        !session.computedSha256 ||
        typeof scan.subjectSha256 !== "string" ||
        !/^[0-9a-f]{64}$/i.test(scan.subjectSha256) ||
        scan.subjectSha256.toLowerCase() !== session.computedSha256 ||
        !["clean", "infected"].includes(scan.verdict) ||
        typeof scan.engine !== "string" ||
        !scan.engine.trim() ||
        ["unconfigured", "local-demo-policy"].includes(scan.engine)
      ) {
        throw new UploadOrchestrationError(
          "UPLOAD_INVALID",
          "Trusted scan result is not bound to this verified object"
        );
      }
      return this.applyScanResult(session, scan);
    });
  }

  async retryDerivatives(
    uploadId: string,
    tenantId: string
  ): Promise<UploadSession> {
    return this.sessions.withLock(uploadId, async () => {
      const durable = await this.sessions.get(uploadId);
      if (!durable) {
        throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
      }
      this.assertTenant(durable, tenantId);
      const session = await this.recoverLocked(durable);
      if (session.state !== "committed") {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Derivative retry requires a committed original"
        );
      }
      if (!["error", "pending"].includes(session.derivatives.state)) {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Derivative enqueue is not retryable in its current state"
        );
      }
      await this.runDerivativeHooksLocked(session, true);
      return session;
    });
  }

  async attachAsset(uploadId: string, tenantId: string, assetId: string): Promise<void> {
    await this.sessions.withLock(uploadId, async () => {
      const session = await this.sessions.get(uploadId);
      if (!session) {
        throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
      }
      this.assertTenant(session, tenantId);
      if (session.state !== "committed") {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Asset records can only attach to committed uploads"
        );
      }
      session.assetId = requireText(assetId, "Asset id", 256);
      session.catalog = {
        state: "attached",
        attempts: session.catalog.attempts + 1,
        lastError: null,
        updatedAt: this.now().toISOString(),
      };
      await this.save(session);
      await this.event(session, "asset-attached", { assetId: session.assetId });
    });
  }

  async reconcileCatalog<T extends { id: string }>(
    uploadId: string,
    tenantId: string,
    reconcile: (session: UploadSession) => Promise<T>
  ): Promise<T> {
    return this.sessions.withLock(uploadId, async () => {
      const session = await this.sessions.get(uploadId);
      if (!session) {
        throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
      }
      this.assertTenant(session, tenantId);
      if (session.state !== "committed") {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Catalog reconciliation requires a committed upload"
        );
      }

      session.catalog.attempts += 1;
      session.catalog.state = "pending";
      session.catalog.updatedAt = this.now().toISOString();
      await this.save(session);
      try {
        const record = await reconcile(session);
        session.assetId = requireText(record.id, "Asset id", 256);
        session.catalog = {
          state: "attached",
          attempts: session.catalog.attempts,
          lastError: null,
          updatedAt: this.now().toISOString(),
        };
        await this.save(session);
        await this.event(session, "asset-attached", { assetId: session.assetId });
        return record;
      } catch (error) {
        session.catalog = {
          state: "error",
          attempts: session.catalog.attempts,
          lastError: error instanceof Error ? error.message : "Catalog reconciliation failed",
          updatedAt: this.now().toISOString(),
        };
        await this.save(session);
        await this.event(session, "asset-attachment-failed", {
          message: session.catalog.lastError,
        });
        throw error;
      }
    });
  }

  async abort(uploadId: string, tenantId: string): Promise<void> {
    return this.abortAuthorized(uploadId, (session) => this.assertTenant(session, tenantId));
  }

  async abortPublicIntake(uploadId: string, capabilityHash: string): Promise<void> {
    return this.abortAuthorized(uploadId, (session) =>
      this.assertIntakeCapability(session, capabilityHash)
    );
  }

  private async abortAuthorized(
    uploadId: string,
    authorize: (session: UploadSession) => void
  ): Promise<void> {
    await this.sessions.withLock(uploadId, async () => {
      const session = await this.sessions.get(uploadId);
      if (!session) return;
      authorize(session);
      if (session.legalHold) {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Upload is retained by legal hold"
        );
      }
      if (session.state === "committed") {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Committed objects cannot be aborted"
        );
      }
      const placedObjectKey = session.objectKey ?? this.objectKeyFor(session);
      if (await this.adapter.inspectStoredObject(placedObjectKey)) {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Placed objects require recovery review and cannot be aborted as staging"
        );
      }
      await this.adapter.abortMultipart(session.providerHandle);
      session.state = "aborted";
      await this.save(session);
      await this.event(session, "session-aborted");
    });
  }
}

export function createDefaultUploadOrchestrator(
  env: NodeJS.ProcessEnv = process.env
): UploadOrchestrator {
  const runtime = createStorageRuntime(env);
  if (!runtime.config.filesystemRoot) {
    throw new UploadOrchestrationError(
      "UPLOAD_BACKPRESSURE",
      "No durable upload-session repository is configured",
      true
    );
  }
  return new UploadOrchestrator({
    adapter: runtime.adapter,
    config: runtime.config,
    sessions: new FileUploadSessionRepository(
      runtime.config.filesystemRoot,
      runtime.config.lockTtlMs
    ),
    scanner: createMalwareScanHook(runtime.config.malwarePolicy),
  });
}
