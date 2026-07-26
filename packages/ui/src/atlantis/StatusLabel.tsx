import React from "react";

type Status = "success" | "warning" | "critical" | "info" | "neutral";

interface StatusLabelProps {
  status: Status;
  children: React.ReactNode;
}

const statusClasses: Record<Status, string> = {
  success:
    "bg-[var(--at-green-lightest)] text-[var(--at-green)]",
  warning:
    "bg-[var(--at-yellow-light)] text-[color:hsl(35,80%,30%)]",
  critical:
    "bg-[var(--at-red-light)] text-[var(--at-red)]",
  info:
    "bg-[var(--at-blue-lightest)] text-[var(--at-blue)]",
  neutral:
    "bg-[var(--at-grey-200)] text-[var(--at-grey-700)]",
};

export function StatusLabel({ status, children }: StatusLabelProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium leading-5",
        "font-[var(--at-font)]",
        statusClasses[status],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
