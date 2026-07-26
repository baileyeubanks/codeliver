"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  LayoutTemplate,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  StickyNote as StickyNoteIcon,
  Trash2,
  Undo2,
} from "lucide-react";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import {
  addWhiteboardSticky,
  applyDemoWhiteboardTemplate,
  deleteWhiteboardNode,
  moveWhiteboardNode,
  restoreDemoWhiteboardContent,
  updateWhiteboardSticky,
  useDemoWorkspace,
  type DemoWhiteboardBoard,
} from "@/lib/demo/workspace-store";
import {
  DEFAULT_VIEWPORT_ZOOM,
  panViewport,
  rotationForId,
  screenToWorld,
  snapToGrid,
  zoomViewportAt,
  type WhiteboardViewport,
} from "@/lib/whiteboard/geometry";
import {
  PHASE_CARD_HEIGHT,
  PHASE_FLOW_ORIGIN_X,
  PHASE_FLOW_ORIGIN_Y,
  WHITEBOARD_PHASES,
  buildPhaseFlow,
  liveEdges,
  phaseDefinition,
  type PhaseFlowCard,
  type WhiteboardNode,
  type WhiteboardPhaseId,
} from "@/lib/whiteboard/model";
import {
  arrowHeadPoints,
  connectorArrowHead,
  elbowConnectorPath,
  type ConnectorRect,
} from "@/lib/whiteboard/connectors";
import {
  WHITEBOARD_TEMPLATES,
  type WhiteboardTemplateId,
} from "@/lib/whiteboard/templates";
import styles from "./WhiteboardCanvas.module.css";

const EMPTY_BOARD: DemoWhiteboardBoard = {
  project_id: "",
  nodes: [],
  edges: [],
  template_id: null,
  updated_at: "",
};

/** Template cards land one grid row below the phase-flow lane. */
const TEMPLATE_ANCHOR = {
  x: PHASE_FLOW_ORIGIN_X,
  y: PHASE_FLOW_ORIGIN_Y + PHASE_CARD_HEIGHT + 64,
};

const ZOOM_STEP = 1.2;

/** First-paint frame: current phase + sticky cluster in view (see below). */
const INITIAL_VIEWPORT: WhiteboardViewport = {
  originX: 600,
  originY: -24,
  zoom: DEFAULT_VIEWPORT_ZOOM,
};

interface DragState {
  nodeId: string;
  pointerStartX: number;
  pointerStartY: number;
  nodeStartX: number;
  nodeStartY: number;
  liveX: number;
  liveY: number;
  moved: boolean;
}

