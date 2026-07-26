export type PlatformSurfaceClass =
  | "public_acquisition"
  | "client_reviewer"
  | "internal_control_plane"
  | "domain_product"
  | "platform_service";

export type PlatformCriticality = "low" | "medium" | "high" | "critical";
export type PlatformRuntimeEnvLevel = "required" | "optional";
export type PlatformOwnerGroup =
  | "public_funnel"
  | "identity_access"
  | "workflow_orchestration"
  | "client_reviewer"
  | "finance_commercial"
  | "media_assets"
  | "platform_reliability";

export type PlatformRouteAccessibility = "public" | "authenticated" | "reviewer_token" | "internal";
export type PlatformServiceKind = "app" | "service" | "worker";

export interface PlatformOwner {
  group: PlatformOwnerGroup;
  role: string;
  productionHealthOwner: string;
  deployOwner: string;
  incidentResponder: string;
}

export interface RuntimeEnvDefinition {
  key: string;
  level: PlatformRuntimeEnvLevel;
  description: string;
  acceptedAliases?: string[];
  devDefault?: string;
  appliesTo: string[];
}

export interface RuntimeConfig {
  required: RuntimeEnvDefinition[];
  optional: RuntimeEnvDefinition[];
  localBootNotes: string[];
  productionExpectations: string[];
  failureModes: Array<{
    when: string;
    behavior: string;
  }>;
}

export interface CriticalRouteDefinition {
  id: string;
  path: string;
  surfaceId: string;
  accessibility: PlatformRouteAccessibility;
  purpose: string;
  ownerGroup: PlatformOwnerGroup;
  tags: string[];
}

export interface CriticalWorkflowDefinition {
  id: string;
  label: string;
  ownerGroup: PlatformOwnerGroup;
  systems: string[];
  entrypoints: string[];
  successSignal: string;
}

export interface ServiceDependencyDefinition {
  id: string;
  label: string;
  kind: "database" | "storage" | "queue" | "http" | "worker" | "email" | "payments" | "observability";
  required: boolean;
  healthEndpoint?: string;
  usedBy: string[];
  notes?: string;
}

export interface PlatformModule {
  id: string;
  label: string;
  surfaceId: string;
  businessPurpose: string;
  href?: string;
  owner: PlatformOwner;
  upstreamDependencies: string[];
  downstreamDependencies: string[];
  criticality: PlatformCriticality;
  monitoringTags: string[];
}

export interface PlatformSurface {
  id: string;
  label: string;
  class: PlatformSurfaceClass;
  kind: PlatformServiceKind;
  workspace: string;
  packageName: string;
  port?: number;
  basePath?: string;
  publicUrl?: string;
  sourceOfTruth: boolean;
  description: string;
  healthEndpoint?: string;
  proxyEntryPoint?: string;
  owner: PlatformOwner;
  modules: string[];
  requiredServices: string[];
  monitoringTags: string[];
}

export interface DeploymentDefinition {
  order: string[];
  releaseVerification: string[];
  smokeRouteIds: string[];
}

export interface ExecutionMilestone {
  id: string;
  label: string;
  targetWindow: string;
  outcome: string;
  dependencies: string[];
  exitCriteria: string[];
}

export interface ExecutionPhase {
  id: string;
  label: string;
  objective: string;
  duration: string;
  owners: PlatformOwnerGroup[];
  scope: string[];
  milestones: ExecutionMilestone[];
  risks: string[];
}

export interface DeliveryGate {
  id: string;
  label: string;
  phaseId: string;
  category: "architecture" | "security" | "workflow" | "ux" | "operations" | "launch";
  requiredEvidence: string[];
  blockingConditions: string[];
  approvers: string[];
}

export interface PlatformManifest {
  id: string;
  label: string;
  generatedFor: string;
  canonicalRepoRoot: string;
  version: string;
  generatedAt: string;
  architectureDecision: string;
  vocabulary: Record<string, string>;
  surfaces: PlatformSurface[];
  modules: PlatformModule[];
  runtime: RuntimeConfig;
  dependencies: ServiceDependencyDefinition[];
  criticalRoutes: CriticalRouteDefinition[];
  criticalWorkflows: CriticalWorkflowDefinition[];
  deployment: DeploymentDefinition;
  execution: {
    horizon: string;
    principles: string[];
    phases: ExecutionPhase[];
    deliveryGates: DeliveryGate[];
  };
  legacyRepos: Array<{
    label: string;
    path: string;
    status: "maintenance_only" | "decommissioning";
    notes: string;
  }>;
}
