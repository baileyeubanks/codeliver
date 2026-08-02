import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname } from "node:path";

import type { UploadSession, UploadSessionEvent } from "./session";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { UPLOAD_SESSION_STATES } from "./session.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { UploadOrchestrationError } from "./errors.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { appendDurable, syncDurableDirectory, writeDurableExclusive, writeDurableReplace } from "../storage/durable-files.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { assertSafeRegularFile, ensureSafeDirectoryTree, resolveExistingRoot, resolvePathInsideRoot } from "../storage/path-safety.ts";

const UPLOAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TENANT_KEY_PATTERN = /^[0-9a-f]{32}$/;
const INTAKE_FORM_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;
const INTAKE_CAPABILITY_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const AUTHORITY_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCK_ACQUIRE_ATTEMPTS = 24;
const PROVIDER_KINDS = new Set([
  "local",
  "ccnas",
  "google-drive",
  "object-store",
  "unconfigured",
]);

function assertUploadId(uploadId: string): void {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload id is invalid");
  }
}

function assertHash(value: string): void {
  if (!HASH_PATTERN.test(value)) {
    throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload index is invalid");
  }
}

function assertTenantKey(value: string): void {
  if (!TENANT_KEY_PATTERN.test(value)) {
    throw new UploadOrchestrationError("UPLOAD_INVALID", "Tenant upload key is invalid");
  }
}

function assertIntakeFormKeyHash(value: string): void {
  if (!INTAKE_FORM_KEY_HASH_PATTERN.test(value)) {
    throw new UploadOrchestrationError("UPLOAD_INVALID", "Intake upload scope is invalid");
  }
}

function sessionScopeKind(session: Partial<UploadSession>): "project" | "public-intake" {
  return session.scopeKind === "public-intake" ? "public-intake" : "project";
}

function sessionScopeLockKey(session: Partial<UploadSession>): string {
  if (sessionScopeKind(session) === "public-intake") {
    if (
      typeof session.intakeFormKeyHash !== "string" ||
      !INTAKE_FORM_KEY_HASH_PATTERN.test(session.intakeFormKeyHash)
    ) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Intake upload scope is invalid");
    }
    return `intake:${session.intakeFormKeyHash}`;
  }
  if (typeof session.tenantKey !== "string" || !TENANT_KEY_PATTERN.test(session.tenantKey)) {
    throw new UploadOrchestrationError("UPLOAD_INVALID", "Tenant upload key is invalid");
  }
  return `tenant:${session.tenantKey}`;
}

function immutableAuthorityMatches(left: UploadSession, right: UploadSession): boolean {
  return (
    sessionScopeKind(left) === sessionScopeKind(right) &&
    left.tenantKey === right.tenantKey &&
    left.projectId === right.projectId &&
    left.folderId === right.folderId &&
    (left.intakeFormKeyHash ?? null) === (right.intakeFormKeyHash ?? null) &&
    (left.intakeCapabilityHash ?? null) === (right.intakeCapabilityHash ?? null)
  );
}

function isNullableHash(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && HASH_PATTERN.test(value));
}

