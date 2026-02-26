import type { PropsWithChildren } from "react";

export function SectionTitle({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <h2 className={className}>{children}</h2>;
}
