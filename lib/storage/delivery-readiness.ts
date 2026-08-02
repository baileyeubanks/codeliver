import type {
  StorageDiagnosticCheck,
  StorageReadiness,
} from "./contracts";

export const SIGNED_DELIVERY_CONTRACT_VERSION = 1 as const;

export const SIGNED_DELIVERY_REQUIRED_BINDINGS = [
  "tenant",
  "recipient",
  "object-key",
  "object-version",
  "sha256",
  "permission",
  "expires-at",
  "revocation-generation",
  "watermark-policy",
] as const;

export interface SignedDeliveryDependencies {
  signerConfigured: boolean;
  policyResolverReady: boolean;
  revocationStoreReady: boolean;
  auditSinkReady: boolean;
}

export interface SignedDeliveryReadiness {
  contractVersion: typeof SIGNED_DELIVERY_CONTRACT_VERSION;
  ready: boolean;
  failClosed: true;
  requiredBindings: typeof SIGNED_DELIVERY_REQUIRED_BINDINGS;
  checks: StorageDiagnosticCheck[];
}

const DEFAULT_DEPENDENCIES: SignedDeliveryDependencies = {
  signerConfigured: false,
  policyResolverReady: false,
  revocationStoreReady: false,
  auditSinkReady: false,
};

export function assessSignedDeliveryReadiness(
  storage: Pick<StorageReadiness, "capabilities" | "configured">,
  dependencies: SignedDeliveryDependencies = DEFAULT_DEPENDENCIES
): SignedDeliveryReadiness {
  const capability = storage.capabilities.includes("signed-delivery");
  const checks: StorageDiagnosticCheck[] = [
    {
      key: "signed-delivery-capability",
      status: capability && storage.configured ? "pass" : "fail",
      message:
        capability && storage.configured
          ? "Configured provider advertises signed-delivery support"
          : "Configured provider does not advertise signed-delivery support",
    },
    {
      key: "signed-delivery-signer",
      status: dependencies.signerConfigured ? "pass" : "fail",
      message: dependencies.signerConfigured
        ? "Delivery signer is configured"
        : "Delivery signer is not configured",
    },
    {
      key: "signed-delivery-policy",
      status: dependencies.policyResolverReady ? "pass" : "fail",
      message: dependencies.policyResolverReady
        ? "Recipient and permission policy resolver is ready"
        : "Recipient and permission policy resolver is unavailable",
    },
    {
      key: "signed-delivery-revocation",
      status: dependencies.revocationStoreReady ? "pass" : "fail",
      message: dependencies.revocationStoreReady
        ? "Revocation generation store is ready"
        : "Revocation generation store is unavailable",
    },
    {
      key: "signed-delivery-audit",
      status: dependencies.auditSinkReady ? "pass" : "fail",
      message: dependencies.auditSinkReady
        ? "Delivery audit sink is ready"
        : "Delivery audit sink is unavailable",
    },
  ];

  return {
    contractVersion: SIGNED_DELIVERY_CONTRACT_VERSION,
    ready: checks.every((check) => check.status === "pass"),
    failClosed: true,
    requiredBindings: SIGNED_DELIVERY_REQUIRED_BINDINGS,
    checks,
  };
}