function isUploadSession(value: unknown): value is UploadSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<UploadSession>;
  const handle = session.providerHandle;
  const catalog = session.catalog;
  const scopeKind = sessionScopeKind(session);
  const validScope = scopeKind === "project"
    ? typeof session.tenantKey === "string" &&
      TENANT_KEY_PATTERN.test(session.tenantKey) &&
      typeof session.projectId === "string" &&
      session.projectId.length > 0 &&
      (session.intakeFormKeyHash === undefined || session.intakeFormKeyHash === null) &&
      (session.intakeCapabilityHash === undefined || session.intakeCapabilityHash === null)
    : session.tenantKey === null &&
      session.projectId === null &&
      session.folderId === null &&
      typeof session.intakeFormKeyHash === "string" &&
      INTAKE_FORM_KEY_HASH_PATTERN.test(session.intakeFormKeyHash) &&
      typeof session.intakeCapabilityHash === "string" &&
      INTAKE_CAPABILITY_HASH_PATTERN.test(session.intakeCapabilityHash);
  return (
    session.schemaVersion === 1 &&
    typeof session.id === "string" &&
    UPLOAD_ID_PATTERN.test(session.id) &&
    validScope &&
    typeof session.idempotencyKeyHash === "string" &&
    HASH_PATTERN.test(session.idempotencyKeyHash) &&
    Number.isSafeInteger(session.offset) &&
    Number.isSafeInteger(session.size) &&
    session.offset! >= 0 &&
    session.size! > 0 &&
    session.offset! <= session.size! &&
    Number.isSafeInteger(session.version) &&
    session.version! > 0 &&
    typeof session.provider === "string" &&
    PROVIDER_KINDS.has(session.provider) &&
    Number.isSafeInteger(session.revision) &&
    session.revision! > 0 &&
    typeof session.state === "string" &&
    UPLOAD_SESSION_STATES.includes(session.state as UploadSession["state"]) &&
    isNullableHash(session.expectedSha256) &&
    isNullableHash(session.computedSha256) &&
    (session.lastPartOffset === undefined ||
      session.lastPartOffset === null ||
      (Number.isSafeInteger(session.lastPartOffset) &&
        session.lastPartOffset >= 0 &&
        session.lastPartOffset < session.offset!)) &&
    (session.mediaIngestAuthoritySessionId === undefined ||
      session.mediaIngestAuthoritySessionId === null ||
      AUTHORITY_SESSION_ID_PATTERN.test(session.mediaIngestAuthoritySessionId)) &&
    Boolean(handle) &&
    handle?.uploadId === session.id &&
    handle?.provider === session.provider &&
    typeof handle?.opaqueId === "string" &&
    typeof catalog === "object" &&
    catalog !== null &&
    ["pending", "attached", "error"].includes(catalog.state) &&
    Number.isSafeInteger(catalog.attempts) &&
    catalog.attempts >= 0 &&
    (catalog.lastError === null || typeof catalog.lastError === "string") &&
    typeof catalog.updatedAt === "string"
  );
}

function normalizeUploadSession(session: UploadSession): UploadSession {
  const updatedAt = typeof session.updatedAt === "string"
    ? session.updatedAt
    : new Date(0).toISOString();
  const derivatives = session.derivatives;
  const recovery = session.recovery;
  return {
    ...session,
    scopeKind: session.scopeKind ?? "project",
    intakeFormKeyHash: session.intakeFormKeyHash ?? null,
    intakeCapabilityHash: session.intakeCapabilityHash ?? null,
    lastPartOffset: session.lastPartOffset ?? null,
    mediaIngestAuthoritySessionId:
      session.mediaIngestAuthoritySessionId ?? null,
    derivatives:
      derivatives &&
      ["blocked", "pending", "ready", "error"].includes(derivatives.state) &&
      Number.isSafeInteger(derivatives.attempts) &&
      derivatives.attempts >= 0
        ? derivatives
        : {
            state: "blocked",
            attempts: 0,
            lastError: "Derivative enqueue readiness was not recorded",
            updatedAt,
          },
    recovery:
      recovery &&
      Number.isSafeInteger(recovery.attempts) &&
      recovery.attempts >= 0
        ? recovery
        : {
            attempts: 0,
            lastAction: "none",
            lastRecoveredAt: null,
          },
  };
}

async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    await assertSafeRegularFile(path);
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface CreationTransaction {
  schemaVersion: 1;
  idempotencyKeyHash: string;
  session: UploadSession;
  preparedAt: string;
}

function parseCreationTransaction(
  value: unknown,
  expectedHash: string
): CreationTransaction {
  if (!value || typeof value !== "object") {
    throw new UploadOrchestrationError("UPLOAD_STATE", "Upload creation transaction is corrupted");
  }
  const transaction = value as Partial<CreationTransaction>;
  if (
    transaction.schemaVersion !== 1 ||
    transaction.idempotencyKeyHash !== expectedHash ||
    !isUploadSession(transaction.session) ||
    transaction.session.idempotencyKeyHash !== expectedHash ||
    typeof transaction.preparedAt !== "string"
  ) {
    throw new UploadOrchestrationError("UPLOAD_STATE", "Upload creation transaction is corrupted");
  }
  return {
    schemaVersion: 1,
    idempotencyKeyHash: expectedHash,
    session: normalizeUploadSession(transaction.session),
    preparedAt: transaction.preparedAt,
  };
}

interface HeldLock {
  contextKey: string;
  path: string;
  token: string;
  handle: Awaited<ReturnType<typeof open>>;
}

