/**
 * Co-VideoPro — Adaptive Discovery (Webster blueprint §6.1).
 *
 * One intelligent question at a time, each with a visible "why this matters".
 * Raw answers are kept; a normalized structured summary is derived
 * deterministically. Unknowns and conflicts are first-class, never hidden.
 */

import type { DiscoveryAnswer, DiscoverySession } from "./record.ts";

export interface DiscoveryQuestion {
  id: string;
  field: "goal" | "audience" | "deliverables" | "timeline" | "budget" | "references" | "stakeholders" | "risks";
  question: string;
  why: string;
}

export const DISCOVERY_QUESTIONS: readonly DiscoveryQuestion[] = [
  {
    id: "goal",
    field: "goal",
    question: "What should this production achieve — in one sentence?",
    why: "Every later decision (scope, cut, even music) gets measured against this. A vague answer now costs a revision round later.",
  },
  {
    id: "audience",
    field: "audience",
    question: "Who exactly is it for, and what should they think or do after watching?",
    why: "Audience determines tone, length, and where the film lives. 'Everyone' is not an audience.",
  },
  {
    id: "deliverables",
    field: "deliverables",
    question: "What must exist at the end — films, cutdowns, stills, captions, languages?",
    why: "Deliverables drive the estimate. A 9:16 cutdown found after greenlight is a change order, not a favor.",
  },
  {
    id: "timeline",
    field: "timeline",
    question: "What dates are fixed — event, launch, board meeting — and what's flexible?",
    why: "Fixed dates set the working-backward schedule and whether prep time is realistic.",
  },
  {
    id: "budget",
    field: "budget",
    question: "What budget band are we working in, even roughly?",
    why: "A band lets the estimate meet you where you are instead of guessing. It stays confidential to the workspace.",
  },
  {
    id: "references",
    field: "references",
    question: "Any references — films you love, hate, or must beat? Links welcome.",
    why: "References communicate taste faster than adjectives. They become the visual bar for the brief.",
  },
  {
    id: "stakeholders",
    field: "stakeholders",
    question: "Who must approve this, and who else will have opinions?",
    why: "Hidden approvers surface in round 3. Naming them now shapes the review chain.",
  },
  {
    id: "risks",
    field: "risks",
    question: "What could kill or delay this — access, weather, people, permissions?",
    why: "Known risks become plan items and contingencies instead of day-of surprises.",
  },
] as const;

export interface NormalizedDiscovery {
  objectives: string;
  audience: string;
  message: string;
  references: string[];
  deliverables_notes: string;
  stakeholders_notes: string;
  timeline_notes: string;
  budget_band: string;
  risk_notes: string;
  /** Question ids with no useful answer (unknown or conflicted). */
  missingFields: string[];
  /** Share of questions answered with usable content (0–1). */
  completeness: number;
}

function usable(answer: DiscoveryAnswer | undefined): answer is DiscoveryAnswer {
  return Boolean(answer && answer.status === "answered" && answer.raw_text.trim().length > 0);
}

/** Deterministic normalization — raw answers become the structured brief seed. */
export function normalizeDiscovery(
  questions: readonly DiscoveryQuestion[],
  answers: DiscoveryAnswer[],
): NormalizedDiscovery {
  const byQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  const text = (id: string) => {
    const answer = byQuestion.get(id);
    return usable(answer) ? answer.raw_text.trim() : "";
  };
  const missingFields = questions
    .filter((question) => !usable(byQuestion.get(question.id)))
    .map((question) => question.id);

  const references = text("references")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    objectives: text("goal"),
    audience: text("audience"),
    message: text("audience"),
    references,
    deliverables_notes: text("deliverables"),
    stakeholders_notes: text("stakeholders"),
    timeline_notes: text("timeline"),
    budget_band: text("budget"),
    risk_notes: text("risks"),
    missingFields,
    completeness: (questions.length - missingFields.length) / questions.length,
  };
}

/** The next question to ask: answered and unknown are closed; conflicted can be re-asked. */
export function nextDiscoveryQuestion(
  questions: readonly DiscoveryQuestion[],
  answers: DiscoveryAnswer[],
): DiscoveryQuestion | null {
  const closed = new Set(
    answers
      .filter((answer) => answer.status === "answered" || answer.status === "unknown")
      .map((answer) => answer.question_id),
  );
  return questions.find((question) => !closed.has(question.id)) ?? null;
}

export function discoveryProgress(questions: readonly DiscoveryQuestion[], answers: DiscoveryAnswer[]): {
  answered: number;
  total: number;
} {
  const answered = new Set(
    answers.filter((answer) => answer.status === "answered").map((answer) => questionIdOf(answer)),
  );
  void answered;
  const count = answers.filter((answer) => answer.status === "answered").length;
  return { answered: count, total: questions.length };
}

function questionIdOf(answer: DiscoveryAnswer): string {
  return answer.question_id;
}
