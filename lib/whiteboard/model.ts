/**
 * Whiteboard board model — phases, nodes, edges. Pure data + pure transforms,
 * no DOM. Serializable shapes double as the demo-store persistence format.
 */

export const WHITEBOARD_PHASE_IDS = [
  "strategy",
  "preproduction",
  "production",
  "post",
  "delivery",
] as const;

export type WhiteboardPhaseId = (typeof WHITEBOARD_PHASE_IDS)[number];

export interface WhiteboardPhaseDefinition {
  id: WhiteboardPhaseId;
  label: string;
  /** CSS custom property carrying the canon phase color (see app/brand-tokens.css). */
  colorToken: string;
}

export const WHITEBOARD_PHASES: readonly WhiteboardPhaseDefinition[] = [
  { id: "strategy", label: "Strategy", colorToken: "var(--cvp-phase-strategy)" },
  { id: "preproduction", label: "Pre-Production", colorToken: "var(--cvp-phase-preproduction)" },
  { id: "production", label: "Production", colorToken: "var(--cvp-phase-production)" },
  { id: "post", label: "Post", colorToken: "var(--cvp-phase-post)" },
  { id: "delivery", label: "Delivery", colorToken: "var(--cvp-phase-delivery)" },
];

/**
 * Map the Project Operating Record lifecycle stage (lib/covideopro/record.ts
 * PROJECT_STAGES) onto the five whiteboard phases. Truthful by construction:
 * the whiteboard never invents its own "current phase".
 */
export function mapStageToPhase(stage: string): WhiteboardPhaseId {
  switch (stage) {
    case "inquiry":
    case "intake":
    case "development":
      return "strategy";
    case "preproduction":
      return "preproduction";
    case "production":
      return "production";
    case "post":
    case "review":
      return "post";
    case "delivery":
    case "archived":
      return "delivery";
    default:
      return "strategy";
  }
}

export type WhiteboardNodeKind = "sticky" | "card";

/** Sticky colors come from the phase palette only (canon phase coding). */
export type WhiteboardStickyColor = WhiteboardPhaseId;

export interface WhiteboardNode {
  id: string;
  kind: WhiteboardNodeKind;
  /** Phase this node belongs to — drives the card/sticky color. */
  phase: WhiteboardPhaseId;
  title: string;
  body: string;
  /** World coordinates (snapped to the grid). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WhiteboardEdge {
  id: string;
  from: string;
  to: string;
}

export interface WhiteboardBoardContent {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
}

/* ------------------------------------------------------------------ */
/* Phase flow lane (derived — never persisted)                         */
/* ------------------------------------------------------------------ */

export const PHASE_CARD_WIDTH = 220;
export const PHASE_CARD_HEIGHT = 132;
export const PHASE_CARD_GAP = 120;
export const PHASE_FLOW_ORIGIN_X = 64;
export const PHASE_FLOW_ORIGIN_Y = 96;

export interface PhaseFlowCard {
  phase: WhiteboardPhaseDefinition;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isCurrent: boolean;
  isComplete: boolean;
}

/** Horizontal swimlane Strategy → … → Delivery, with the current phase flagged. */
export function buildPhaseFlow(currentStage: string): PhaseFlowCard[] {
  const currentPhase = mapStageToPhase(currentStage);
  const currentIndex = WHITEBOARD_PHASE_IDS.indexOf(currentPhase);
  return WHITEBOARD_PHASES.map((phase, index) => ({
    phase,
    index,
    x: PHASE_FLOW_ORIGIN_X + index * (PHASE_CARD_WIDTH + PHASE_CARD_GAP),
    y: PHASE_FLOW_ORIGIN_Y,
    width: PHASE_CARD_WIDTH,
    height: PHASE_CARD_HEIGHT,
    isCurrent: index === currentIndex,
    isComplete: index < currentIndex,
  }));
}

/* ------------------------------------------------------------------ */
/* Node helpers                                                        */
/* ------------------------------------------------------------------ */

export function phaseDefinition(phase: WhiteboardPhaseId): WhiteboardPhaseDefinition {
  const definition = WHITEBOARD_PHASES.find((candidate) => candidate.id === phase);
  if (!definition) throw new Error(`Unknown whiteboard phase: ${phase}`);
  return definition;
}

export function findNode(nodes: WhiteboardNode[], id: string): WhiteboardNode | null {
  return nodes.find((node) => node.id === id) ?? null;
}

/** Edges whose endpoints both still exist (defensive against dangling ids). */
export function liveEdges(content: WhiteboardBoardContent): WhiteboardEdge[] {
  return content.edges.filter(
    (edge) => findNode(content.nodes, edge.from) && findNode(content.nodes, edge.to),
  );
}
