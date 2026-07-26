"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";

const DemoCapabilityContext = createContext(false);

/** Server-derived preview capability; never derived from a browser URL. */
export function DemoCapabilityProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return createElement(DemoCapabilityContext.Provider, { value: enabled }, children);
}

export function useDemoCapability(): boolean {
  return useContext(DemoCapabilityContext);
}
