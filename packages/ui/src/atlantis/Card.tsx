import React from "react";

interface CardProps {
  children: React.ReactNode;
  accent?: string;
  className?: string;
}

interface CardHeaderProps {
  title: string;
  action?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--at-border)]">
      <h3 className="text-base font-semibold text-[var(--at-text)] font-[var(--at-font-display)]">
        {title}
      </h3>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

function CardBody({ children, className = "" }: CardBodyProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export function Card({ children, accent, className = "" }: CardProps) {
  return (
    <div
      className={[
        "bg-white rounded-[var(--at-radius)] border border-[var(--at-border)] overflow-hidden",
        accent ? `border-l-4` : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Body = CardBody;