function Connector({ from, to, color }: { from: ConnectorRect; to: ConnectorRect; color: string }) {
  const head = connectorArrowHead(from, to);
  return (
    <g>
      <path
        d={elbowConnectorPath(from, to)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="7 5"
        strokeLinecap="round"
      />
      <polygon points={arrowHeadPoints(head)} fill={color} />
    </g>
  );
}

export default function ProjectWhiteboardClient() {
  const { id } = useParams<{ id: string }>();
  const demoMode = useDemoMode();
  const demoSuffix = useDemoSuffix();
  const workspace = useDemoWorkspace();

  const project = workspace.projects.find((candidate) => candidate.id === id);
  const stage = project?.stage ?? "development";
  const board =
    workspace.whiteboardBoards.find((candidate) => candidate.project_id === id) ?? EMPTY_BOARD;

  const phaseFlow = useMemo(() => buildPhaseFlow(stage), [stage]);
  const currentPhase = phaseFlow.find((card) => card.isCurrent)?.phase.id ?? "strategy";
  const edges = useMemo(() => liveEdges(board), [board]);

  // Frame the current phase (and its sticky cluster) on first paint rather
  // than the lane origin — the "You are here" moment is the demo opener.
  const [viewport, setViewport] = useState<WhiteboardViewport>(INITIAL_VIEWPORT);
  const [panning, setPanning] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<{
    nodes: WhiteboardNode[];
    edges: DemoWhiteboardBoard["edges"];
    templateId: WhiteboardTemplateId | null;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  /* Wheel zoom needs a non-passive listener to preventDefault page scroll. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setViewport((current) => zoomViewportAt(current, anchor, factor));
    }
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  const handleCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-wb-node], [data-wb-ui]")) return;
    panRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  }, []);

  const handleCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.lastX;
    const dy = event.clientY - pan.lastY;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    setViewport((current) => panViewport(current, dx, dy));
  }, []);

  const endPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setPanning(false);
  }, []);

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, node: WhiteboardNode) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button, textarea")) return;
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setDrag({
        nodeId: node.id,
        pointerStartX: event.clientX,
        pointerStartY: event.clientY,
        nodeStartX: node.x,
        nodeStartY: node.y,
        liveX: node.x,
        liveY: node.y,
        moved: false,
      });
    },
    [],
  );

  const handleNodePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      setDrag((current) => {
        if (!current) return current;
        const dx = (event.clientX - current.pointerStartX) / viewport.zoom;
        const dy = (event.clientY - current.pointerStartY) / viewport.zoom;
        return {
          ...current,
          liveX: snapToGrid(current.nodeStartX + dx),
          liveY: snapToGrid(current.nodeStartY + dy),
          moved: current.moved || Math.abs(dx) + Math.abs(dy) > 2,
        };
      });
    },
    [viewport.zoom],
  );

  const handleNodePointerUp = useCallback(() => {
    setDrag((current) => {
      if (current && current.moved) {
        moveWhiteboardNode({
          projectId: id,
          nodeId: current.nodeId,
          x: current.liveX,
          y: current.liveY,
        });
      }
      return null;
    });
  }, [id]);

  const nodePosition = useCallback(
    (node: WhiteboardNode) =>
      drag && drag.nodeId === node.id ? { x: drag.liveX, y: drag.liveY } : { x: node.x, y: node.y },
    [drag],
  );

  const zoomBy = useCallback((factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const anchor = rect
      ? { x: rect.width / 2, y: rect.height / 2 }
      : { x: 0, y: 0 };
    setViewport((current) => zoomViewportAt(current, anchor, factor));
  }, []);

  const addSticky = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = screenToWorld(viewport, {
      x: (rect?.width ?? 800) / 2,
      y: (rect?.height ?? 500) / 2,
    });
    const result = addWhiteboardSticky({
      projectId: id,
      phase: currentPhase,
      body: "New note — double-click to edit",
      x: center.x - 88,
      y: center.y - 72,
    });
    if (result.ok) {
      setEditingId(result.id);
      setEditDraft("New note — double-click to edit");
    }
  }, [id, viewport, currentPhase]);

  const applyTemplateById = useCallback(
    (templateId: WhiteboardTemplateId) => {
      setUndoSnapshot({
        nodes: board.nodes,
        edges: board.edges,
        templateId: board.template_id,
      });
      applyDemoWhiteboardTemplate({ projectId: id, templateId, anchor: TEMPLATE_ANCHOR });
    },
    [board, id],
  );

  const undoTemplate = useCallback(() => {
    if (!undoSnapshot) return;
    restoreDemoWhiteboardContent({
      projectId: id,
      nodes: undoSnapshot.nodes,
      edges: undoSnapshot.edges,
      templateId: undoSnapshot.templateId,
    });
    setUndoSnapshot(null);
  }, [id, undoSnapshot]);

  const startEditing = useCallback((node: WhiteboardNode) => {
    setEditingId(node.id);
    setEditDraft(node.body);
  }, []);

  const commitEditing = useCallback(() => {
    if (editingId) {
      updateWhiteboardSticky({ projectId: id, nodeId: editingId, body: editDraft.trim() });
    }
    setEditingId(null);
  }, [editingId, editDraft, id]);

  /* Keyboard navigation between cards: arrows move focus in reading order. */
  const focusableIds = useMemo(
    () => [
      ...phaseFlow.map((card) => `phase-${card.phase.id}`),
      ...board.nodes.map((node) => node.id),
    ],
    [phaseFlow, board.nodes],
  );

  const handleCardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, focusId: string) => {
      const index = focusableIds.indexOf(focusId);
      if (index < 0) return;
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = index + 1;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = index - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      const wrapped = (nextIndex + focusableIds.length) % focusableIds.length;
      const nextId = focusableIds[wrapped];
      const root = canvasRef.current;
      const target = root?.querySelector<HTMLElement>(`[data-wb-focus="${nextId}"]`);
      target?.focus();
    },
    [focusableIds],
  );

  const worldTransform = `translate(${-viewport.originX * viewport.zoom}px, ${-viewport.originY * viewport.zoom}px) scale(${viewport.zoom})`;
  const dotSize = 24 * viewport.zoom;

  if (!demoMode) {
    return (
      <div className={styles.productionNotice}>
        <h1>Project Whiteboard</h1>
        <p>
          The full-screen whiteboard is available in the local demo workspace today. Boards save
          to this browser while the production board API is being built — nothing here invents
          project state.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.board} data-whiteboard>
      <header className={styles.header}>
        <Link
          href={`/projects/${encodeURIComponent(id)}${demoSuffix}`}
          className={styles.backLink}
          aria-label={`Back to ${project?.name ?? "project"} workspace`}
        >
          <ArrowLeft size={15} aria-hidden /> Workspace
        </Link>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{project?.name ?? "Project"} — Whiteboard</h1>
          <span className={styles.persistenceNote}>
            Saved to this browser (local demo persistence)
          </span>
        </div>
      </header>

      <div
        ref={canvasRef}
        className={`${styles.canvas} ${panning ? styles.canvasPanning : ""}`}
        role="region"
        aria-label={`${project?.name ?? "Project"} whiteboard canvas. Drag empty space to pan, use the mouse wheel to zoom, arrow keys move between cards.`}
        style={{
          backgroundImage: "radial-gradient(circle, var(--cvp-border) 1px, transparent 1px)",
          backgroundSize: `${dotSize}px ${dotSize}px`,
          backgroundPosition: `${-viewport.originX * viewport.zoom}px ${-viewport.originY * viewport.zoom}px`,
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div className={styles.toolbar} data-wb-ui>
          <span className={styles.toolbarLabel}>Whiteboard</span>
          <button
            type="button"
            className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
            onClick={addSticky}
            aria-label="Add a sticky note at the canvas center"
          >
            <Plus size={15} aria-hidden /> Add note
          </button>
          <span className={styles.toolbarLabel}>Templates</span>
          {WHITEBOARD_TEMPLATES.map((template) => (
            <div key={template.id}>
              <button
                type="button"
                className={styles.toolbarButton}
                onClick={() => applyTemplateById(template.id)}
                aria-label={`Apply the ${template.name} template`}
              >
                <LayoutTemplate size={15} aria-hidden /> {template.name}
              </button>
              <p className={styles.templateDescription}>{template.description}</p>
            </div>
          ))}
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={undoTemplate}
            disabled={!undoSnapshot}
            aria-label="Undo the last template application"
          >
            <Undo2 size={15} aria-hidden /> Undo template
          </button>
        </div>

        <div className={styles.world} style={{ transform: worldTransform }}>
          <svg className={styles.connectors} width={1} height={1} aria-hidden data-wb-connectors>
            {phaseFlow.slice(0, -1).map((card, index) => {
              const next = phaseFlow[index + 1];
              if (!next) return null;
              return (
                <Connector
                  key={`phase-edge-${card.phase.id}`}
                  from={card}
                  to={next}
                  color="var(--cvp-ink-faint)"
                />
              );
            })}
            {edges.map((edge) => {
              const from = board.nodes.find((node) => node.id === edge.from);
              const to = board.nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;
              const fromPos = nodePosition(from);
              const toPos = nodePosition(to);
              return (
                <Connector
                  key={edge.id}
                  from={{ ...fromPos, width: from.width, height: from.height }}
                  to={{ ...toPos, width: to.width, height: to.height }}
                  color="var(--cvp-ink-soft)"
                />
              );
            })}
          </svg>

          {phaseFlow.map((card: PhaseFlowCard) => (
            <div
              key={card.phase.id}
              className={`${styles.phaseCard} ${card.isCurrent ? styles.phaseCardCurrent : ""}`}
              style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                ["--phase-color" as string]: card.phase.colorToken,
                ["--tilt" as string]: `${rotationForId(`phase-${card.phase.id}`)}deg`,
              }}
              data-wb-node
              data-wb-focus={`phase-${card.phase.id}`}
              data-phase-card={card.phase.id}
              data-current-phase={card.isCurrent || undefined}
              tabIndex={0}
              role="group"
              aria-label={`${card.phase.label} phase card${card.isCurrent ? ", current phase — you are here" : card.isComplete ? ", completed" : ", upcoming"}`}
              onKeyDown={(event) => handleCardKeyDown(event, `phase-${card.phase.id}`)}
            >
              {card.isCurrent ? <span className={styles.youAreHere}>You are here</span> : null}
              {card.isComplete ? (
                <span className={styles.completeTick} aria-hidden>
                  ✓
                </span>
              ) : null}
              <span className={styles.phaseIndex}>
                Phase {card.index + 1} of {WHITEBOARD_PHASES.length}
              </span>
              <span className={styles.phaseLabel}>{card.phase.label}</span>
              <span className={styles.phaseStatus}>
                {card.isCurrent ? "Current phase" : card.isComplete ? "Completed" : "Upcoming"}
              </span>
            </div>
          ))}

          {board.nodes.map((node) => {
            const position = nodePosition(node);
            const definition = phaseDefinition(node.phase);
            const tilt = `${rotationForId(node.id)}deg`;
            const phaseStyle = {
              ["--phase-color" as string]: definition.colorToken,
              ["--tilt" as string]: tilt,
            };
            if (node.kind === "sticky") {
              const excerpt = node.body.length > 48 ? `${node.body.slice(0, 48)}…` : node.body;
              return (
                <div
                  key={node.id}
                  className={`${styles.sticky} ${drag?.nodeId === node.id ? styles.stickyDragging : ""}`}
                  style={{
                    left: position.x,
                    top: position.y,
                    width: node.width,
                    minHeight: node.height,
                    ...phaseStyle,
                  }}
                  data-phase={node.phase}
                  data-wb-node
                  data-wb-focus={node.id}
                  data-sticky-id={node.id}
                  tabIndex={0}
                  role="group"
                  aria-label={`Sticky note, ${definition.label} phase: ${node.body}`}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={handleNodePointerUp}
                  onKeyDown={(event) => handleCardKeyDown(event, node.id)}
                  onDoubleClick={() => startEditing(node)}
                >
                  {editingId === node.id ? (
                    <textarea
                      className={styles.stickyEditor}
                      value={editDraft}
                      aria-label="Edit sticky note text"
                      autoFocus
                      onChange={(event) => setEditDraft(event.target.value)}
                      onBlur={commitEditing}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditingId(null);
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          commitEditing();
                        }
                        event.stopPropagation();
                      }}
                    />
                  ) : (
                    <p className={styles.stickyBody}>{node.body}</p>
                  )}
                  <div className={styles.stickyFooter}>
                    <div className={styles.swatches} role="group" aria-label="Note color">
                      {WHITEBOARD_PHASES.map((phase) => (
                        <button
                          key={phase.id}
                          type="button"
                          className={styles.swatch}
                          style={{ ["--phase-color" as string]: phase.colorToken }}
                          aria-label={`Set note color to ${phase.label}`}
                          aria-pressed={node.phase === phase.id}
                          onClick={() =>
                            updateWhiteboardSticky({
                              projectId: id,
                              nodeId: node.id,
                              phase: phase.id as WhiteboardPhaseId,
                            })
                          }
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className={styles.stickyAction}
                      aria-label={`Edit note: ${excerpt}`}
                      onClick={() => startEditing(node)}
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={styles.stickyAction}
                      aria-label={`Delete note: ${excerpt}`}
                      onClick={() => deleteWhiteboardNode({ projectId: id, nodeId: node.id })}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={node.id}
                className={styles.card}
                style={{
                  left: position.x,
                  top: position.y,
                  width: node.width,
                  minHeight: node.height,
                  ...phaseStyle,
                }}
                data-wb-node
                data-wb-focus={node.id}
                data-card-id={node.id}
                tabIndex={0}
                role="group"
                aria-label={`${node.title} card, ${definition.label} phase`}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                onKeyDown={(event) => handleCardKeyDown(event, node.id)}
              >
                <span className={styles.cardPhase}>{definition.label}</span>
                <span className={styles.cardTitle}>{node.title}</span>
                <p className={styles.cardBody}>{node.body}</p>
                <div className={styles.cardFooter}>
                  <button
                    type="button"
                    className={styles.stickyAction}
                    aria-label={`Delete card: ${node.title}`}
                    onClick={() => deleteWhiteboardNode({ projectId: id, nodeId: node.id })}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {board.nodes.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyPanel} role="status" data-wb-ui>
              <StickyNoteIcon size={28} aria-hidden />
              <h2 className={styles.emptyTitle}>This board is a blank page</h2>
              <p className={styles.emptyCopy}>
                Start from a template to lay out the work, or drop a sticky note anywhere on the
                canvas.
              </p>
              <div className={styles.emptyActions}>
                {WHITEBOARD_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
                    onClick={() => applyTemplateById(template.id)}
                    aria-label={`Start with the ${template.name} template`}
                  >
                    <LayoutTemplate size={15} aria-hidden /> {template.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.zoomControls} role="group" aria-label="Canvas zoom" data-wb-ui>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            aria-label="Zoom out"
          >
            <Minus size={15} aria-hidden />
          </button>
          <span className={styles.zoomLevel} aria-live="polite" aria-label="Current zoom level">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => zoomBy(ZOOM_STEP)}
            aria-label="Zoom in"
          >
            <Plus size={15} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => setViewport(INITIAL_VIEWPORT)}
            aria-label="Reset zoom and pan"
          >
            <RotateCcw size={15} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
