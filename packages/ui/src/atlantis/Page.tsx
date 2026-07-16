import React from "react";

interface PageProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <div className="font-[var(--at-font)]">
      {/* Title bar */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--at-text)] font-[var(--at-font-display)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-[var(--at-text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3 shrink-0">{actions}</div>
        )}
      </div>
      {/* Content */}
      <div>{children}</div>
    </div>
  );
}
