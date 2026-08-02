const CONTRIBUTOR_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "producer",
  "editor",
  "member",
]);

const SEMANTIC_FIELDS = [
  "objectives",
  "audiences",
  "keyMessages",
  "requestedDeliverables",
  "constraints",
  "references",
  "successCriteria",
] as const;

const MAX_TITLE_LENGTH = 240;
const MAX_ITEMS_PER_GROUP = 40;
const MAX_ITEM_LENGTH = 1_000;
const MAX_TOTAL_ITEMS = 200;
const MAX_TOTAL_CHARACTERS = 32_000;

type ProjectBriefSemanticField = (typeof SEMANTIC_FIELDS)[number];

export interface ProjectBriefDisplay {
  readonly revisionNumber: number;
  readonly title: string;
  readonly objectives: readonly string[];
  readonly audiences: readonly string[];
  readonly keyMessages: readonly string[];
  readonly requestedDeliverables: readonly string[];
  readonly constraints: readonly string[];
  readonly references: readonly string[];
  readonly successCriteria: readonly string[];
}

interface DisplayBudget {
  characters: number;
  items: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

function semanticArray(value: unknown, budget: DisplayBudget) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS_PER_GROUP) return null;

  const normalized: string[] = [];
  for (const item of value) {
    const text = boundedString(item, MAX_ITEM_LENGTH);
    if (!text) return null;

    budget.items += 1;
    budget.characters += text.length;
    if (
      budget.items > MAX_TOTAL_ITEMS ||
      budget.characters > MAX_TOTAL_CHARACTERS
    ) {
      return null;
    }
    normalized.push(text);
  }

  return normalized;
}

export function canAccessProjectBriefDisplay(role: string) {
  return CONTRIBUTOR_ROLES.has(role);
}

export function parseProjectBriefDisplay(
  operatingRecord: unknown,
  role: string,
): ProjectBriefDisplay | null {
  if (!canAccessProjectBriefDisplay(role) || !isRecord(operatingRecord)) {
    return null;
  }

  const context = operatingRecord.context;
  if (!isRecord(context) || !isRecord(context.brief)) return null;

  const brief = context.brief;
  const revisionNumber = brief.revisionNumber;
  const title = boundedString(brief.title, MAX_TITLE_LENGTH);
  if (
    typeof revisionNumber !== "number" ||
    !Number.isSafeInteger(revisionNumber) ||
    revisionNumber < 1 ||
    revisionNumber > 2_147_483_647 ||
    !title
  ) {
    return null;
  }

  const budget: DisplayBudget = { characters: title.length, items: 0 };
  const semantics = {} as Record<ProjectBriefSemanticField, string[]>;
  for (const field of SEMANTIC_FIELDS) {
    const values = semanticArray(brief[field], budget);
    if (!values) return null;
    semantics[field] = values;
  }

  return {
    revisionNumber,
    title,
    objectives: semantics.objectives,
    audiences: semantics.audiences,
    keyMessages: semantics.keyMessages,
    requestedDeliverables: semantics.requestedDeliverables,
    constraints: semantics.constraints,
    references: semantics.references,
    successCriteria: semantics.successCriteria,
  };
}
