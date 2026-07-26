"use client";

import { useDemoCapability } from "@/lib/demo/capability-context";

type DemoEnvironment = {
  NODE_ENV?: string;
  CODELIVER_DEMO_MODE?: string;
};

export function isLocalDemoPreviewEnabled(environment: DemoEnvironment = process.env): boolean {
  return (
    environment.NODE_ENV !== "production" &&
    environment.CODELIVER_DEMO_MODE === "1"
  );
}

/**
 * The only browser input accepted for demo state: a boolean supplied by the
 * server layout after proxy.ts has authenticated the local preview request.
 */
export function demoModeFromCapability(capability: boolean): boolean {
  return capability === true;
}

export function isDemoSessionAllowed(capability: boolean): boolean {
  return demoModeFromCapability(capability);
}

export function useDemoMode() {
  return demoModeFromCapability(useDemoCapability());
}

export function useDemoSuffix() {
  return useDemoMode() ? "?demo=1" : "";
}