export interface UploadSessionRepository {
  findByIdempotencyHash(hash: string): Promise<UploadSession | null>;
  createOrGet(session: UploadSession): Promise<CreateRepositoryResult>;
  get(uploadId: string): Promise<UploadSession | null>;
  save(session: UploadSession, expectedRevision: number): Promise<void>;
  list(): Promise<UploadSession[]>;
  appendEvent(uploadId: string, event: UploadSessionEvent): Promise<void>;
  withLock<T>(uploadId: string, work: () => Promise<T>): Promise<T>;
  withTenantLock<T>(tenantKey: string, work: () => Promise<T>): Promise<T>;
  withIntakeLock<T>(formKeyHash: string, work: () => Promise<T>): Promise<T>;
  withAdmissionLock<T>(work: () => Promise<T>): Promise<T>;
}

export interface CreateRepositoryResult {
  session: UploadSession;
  created: boolean;
}

export class FileUploadSessionRepository implements UploadSessionRepository {
  private readonly configuredRoot: string;
  private readonly lockTtlMs: number;
  private readonly lockContext = new AsyncLocalStorage<Map<string, HeldLock>>();
  private rootPromise: Promise<string> | null = null;

  constructor(configuredRoot: string, lockTtlMs: number) {
    this.configuredRoot = configuredRoot;
    this.lockTtlMs = lockTtlMs;
  }

  private root(): Promise<string> {
    this.rootPromise ??= resolveExistingRoot(this.configuredRoot);
    return this.rootPromise;
  }

  private async path(relativePath: string): Promise<string> {
    return resolvePathInsideRoot(await this.root(), `.codeliver-ingest/control/${relativePath}`);
  }

  private async ensureWriteDirectories(): Promise<void> {
    const root = await this.root();
    for (const directory of [
      ".codeliver-ingest/control/sessions",
      ".codeliver-ingest/control/idempotency",
      ".codeliver-ingest/control/transactions",
      ".codeliver-ingest/control/locks",
      ".codeliver-ingest/control/events",
    ]) {
      await ensureSafeDirectoryTree(root, directory);
    }
  }

  private async unlinkDurable(path: string): Promise<void> {
    await unlink(path);
    await syncDurableDirectory(dirname(path));
  }

  private async writeSessionExclusive(session: UploadSession): Promise<void> {
    await this.ensureWriteDirectories();
    await writeDurableExclusive(
      await this.path(`sessions/${session.id}.json`),
      JSON.stringify(session)
    );
  }

  private async readIndex(hash: string): Promise<string | null> {
    const index = await readJsonFile(await this.path(`idempotency/${hash}.json`));
    if (index === null) return null;
    const uploadId = (index as { uploadId?: unknown }).uploadId;
    if (typeof uploadId !== "string" || !UPLOAD_ID_PATTERN.test(uploadId)) {
      throw new UploadOrchestrationError("UPLOAD_STATE", "Idempotency index is corrupted");
    }
    return uploadId;
  }

  private async readTransaction(hash: string): Promise<CreationTransaction | null> {
    const parsed = await readJsonFile(await this.path(`transactions/${hash}.json`));
    return parsed === null ? null : parseCreationTransaction(parsed, hash);
  }

