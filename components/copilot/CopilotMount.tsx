"use client";

import { usePathname } from "next/navigation";
import { useDemoMode } from "@/lib/demo/mode";
import CopilotPanel from "./CopilotPanel";

/* Internal tooling: never on auth pages or public client review surfaces. */
const EXCLUDED_PATHS = new Set(["/login", "/signup"]);
const EXCLUDED_PREFIXES = ["/review"];

export function copilotAllowedOnPath(pathname: string): boolean {
  if (EXCLUDED_PATHS.has(pathname)) return false;
  return !EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Demo-mode gate + route gate for the floating AI Copilot (P14). */
export default function CopilotMount() {
  const demoMode = useDemoMode();
  const pathname = usePathname() ?? "";
  if (!demoMode || !copilotAllowedOnPath(pathname)) return null;
  return <CopilotPanel />;
}
