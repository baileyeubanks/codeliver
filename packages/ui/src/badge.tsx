import type { PropsWithChildren } from "react";

interface BadgeProps {
  className?: string;
  variant?: "default" | "resolved" | "role";
}

export function Badge({ children, className, variant = "default" }: PropsWithChildren<BadgeProps>) {
  const cn = ["badge", variant !== "default" ? `badge-${variant}` : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <span className={cn}>{children}</span>;
}
