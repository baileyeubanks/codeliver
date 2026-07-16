"use client";

import React, { useState, useMemo } from "react";

interface Column<T> {
  header: string;
  accessorKey: keyof T & string;
  cell?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

type SortDir = "asc" | "desc" | null;

function SortIcon({ direction }: { direction: SortDir }) {
  if (!direction) {
    return (
      <svg className="ml-1 h-3.5 w-3.5 text-[var(--at-grey-400)]" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 3l4 5H4l4-5zM8 13l-4-5h8l-4 5z" />
      </svg>
    );
  }
  return (
    <svg className="ml-1 h-3.5 w-3.5 text-[var(--at-grey-700)]" viewBox="0 0 16 16" fill="currentColor">
      {direction === "asc" ? (
        <path d="M8 3l4 5H4l4-5z" />
      ) : (
        <path d="M8 13l-4-5h8l-4 5z" />
      )}
    </svg>
  );
}

function SkeletonRows({ columns, rows }: { columns: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--at-grey-200)]">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-[var(--at-grey-200)] rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data to display.",
  loading = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto rounded-[var(--at-radius)] border border-[var(--at-border)]">
      <table className="w-full text-sm font-[var(--at-font)]">
        <thead>
          <tr className="bg-[var(--at-grey-100)] border-b border-[var(--at-border)]">
            {columns.map((col) => (
              <th
                key={col.accessorKey}
                onClick={() => handleSort(col.accessorKey)}
                className="px-4 py-3 text-left text-xs font-semibold text-[var(--at-grey-700)] uppercase tracking-wide cursor-pointer select-none hover:text-[var(--at-grey-900)]"
              >
                <span className="inline-flex items-center">
                  {col.header}
                  <SortIcon
                    direction={sortKey === col.accessorKey ? sortDir : null}
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {loading ? (
            <SkeletonRows columns={columns.length} rows={5} />
          ) : sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-[var(--at-text-secondary)]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={[
                  "border-b border-[var(--at-grey-200)] last:border-b-0 transition-colors",
                  onRowClick
                    ? "cursor-pointer hover:bg-[var(--at-grey-100)]"
                    : "",
                ].join(" ")}
              >
                {columns.map((col) => (
                  <td
                    key={col.accessorKey}
                    className="px-4 py-3 text-[var(--at-text)]"
                  >
                    {col.cell
                      ? col.cell(row[col.accessorKey], row)
                      : (row[col.accessorKey] as React.ReactNode) ?? ""}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
