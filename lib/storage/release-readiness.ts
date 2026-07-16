import type { StorageReadiness } from "./contracts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { assessSignedDeliveryReadiness, type SignedDeliveryReadiness } from "./delivery-readiness.ts";

export interface ScannerReadinessContract {
  mode: string;
  configured: boolean;
  automaticReleaseReady: boolean;
  failClosed: true;
  message: string;
}

export interface DerivativeReadinessContract {
  enqueueConfigured: boolean;
  durableSessionState: true;
  automaticProcessingReady: boolean;
  failClosed: true;
  message: string;
}

export interface UploadWorkflowReadiness {
  scanner: ScannerReadinessContract;
  derivatives: DerivativeReadinessContract;
  signedDelivery: SignedDeliveryReadiness;
}

export function buildUploadWorkflowReadiness(input: {
  storage: StorageReadiness;
  scanner: {
    mode: string;
    configured: boolean;
    automaticReleaseReady: boolean;
    message: string;
  };
  derivativeHooksConfigured: boolean;
}): UploadWorkflowReadiness {
  return {
    scanner: {
      ...input.scanner,
      automaticReleaseReady:
        input.storage.readyForWrites && input.scanner.automaticReleaseReady,
      failClosed: true,
    },
    derivatives: {
      enqueueConfigured: input.derivativeHooksConfigured,
      durableSessionState: true,
      automaticProcessingReady:
        input.storage.readyForWrites && input.derivativeHooksConfigured,
      failClosed: true,
      message: input.derivativeHooksConfigured
        ? "Derivative enqueue hook is configured and session attempts are durable"
        : "No derivative enqueue hook is configured; committed originals remain blocked for automatic processing",
    },
    signedDelivery: assessSignedDeliveryReadiness(input.storage),
  };
}
