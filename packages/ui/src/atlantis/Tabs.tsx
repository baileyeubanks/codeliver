"use client";

import React, { useState } from "react";

interface Tab {
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: number;
}

export function Tabs({ tabs, defaultTab = 0 }: TabsProps) {
  const [active, setActive] = useState(defaultTab);

  return (
    <div className="font-[var(--at-font)]">
      {/* Tab bar */}
      <div
        className="flex border-b border-[var(--at-border)]"
        role="tablist"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={[
              "px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--at-blue)] focus-visible:ring-inset",
              active === i
                ? "text-[var(--at-blue)] border-b-2 border-[var(--at-blue)]"
                : "text-[var(--at-text-secondary)] hover:text-[var(--at-text)] border-b-2 border-transparent",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Panel */}
      <div role="tabpanel" className="pt-4">
        {tabs[active]?.content}
      </div>
    </div>
  );
}
