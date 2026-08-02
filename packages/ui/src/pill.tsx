import type { PropsWithChildren } from "react";

export function Pill({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <span className={`badge ${className ?? ""}`}>{children}</span>;
}
