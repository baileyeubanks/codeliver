import React from "react";

interface DividerProps {
  className?: string;
}

export function Divider({ className = "" }: DividerProps) {
  return (
    <hr
      className={`border-t border-[var(--at-border)] my-4 ${className}`}
      role="separator"
    />
  );
}
