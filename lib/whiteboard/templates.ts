/**
 * Whiteboard starter templates — pure transforms over board content.
 * Applying a template appends its cards/edges; the caller keeps the prior
 * content as the undo snapshot (undo = restore the snapshot).
 */

import { snapToGrid } from "./geometry.ts";
import type {
  WhiteboardBoardContent,
  WhiteboardEdge,
  WhiteboardNode,
  WhiteboardPhaseId,
} from "./model.ts";

export const WHITEBOARD_TEMPLATE_IDS = ["brand-film", "social-campaign"] as const;
export type WhiteboardTemplateId = (typeof WHITEBOARD_TEMPLATE_IDS)[number];

export interface WhiteboardTemplateDefinition {
  id: WhiteboardTemplateId;
  name: string;
  description: string;
}

export const WHITEBOARD_TEMPLATES: readonly WhiteboardTemplateDefinition[] = [
  {
    id: "brand-film",
    name: "Brand film",
    description: "Brief → script → shoot → cut → delivery for a single hero film.",
  },
  {
    id: "social-campaign",
    name: "Social campaign",
    description: "Concept → shot list → batch shoot → edits → channel rollout.",
  },
];

interface TemplateCardSeed {
  key: string;
  phase: WhiteboardPhaseId;
  title: string;
  body: string;
  /** Column/row offsets in grid cells from the template anchor. */
  col: number;
  row: number;
}

interface TemplateSeed {
  cards: TemplateCardSeed[];
  /** Pairs of card keys connected in reading order. */
  links: Array<[string, string]>;
}

const TEMPLATE_CARD_WIDTH = 208;
const TEMPLATE_CARD_HEIGHT = 112;
const TEMPLATE_CELL_X = 256;
const TEMPLATE_CELL_Y = 176;

const TEMPLATE_SEEDS: Record<WhiteboardTemplateId, TemplateSeed> = {
  "brand-film": {
    cards: [
      { key: "brief", phase: "strategy", title: "Creative brief", body: "Audience, message, tone.", col: 0, row: 0 },
      { key: "script", phase: "preproduction", title: "Script + boards", body: "Locked script, storyboards, casting.", col: 1, row: 0 },
      { key: "shoot", phase: "production", title: "Shoot days", body: "Call sheets, crew, locations.", col: 2, row: 0 },
      { key: "cut", phase: "post", title: "Rough cut → final", body: "Edit rounds, color, mix.", col: 3, row: 0 },
      { key: "delivery", phase: "delivery", title: "Delivery", body: "Masters + captions, client approval.", col: 4, row: 0 },
    ],
    links: [
      ["brief", "script"],
      ["script", "shoot"],
      ["shoot", "cut"],
      ["cut", "delivery"],
    ],
  },
  "social-campaign": {
    cards: [
      { key: "concept", phase: "strategy", title: "Campaign concept", body: "Hook, pillars, channels.", col: 0, row: 0 },
      { key: "shotlist", phase: "preproduction", title: "Shot list", body: "Vertical-first setups per pillar.", col: 1, row: 0 },
      { key: "batch", phase: "production", title: "Batch shoot", body: "One day, many assets.", col: 2, row: 0 },
      { key: "edits", phase: "post", title: "Edit batch", body: "Cutdowns, captions, hooks.", col: 2, row: 1 },
      { key: "rollout", phase: "delivery", title: "Channel rollout", body: "Schedule + publish per channel.", col: 3, row: 1 },
    ],
    links: [
      ["concept", "shotlist"],
      ["shotlist", "batch"],
      ["batch", "edits"],
      ["edits", "rollout"],
    ],
  },
};

export interface TemplateApplication {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
}

/**
 * Append a template's cards + connectors to the board content. Ids are minted
 * from `createId` so repeated applications never collide; positions snap to
 * the grid starting at `anchor` (world coordinates).
 */
export function applyTemplate(
  content: WhiteboardBoardContent,
  templateId: WhiteboardTemplateId,
  anchor: { x: number; y: number },
  createId: (prefix: string) => string,
): TemplateApplication {
  const seed = TEMPLATE_SEEDS[templateId];
  if (!seed) throw new Error(`Unknown whiteboard template: ${templateId}`);

  const originX = snapToGrid(anchor.x);
  const originY = snapToGrid(anchor.y);
  const idByKey = new Map<string, string>();

  const nodes: WhiteboardNode[] = seed.cards.map((card) => {
    const id = createId(`wb-card-${templateId}`);
    idByKey.set(card.key, id);
    return {
      id,
      kind: "card",
      phase: card.phase,
      title: card.title,
      body: card.body,
      x: originX + card.col * TEMPLATE_CELL_X,
      y: originY + card.row * TEMPLATE_CELL_Y,
      width: TEMPLATE_CARD_WIDTH,
      height: TEMPLATE_CARD_HEIGHT,
    };
  });

  const edges: WhiteboardEdge[] = seed.links.map(([fromKey, toKey]) => ({
    id: createId("wb-edge"),
    from: idByKey.get(fromKey) as string,
    to: idByKey.get(toKey) as string,
  }));

  return {
    nodes: [...content.nodes, ...nodes],
    edges: [...content.edges, ...edges],
  };
}

/**
 * Undo a template application by restoring the snapshot taken before apply.
 * Kept as an explicit transform so undo semantics stay testable in one place.
 */
export function undoTemplateApplication(snapshot: WhiteboardBoardContent): WhiteboardBoardContent {
  return { nodes: [...snapshot.nodes], edges: [...snapshot.edges] };
}
