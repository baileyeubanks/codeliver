"use client";

import { useId, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Command, Search, X, type LucideIcon } from "lucide-react";
import { rankCommands } from "./navigation-model";
import { useDialogFocus } from "./useDialogFocus";
import styles from "./CommandPalette.module.css";

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  section?: string;
  href?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  onSelect?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  items: readonly CommandPaletteItem[];
  onClose: () => void;
  placeholder?: string;
  emptyLabel?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function CommandPalette({
  open,
  items,
  onClose,
  placeholder = "Search commands, projects, and media",
  emptyLabel = "No commands or media match this search.",
  returnFocusRef,
}: CommandPaletteProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => rankCommands(items, query), [items, query]);
  const selectedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));
  useDialogFocus(open, dialogRef, onClose, inputRef, true, returnFocusRef);

  if (!open) return null;

  function runCommand(item: CommandPaletteItem | undefined) {
    if (!item || item.disabled) return;
    item.onSelect?.();
    if (item.href) router.push(item.href);
    onClose();
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(results[selectedIndex]);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className={styles.srOnly}>Command palette</h2>
        <div className={styles.searchRow}>
          <Search size={19} aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-controls={listboxId}
            aria-activedescendant={results[selectedIndex] ? `${listboxId}-${results[selectedIndex].id}` : undefined}
            autoComplete="off"
          />
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close command palette">
            <X size={18} />
          </button>
        </div>

        <div id={listboxId} className={styles.results} role="listbox" aria-label="Available commands">
          {results.map((item, index) => {
            const Icon = item.icon ?? Command;
            return (
              <button
                id={`${listboxId}-${item.id}`}
                key={item.id}
                className={styles.item}
                type="button"
                role="option"
                aria-selected={selectedIndex === index}
                data-active={selectedIndex === index}
                disabled={item.disabled}
                onPointerMove={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => runCommand(item)}
              >
                <span className={styles.icon}><Icon size={17} /></span>
                <span className={styles.copy}>
                  <strong>{item.label}</strong>
                  {item.description ? <span>{item.description}</span> : null}
                </span>
                {item.section ? <span className={styles.section}>{item.section}</span> : null}
              </button>
            );
          })}
          {results.length === 0 ? <div className={styles.empty}>{emptyLabel}</div> : null}
        </div>
      </div>
    </div>
  );
}
