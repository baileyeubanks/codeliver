import {
  createBudgetPolicy,
  DEMO_COMMERCIAL_TERMS,
  InMemoryMeteringRepository,
  MeteringService,
  type MeteringActor,
} from "../metering";
import {
  AgentHarness,
  createVaultProjectPolicy,
  InMemoryVaultRepository,
  VaultService,
  type AgentUsageAuthorization,
  type VaultActor,
  type VaultScope,
} from ".";

const DEMO_CONTROL_PLANE_KEY = Symbol.for("contentco-op.co-deliver.control-plane.demo.v1");

interface LocalControlPlaneState {
  meteringRepository: InMemoryMeteringRepository;
  metering: MeteringService;
  vaultRepository: InMemoryVaultRepository;
  vault: VaultService;
  harness: AgentHarness;
}

export class ControlPlaneUnavailableError extends Error {
  constructor() {
    super(
      "Co-Credit and vault persistence is local/demo-only until durable storage and authenticated project authority are installed.",
    );
    this.name = "ControlPlaneUnavailableError";
  }
}

function demoServiceActor(): MeteringActor {
  return {
    id: "local-control-plane",
    role: "service",
    kind: "service",
  };
}

function demoVaultServiceActor(): VaultActor {
  return {
    id: "local-control-plane",
    role: "service",
    kind: "service",
    capabilities: [
      "vault:read",
      "vault:write",
      "vault:retrieve",
      "vault:export",
      "agent:plan",
      "agent:submit_output",
      "agent:approve",
      "agent:cancel",
      "agent:rollback",
      "agent:audit",
    ],
  };
}

function activeDemoPeriod(now: Date) {
  const start = new Date(now.getTime() - 86_400_000).toISOString();
  const end = new Date(now.getTime() + 31 * 86_400_000).toISOString();
  return { start, end };
}

function createState(): LocalControlPlaneState {
  const meteringRepository = new InMemoryMeteringRepository();
  const metering = new MeteringService(meteringRepository, {
    pricing: DEMO_COMMERCIAL_TERMS,
  });
  const vaultRepository = new InMemoryVaultRepository();
  const vault = new VaultService(vaultRepository);
  const harness = new AgentHarness(vaultRepository, vault, {
    verifyUsageAuthorization: (authorization, scope) =>
      verifyDemoUsageAuthorization(meteringRepository, authorization, scope),
  });
  return { meteringRepository, metering, vaultRepository, vault, harness };
}

function getState(): LocalControlPlaneState {
  const root = globalThis as typeof globalThis & {
    [DEMO_CONTROL_PLANE_KEY]?: LocalControlPlaneState;
  };
  root[DEMO_CONTROL_PLANE_KEY] ??= createState();
  return root[DEMO_CONTROL_PLANE_KEY];
}

function verifyDemoUsageAuthorization(
  repository: InMemoryMeteringRepository,
  authorization: AgentUsageAuthorization,
  scope: VaultScope,
) {
  const reservation = repository.getReservation(authorization.reservationId);
  if (!reservation) return { valid: false, reasons: ["Usage reservation was not found."] };
  const sameScope =
    reservation.scope.organizationId === scope.organizationId &&
    reservation.scope.projectId === scope.projectId;
  const matching =
    sameScope &&
    reservation.status === "active" &&
    reservation.quoteId === authorization.quoteId &&
    reservation.operation === authorization.operation &&
    reservation.maximumCoUnits === authorization.maximumCoUnits &&
    reservation.rateVersion === authorization.rateVersion &&
    reservation.pricingVersion === authorization.pricingVersion &&
    reservation.integrityHash === authorization.integrityHash &&
    reservation.expiresAt > new Date().toISOString();
  return {
    valid: matching,
    reasons: matching
      ? []
      : ["Usage reservation is inactive, stale, altered, or belongs to another project."],
  };
}

export function isLocalControlPlaneEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.CCO_CONTROL_PLANE_DEMO !== "0";
}

export async function getLocalControlPlane(scope: VaultScope) {
  if (!isLocalControlPlaneEnabled()) throw new ControlPlaneUnavailableError();
  const state = getState();
  const now = new Date();
  const period = activeDemoPeriod(now);
  const serviceActor = demoServiceActor();
  const vaultActor = demoVaultServiceActor();

  if (!state.meteringRepository.getTenantBudget(scope.organizationId)) {
    await state.metering.configureBudget(
      createBudgetPolicy({
        scope,
        budgetScope: "tenant",
        includedCoUnits: 50_000,
        periodStart: period.start,
        periodEnd: period.end,
        configuredAt: now.toISOString(),
        actor: serviceActor,
        version: "demo-tenant-budget.v1",
      }),
      serviceActor,
      scope,
    );
  }
  if (!state.meteringRepository.getProjectBudget(scope)) {
    await state.metering.configureBudget(
      createBudgetPolicy({
        scope,
        budgetScope: "project",
        includedCoUnits: 10_000,
        periodStart: period.start,
        periodEnd: period.end,
        configuredAt: now.toISOString(),
        actor: serviceActor,
        version: "demo-project-budget.v1",
      }),
      serviceActor,
      scope,
    );
  }
  if (!state.vaultRepository.getPolicy(scope)) {
    await state.vault.configurePolicy(
      createVaultProjectPolicy({
        scope,
        version: "demo-vault-policy.v1",
        allowedStorageRegions: ["us-central"],
        allowedProcessingRegions: ["us-central"],
        allowedExternalDomains: ["contentco-op.com"],
        allowedProviders: ["demo-provider"],
        allowedModels: ["demo-model"],
        maximumRetentionDays: 365,
        auditRetentionDays: 365,
        actor: vaultActor,
        configuredAt: now.toISOString(),
      }),
      vaultActor,
    );
  }

  return state;
}
