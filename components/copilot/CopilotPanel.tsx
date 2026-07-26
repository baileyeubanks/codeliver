"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import {
  COPILOT_MENU_ACTIONS,
  COPILOT_PANEL_MARGIN,
  COPILOT_SIZES,
  COPILOT_SUGGESTIONS,
  buildCopilotReply,
  clampPanelPosition,
  defaultPanelPosition,
  type CopilotContext,
  type CopilotPoint,
  type CopilotSizeKind,
} from "./copilot-logic.ts";

interface CopilotMessage {
  id: number;
  role: "user" | "copilot";
  text: string;
  footnote?: string;
}

interface MenuState {
  x: number;
  y: number;
}

const MENU_ESTIMATE = { width: 240, height: 176 };
let nextMessageId = 1;

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Focusable elements inside the panel (+ open menu) for the focus trap. */
function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}

export default function CopilotPanel() {
  const workspace = useDemoWorkspace();
  const [open, setOpen] = useState(false);
  const [sizeKind, setSizeKind] = useState<CopilotSizeKind>("compact");
  const [position, setPosition] = useState<CopilotPoint | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const size = COPILOT_SIZES[sizeKind];

  const buildContext = useCallback((): CopilotContext => {
    return {
      projects: workspace.projects.map((p) => ({ id: p.id, name: p.name, stage: p.stage })),
      tasks: workspace.tasks.map((t) => ({
        project_id: t.project_id,
        title: t.title,
        assignee_name: t.assignee_name,
        due_label: t.due_label,
        completed: t.completed,
      })),
      approvalStages: workspace.approvalStages.map((s) => ({
        project_id: s.project_id,
        name: s.name,
        status: s.status,
        reviewer_names: s.reviewer_names,
        approved_reviewer_names: s.approved_reviewer_names,
      })),
      comments: workspace.reviewComments.map((c) => ({
        author_name: c.author_name,
        body: c.body,
        status: c.status,
      })),
    };
  }, [workspace]);

  const ask = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const reply = buildCopilotReply(trimmed, buildContext());
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId++, role: "user", text: trimmed },
        { id: nextMessageId++, role: "copilot", text: reply.text, footnote: reply.footnote },
      ]);
      setDraft("");
    },
    [buildContext],
  );

  const openPanel = useCallback(() => {
    setPosition((prev) => prev ?? defaultPanelPosition(size, currentViewport()));
    setOpen(true);
  }, [size]);

  const closeToPill = useCallback(() => {
    setMenu(null);
    setOpen(false);
  }, []);

  /* Focus the composer when the panel opens. */
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  /* Keep the transcript pinned to the newest exchange. */
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /* Re-clamp when the panel size or the viewport changes. */
  useEffect(() => {
    if (!open) return;
    const reclamp = () =>
      setPosition((prev) =>
        clampPanelPosition(prev ?? defaultPanelPosition(size, currentViewport()), size, currentViewport()),
      );
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [open, size]);

  /* Escape: menu first, then the panel. */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (menu) {
        setMenu(null);
        inputRef.current?.focus({ preventScroll: true });
      } else {
        closeToPill();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, menu, closeToPill]);

  /* Outside pointer-down dismisses the context menu. */
  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [menu]);

  /* Focus the first menu item when the menu opens. */
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  function onDragStart(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !position) return;
    /* Header buttons (size toggle, close) must keep their clicks — only the
       bare chrome starts a drag, otherwise pointer capture retargets the click. */
    if (event.target instanceof Element && event.target.closest("button")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDragMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(
      clampPanelPosition(
        { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
        size,
        currentViewport(),
      ),
    );
  }

  function onDragEnd(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function onContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    setMenu(
      clampPanelPosition(
        { x: event.clientX, y: event.clientY },
        MENU_ESTIMATE,
        currentViewport(),
        COPILOT_PANEL_MARGIN / 2,
      ),
    );
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1].focus();
    }
  }

  /* Focus trap: keep Tab cycling inside the panel while it is open. */
  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const scope = menu ? menuRef.current : panelRef.current;
    const focusables = focusableWithin(scope ?? null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || !scope?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !scope?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function onMenuAction(actionId: string, prompt: string | null) {
    setMenu(null);
    if (prompt) {
      ask(prompt);
      inputRef.current?.focus({ preventScroll: true });
    } else if (actionId === "hide") {
      closeToPill();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="cvp-copilot-pill"
        data-copilot-pill
        onClick={openPanel}
        aria-label="Open AI Copilot"
      >
        <Sparkles size={14} aria-hidden="true" />
        <span>AI Copilot</span>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className="cvp-copilot"
      data-copilot-panel
      role="dialog"
      aria-modal="false"
      aria-label="AI Copilot — local demo preview"
      style={{
        width: size.width,
        height: size.height,
        left: position?.x ?? -9999,
        top: position?.y ?? -9999,
      }}
      onKeyDown={onPanelKeyDown}
      onContextMenu={onContextMenu}
    >
      <header
        className="cvp-copilot__header"
        data-copilot-drag-handle
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <Sparkles size={14} aria-hidden="true" className="cvp-copilot__spark" />
        <strong>AI Copilot</strong>
        <span className="cvp-copilot__status" data-copilot-status aria-hidden="true" />
        <span className="sr-only">Local demo preview</span>
        <span className="cvp-copilot__header-spacer" />
        <button
          type="button"
          data-copilot-size-toggle
          className="cvp-copilot__icon-btn"
          onClick={() => setSizeKind((k) => (k === "compact" ? "expanded" : "compact"))}
          aria-label={sizeKind === "compact" ? "Expand Copilot panel" : "Collapse Copilot panel"}
        >
          {sizeKind === "compact" ? <Maximize2 size={13} aria-hidden="true" /> : <Minimize2 size={13} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="cvp-copilot__icon-btn"
          onClick={closeToPill}
          aria-label="Close AI Copilot"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </header>

      <div className="cvp-copilot__transcript" ref={transcriptRef} aria-live="polite">
        {messages.length === 0 ? (
          <p className="cvp-copilot__empty">
            Ask about project status, approvals, feedback, or tasks. Answers are mock previews
            built from your demo workspace — not a real AI.
          </p>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="cvp-copilot__msg cvp-copilot__msg--user">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="cvp-copilot__msg cvp-copilot__msg--bot" data-copilot-reply>
                <p>{m.text}</p>
                <small className="cvp-copilot__footnote">{m.footnote}</small>
              </div>
            ),
          )
        )}
      </div>

      <div className="cvp-copilot__suggestions">
        {COPILOT_SUGGESTIONS.map((s) => (
          <button key={s} type="button" data-copilot-suggestion onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="cvp-copilot__composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything about your project…"
          aria-label="Ask the AI Copilot"
        />
        <button type="submit" className="cvp-copilot__send" aria-label="Send message">
          <Send size={13} aria-hidden="true" />
        </button>
      </form>

      {menu ? (
        <div
          ref={menuRef}
          className="cvp-copilot__menu"
          data-copilot-menu
          role="menu"
          aria-label="Copilot actions"
          style={{ left: menu.x - (position?.x ?? 0), top: menu.y - (position?.y ?? 0) }}
          onKeyDown={onMenuKeyDown}
        >
          {COPILOT_MENU_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => onMenuAction(action.id, action.prompt)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