  private async completeCreationTransaction(
    transaction: CreationTransaction
  ): Promise<UploadSession> {
    const session = transaction.session;
    await this.assertLockOwnership(sessionScopeLockKey(session));
    let persisted = await this.get(session.id);
    if (!persisted) {
      try {
        await this.writeSessionExclusive(session);
        persisted = session;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        persisted = await this.get(session.id);
      }
    }
    if (
      !persisted ||
      persisted.idempotencyKeyHash !== transaction.idempotencyKeyHash ||
      !immutableAuthorityMatches(persisted, session)
    ) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Upload creation transaction conflicts with durable session state"
      );
    }

    const indexPath = await this.path(
      `idempotency/${transaction.idempotencyKeyHash}.json`
    );
    const indexedUploadId = await this.readIndex(transaction.idempotencyKeyHash);
    if (!indexedUploadId) {
      try {
        await writeDurableExclusive(
          indexPath,
          JSON.stringify({ uploadId: persisted.id, createdAt: transaction.preparedAt })
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    const resolvedUploadId = await this.readIndex(transaction.idempotencyKeyHash);
    if (resolvedUploadId !== persisted.id) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Upload creation transaction conflicts with its idempotency index"
      );
    }

    await this.unlinkDurable(
      await this.path(`transactions/${transaction.idempotencyKeyHash}.json`)
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return persisted;
  }

  async findByIdempotencyHash(hash: string): Promise<UploadSession | null> {
    assertHash(hash);
    const uploadId = await this.readIndex(hash);
    if (uploadId) {
      const session = await this.get(uploadId);
      const transaction = await this.readTransaction(hash);
      if (session && transaction) {
        if (transaction.session.id !== session.id) {
          throw new UploadOrchestrationError(
            "UPLOAD_STATE",
            "Durable creation transaction conflicts with its session index"
          );
        }
        return this.completeCreationTransaction(transaction);
      }
      if (session) return session;
      if (transaction) return this.completeCreationTransaction(transaction);
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Idempotency index does not resolve to a durable session"
      );
    }
    const transaction = await this.readTransaction(hash);
    return transaction ? this.completeCreationTransaction(transaction) : null;
  }

  async createOrGet(session: UploadSession): Promise<CreateRepositoryResult> {
    assertUploadId(session.id);
    assertHash(session.idempotencyKeyHash);
    if (!isUploadSession(session)) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload session is invalid");
    }
    await this.assertLockOwnership(sessionScopeLockKey(session));
    const existing = await this.findByIdempotencyHash(session.idempotencyKeyHash);
    if (existing) return { session: existing, created: false };

    await this.ensureWriteDirectories();
    const transaction: CreationTransaction = {
      schemaVersion: 1,
      idempotencyKeyHash: session.idempotencyKeyHash,
      session,
      preparedAt: new Date().toISOString(),
    };
    const transactionPath = await this.path(
      `transactions/${session.idempotencyKeyHash}.json`
    );
    try {
      await writeDurableExclusive(transactionPath, JSON.stringify(transaction));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raced = await this.findByIdempotencyHash(session.idempotencyKeyHash);
      if (!raced) {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Upload creation transaction could not be recovered",
          true
        );
      }
      return { session: raced, created: false };
    }

    return {
      session: await this.completeCreationTransaction(transaction),
      created: true,
    };
  }

  async get(uploadId: string): Promise<UploadSession | null> {
    assertUploadId(uploadId);
    const parsed = await readJsonFile(await this.path(`sessions/${uploadId}.json`));
    if (parsed === null) return null;
    if (!isUploadSession(parsed) || parsed.id !== uploadId) {
      throw new UploadOrchestrationError("UPLOAD_STATE", "Upload session is corrupted");
    }
    return normalizeUploadSession(parsed);
  }

  async save(session: UploadSession, expectedRevision: number): Promise<void> {
    assertUploadId(session.id);
    if (!isUploadSession(session) || session.revision !== expectedRevision + 1) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload revision is invalid");
    }
    await this.assertLockOwnership(`upload:${session.id}`);
    const current = await this.get(session.id);
    if (!current) {
      throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload session was not found");
    }
    if (current.revision !== expectedRevision) {
      throw new UploadOrchestrationError(
        "UPLOAD_CONFLICT",
        "Upload session revision changed; retry from durable state",
        true
      );
    }
    if (
      !immutableAuthorityMatches(current, session) ||
      current.idempotencyKeyHash !== session.idempotencyKeyHash ||
      current.provider !== session.provider ||
      current.providerHandle.uploadId !== session.providerHandle.uploadId ||
      current.size !== session.size
    ) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Immutable upload session authority changed"
      );
    }

    await this.assertLockOwnership(`upload:${session.id}`);

    await this.ensureWriteDirectories();
    await writeDurableReplace(
      await this.path(`sessions/${session.id}.json`),
      JSON.stringify(session)
    );
  }

  async list(): Promise<UploadSession[]> {
    const directory = await this.path("sessions");
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const sessions: UploadSession[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const uploadId = entry.slice(0, -5);
      if (!UPLOAD_ID_PATTERN.test(uploadId)) continue;
      const session = await this.get(uploadId);
      if (session) sessions.push(session);
    }
    return sessions;
  }

  async appendEvent(uploadId: string, event: UploadSessionEvent): Promise<void> {
    assertUploadId(uploadId);
    await this.ensureWriteDirectories();
    await appendDurable(
      await this.path(`events/${uploadId}.jsonl`),
      `${JSON.stringify(event)}\n`
    );
  }

  private async assertLockOwnership(contextKey: string): Promise<void> {
    const held = this.lockContext.getStore()?.get(contextKey);
    if (!held) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        "Durable upload mutation requires its repository lock"
      );
    }
    const [handleStatus, pathStatus] = await Promise.all([
      held.handle.stat().catch(() => null),
      lstat(held.path).catch(() => null),
    ]);
    if (
      !handleStatus ||
      !pathStatus ||
      handleStatus.dev !== pathStatus.dev ||
      handleStatus.ino !== pathStatus.ino
    ) {
      throw new UploadOrchestrationError(
        "UPLOAD_BUSY",
        "Upload lock ownership changed; retry from durable state",
        true
      );
    }
  }

  private async withNamedLock<T>(
    contextKey: string,
    filename: string,
    busyMessage: string,
    waitOnContention: boolean,
    work: () => Promise<T>
  ): Promise<T> {
    await this.ensureWriteDirectories();
    const lockPath = await this.path(`locks/${filename}`);
    const token = randomUUID();
    let lockHandle: Awaited<ReturnType<typeof open>> | null = null;

    for (let attempt = 0; attempt < LOCK_ACQUIRE_ATTEMPTS; attempt += 1) {
      try {
        lockHandle = await open(lockPath, "wx", 0o600);
        await lockHandle.writeFile(
          JSON.stringify({
            token,
            pid: process.pid,
            acquiredAt: new Date().toISOString(),
          })
        );
        await lockHandle.sync();
        await syncDurableDirectory(dirname(lockPath));
        break;
      } catch (error) {
        await lockHandle?.close().catch(() => undefined);
        lockHandle = null;
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const status = await lstat(lockPath).catch(() => null);
        if (status?.isSymbolicLink() || (status && !status.isFile())) {
          throw new UploadOrchestrationError("UPLOAD_STATE", "Upload lock path is unsafe");
        }
        if (status && Date.now() - status.mtimeMs > this.lockTtlMs) {
          const stalePath = await this.path(
            `locks/.${filename}.${token}.${attempt}.stale`
          );
          try {
            await rename(lockPath, stalePath);
            await syncDurableDirectory(dirname(lockPath));
            await this.unlinkDurable(stalePath);
          } catch (takeoverError) {
            if ((takeoverError as NodeJS.ErrnoException).code !== "ENOENT") {
              throw takeoverError;
            }
          }
          continue;
        }
        if (waitOnContention && attempt + 1 < LOCK_ACQUIRE_ATTEMPTS) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(25, 5 * (attempt + 1)))
          );
          continue;
        }
        throw new UploadOrchestrationError("UPLOAD_BUSY", busyMessage, true);
      }
    }

    if (!lockHandle) {
      throw new UploadOrchestrationError("UPLOAD_BUSY", busyMessage, true);
    }
    const held: HeldLock = { contextKey, path: lockPath, token, handle: lockHandle };
    const parent = this.lockContext.getStore();
    const context = new Map(parent ?? []);
    context.set(contextKey, held);
    const heartbeat = setInterval(() => {
      const now = new Date();
      void lockHandle?.utimes(now, now).catch(() => undefined);
    }, Math.max(10, Math.floor(this.lockTtlMs / 3)));
    heartbeat.unref();

    try {
      return await this.lockContext.run(context, work);
    } finally {
      clearInterval(heartbeat);
      const [handleStatus, pathStatus] = await Promise.all([
        lockHandle.stat().catch(() => null),
        lstat(lockPath).catch(() => null),
      ]);
      if (
        handleStatus &&
        pathStatus &&
        handleStatus.dev === pathStatus.dev &&
        handleStatus.ino === pathStatus.ino
      ) {
        await this.unlinkDurable(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      await lockHandle.close().catch(() => undefined);
    }
  }

  async withLock<T>(uploadId: string, work: () => Promise<T>): Promise<T> {
    assertUploadId(uploadId);
    return this.withNamedLock(
      `upload:${uploadId}`,
      `upload-${uploadId}.lock`,
      "Upload session is busy; retry after backoff",
      false,
      work
    );
  }

  async withTenantLock<T>(tenantKey: string, work: () => Promise<T>): Promise<T> {
    assertTenantKey(tenantKey);
    return this.withNamedLock(
      `tenant:${tenantKey}`,
      `tenant-${tenantKey}.lock`,
      "Tenant upload admission is busy; retry after backoff",
      true,
      work
    );
  }

  async withIntakeLock<T>(formKeyHash: string, work: () => Promise<T>): Promise<T> {
    assertIntakeFormKeyHash(formKeyHash);
    return this.withNamedLock(
      `intake:${formKeyHash}`,
      `intake-${formKeyHash}.lock`,
      "Intake upload admission is busy; retry after backoff",
      true,
      work
    );
  }

  async withAdmissionLock<T>(work: () => Promise<T>): Promise<T> {
    return this.withNamedLock(
      "admission:global",
      "admission-global.lock",
      "Storage admission is busy; retry after backoff",
      true,
      work
    );
  }
}
