import React from "react";

interface DescriptionItem {
  label: string;
  value: React.ReactNode;
  accent?: string;
}

interface DescriptionListProps {
  items: DescriptionItem[];
}

export function DescriptionList({ items }: DescriptionListProps) {
  return (
    <dl className="divide-y divide-[var(--at-border)] font-[var(--at-font)]">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start justify-between py-3 first:pt-0 last:pb-0"
        >
          <dt className="text-sm text-[var(--at-text-secondary)] min-w-[140px] shrink-0">
            {item.label}
          </dt>
          <dd
            className="text-sm font-medium text-right"
            style={{ color: item.accent || "var(--at-text)" }}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
