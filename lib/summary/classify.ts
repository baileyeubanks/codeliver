/**
 * P21 — Rule-based comment classification for the producer review summary.
 *
 * This is an honest heuristic classifier: deterministic keyword/pattern rules
 * over the comment body. There is no AI behind it. Every result is a
 * *suggestion* a producer can override, and every suggestion reports the
 * signals that fired so the reasoning stays inspectable.
 */

export const SUMMARY_CLASSIFICATIONS = [
  "required_correction",
  "creative_preference",
  "new_request",
  "contradictory",
  "out_of_scope",
  "technical",
  "question",
  "approval",
  "deferred",
] as const;

export type SummaryClassification = (typeof SUMMARY_CLASSIFICATIONS)[number];

export interface ClassificationResult {
  classification: SummaryClassification;
  /**
   * "rule" — at least one heuristic pattern matched.
   * "fallback" — nothing matched; the default class is a guess and the UI
   * must present it as low-confidence.
   */
  basis: "rule" | "fallback";
  /** Human-readable names of the patterns that fired, in rule order. */
  matchedSignals: string[];
}

interface ClassificationRule {
  classification: SummaryClassification;
  signals: Array<{ name: string; pattern: RegExp }>;
}

/**
 * Rules are evaluated in order; the first rule with any signal match wins.
 * Order encodes priority: explicit approval / questions / scope and deferral
 * statements beat change demands, which beat soft creative preferences.
 */
const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    classification: "approval",
    signals: [
      { name: "explicit-approval", pattern: /\b(approved?|sign(?:ed)?[- ]?off|lgtm|ship it|love (it|this))\b/i },
      { name: "no-changes", pattern: /\bno (further|more|other) changes\b/i },
      { name: "works-as-is", pattern: /\b(looks good|works (for me|here|as[- ]is)|good to go|happy with this)\b/i },
    ],
  },
  {
    classification: "question",
    signals: [
      { name: "question-mark", pattern: /\?\s*$/ },
      { name: "interrogative", pattern: /^(can|could|would|should|is|are|do|does|did|what|why|how|when|which|who)\b.{0,200}\?/i },
      { name: "confirm-request", pattern: /\bcan (we|you) confirm\b/i },
    ],
  },
  {
    classification: "out_of_scope",
    signals: [
      { name: "out-of-scope", pattern: /\b(out of scope|outside (the|this) scope|scope creep)\b/i },
      { name: "other-deliverable", pattern: /\b(other|different|separate) (deliverable|video|project|spot|asset)\b/i },
      { name: "not-this-deliverable", pattern: /\bnot (for )?this (deliverable|video|cut|project|asset)\b/i },
    ],
  },
  {
    classification: "deferred",
    signals: [
      { name: "defer", pattern: /\b(defer|punt|parking lot|table (this|it)|follow[- ]?up)\b/i },
      { name: "later-version", pattern: /\b(next (version|pass|round|revision)|v\d+|later pass|can wait|not a blocker|won't block|after (this|the) (review|round|delivery))\b/i },
    ],
  },
  {
    classification: "contradictory",
    signals: [
      { name: "self-retraction", pattern: /\b(scratch that|disregard|ignore (my )?(previous|earlier|last)|on second thought|actually,? never ?mind)\b/i },
      { name: "revises-earlier-note", pattern: /\b(revises?|replaces?|supersedes?) (my )?(earlier|previous|last) (note|comment|request)\b/i },
    ],
  },
  {
    classification: "technical",
    signals: [
      { name: "audio-technical", pattern: /\b(loudness|lufs|db\b|decibel|audio (sync|mix|levels?)|peaking|clipping|mix|dialogue levels?)\b/i },
      { name: "picture-technical", pattern: /\b(codec|bitrate|frame ?rate|fps|resolution|color ?space|gamma|white balance|compression artifacts?|dropouts?|glitch|flicker|render|export|transcode)\b/i },
      { name: "caption-technical", pattern: /\b(captions?|subtitles?|lower third safe|title safe|safe margins?)\b/i },
    ],
  },
  {
    classification: "new_request",
    signals: [
      { name: "new-deliverable", pattern: /\b(cutdown|teaser|trailer|(15|30|60)[- ]second (cut|version|spot)|vertical version|square version|social (cut|version|clip))\b/i },
      { name: "additional-ask", pattern: /\b(can we (also )?(get|have|add)|could we (also )?(get|have|add)|please (add|create|record|deliver|provide)|one more|also need|in addition)\b/i },
      { name: "new-work", pattern: /\bnew (version|deliverable|asset|shot|scene|graphic|voice ?over)\b/i },
    ],
  },
  {
    classification: "required_correction",
    signals: [
      { name: "imperative-fix", pattern: /\b(fix|correct|repair|remove|delete|cut (out|the)|trim|mute|replace|swap|blur)\b/i },
      { name: "must-change", pattern: /\b(must|needs? to|has to|have to|required?|mandatory)\b/i },
      { name: "defect", pattern: /\b(typo|misspell|wrong|error|mistake|incorrect|broken|missing)\b/i },
      { name: "compliance", pattern: /\b(legal|compliance|trademark|copyright|licen[cs]e|usage rights?)\b/i },
    ],
  },
  {
    classification: "creative_preference",
    signals: [
      { name: "subjective", pattern: /\b(prefer|feel|feels|felt|i think|in my opinion|imo\b|maybe|might|could be|would be nice|suggestion)\b/i },
      { name: "pacing", pattern: /\b(beat|pace|pacing|rhythm|tempo|tighter|punchier|energy|earlier|later|half a second|half second|breath|breathe)\b/i },
      { name: "taste", pattern: /\b(vibe|mood|tone|warmer|cooler|softer|bolder|elegant|fun)\b/i },
    ],
  },
];

export const FALLBACK_CLASSIFICATION: SummaryClassification = "creative_preference";

/** Classify a single comment body. Pure and deterministic. */
export function classifyComment(body: string): ClassificationResult {
  const text = body.trim();
  for (const rule of CLASSIFICATION_RULES) {
    const matchedSignals = rule.signals
      .filter((signal) => signal.pattern.test(text))
      .map((signal) => signal.name);
    if (matchedSignals.length > 0) {
      return { classification: rule.classification, basis: "rule", matchedSignals };
    }
  }
  return { classification: FALLBACK_CLASSIFICATION, basis: "fallback", matchedSignals: [] };
}

/** Display label for a classification, shared by UI, API, and print view. */
export const CLASSIFICATION_LABELS: Record<SummaryClassification, string> = {
  required_correction: "Required correction",
  creative_preference: "Creative preference",
  new_request: "New request",
  contradictory: "Contradictory",
  out_of_scope: "Out of scope",
  technical: "Technical",
  question: "Question",
  approval: "Approval",
  deferred: "Deferred",
};

/**
 * Resolve the effective classification: a producer's override always wins;
 * otherwise the suggested (heuristic) class stands.
 */
export function resolveClassification(
  suggested: ClassificationResult,
  override: SummaryClassification | null | undefined,
): SummaryClassification {
  return override ?? suggested.classification;
}

/** Type guard for untrusted override input (API payloads, localStorage). */
export function isSummaryClassification(value: unknown): value is SummaryClassification {
  return (
    typeof value === "string" &&
    (SUMMARY_CLASSIFICATIONS as readonly string[]).includes(value)
  );
}
