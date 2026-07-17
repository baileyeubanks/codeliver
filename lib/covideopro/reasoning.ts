/**
 * Co-VideoPro — reasoning engine v1 (deterministic).
 *
 * Transcript → segment features → sound-bite scores → proposed radio cuts.
 * No LLM: every output is traceable to segment ids and explainable from the
 * heuristic inputs. LLM-backed passes (Hermes) build on these primitives and
 * must keep the same provenance discipline (docs/COVIDEOPRO_COMPETITIVE_TEARDOWN.md §4).
 */

export interface ReasoningSegment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  speaker: string;
  text: string;
}

export interface SegmentFeatures {
  segmentId: string;
  duration: number;
  wordCount: number;
  wordsPerSecond: number;
  hasQuestion: boolean;
  hasNumber: boolean;
  emotionalHits: string[];
}

export interface ScoredSegment extends SegmentFeatures {
  score: number;
  rationale: string[];
}

const EMOTIONAL_KEYWORDS = [
  "trust", "failed", "failure", "turnaround", "story", "remember", "never", "always",
  "changed", "change", "afraid", "proud", "love", "hate", "best", "worst", "first time",
  "stopped being", "that's when", "no one", "everyone",
];

const FILLER_PHRASES = ["um", "uh", "you know", "like i said", "sort of", "kind of"];

export function segmentFeatures(segment: ReasoningSegment): SegmentFeatures {
  const duration = Math.max(0.1, segment.end_seconds - segment.start_seconds);
  const words = segment.text.trim().split(/\s+/).filter(Boolean);
  const lower = segment.text.toLowerCase();
  return {
    segmentId: segment.id,
    duration,
    wordCount: words.length,
    wordsPerSecond: words.length / duration,
    hasQuestion: segment.text.includes("?"),
    hasNumber: /\d/.test(segment.text),
    emotionalHits: EMOTIONAL_KEYWORDS.filter((keyword) => lower.includes(keyword)),
  };
}

/**
 * Sound-bite score (0–100): rewards conversational pace, emotional content,
 * concrete numbers, and complete thoughts; penalizes questions (usually the
 * host's), filler, and fragments. Heuristic v1 — tune against editor feedback.
 */
export function scoreSegment(segment: ReasoningSegment): ScoredSegment {
  const features = segmentFeatures(segment);
  const rationale: string[] = [];
  let score = 40;

  // Pace sweet spot: 1.6–2.6 words/sec reads as natural, engaged speech.
  if (features.wordsPerSecond >= 1.6 && features.wordsPerSecond <= 2.6) {
    score += 15;
    rationale.push("natural pace");
  } else if (features.wordsPerSecond < 0.8) {
    score -= 10;
    rationale.push("dragging pace");
  }

  if (features.emotionalHits.length > 0) {
    score += Math.min(25, features.emotionalHits.length * 10);
    rationale.push(`emotional content (${features.emotionalHits.slice(0, 2).join(", ")})`);
  }
  if (features.hasNumber) {
    score += 8;
    rationale.push("concrete detail");
  }
  if (features.hasQuestion) {
    score -= 12;
    rationale.push("question (likely host)");
  }
  if (features.wordCount < 6) {
    score -= 15;
    rationale.push("fragment");
  }
  const lower = segment.text.toLowerCase();
  if (FILLER_PHRASES.some((phrase) => lower.includes(phrase))) {
    score -= 8;
    rationale.push("filler");
  }
  // Sound-bite duration sweet spot for social/extracts.
  if (features.duration >= 8 && features.duration <= 45) {
    score += 10;
    rationale.push("bite-sized");
  }

  return {
    ...features,
    score: Math.max(0, Math.min(100, Math.round(score))),
    rationale,
  };
}

export function rankSegments(segments: ReasoningSegment[]): ScoredSegment[] {
  return segments.map(scoreSegment).sort((a, b) => b.score - a.score);
}

export interface RadioCutProposal {
  segmentIds: string[];
  totalSeconds: number;
  score: number;
  rationale: string[];
}

/**
 * Greedy chronological radio cut: take the strongest segments that fit the
 * target duration, then restore source order. Never reorders the conversation
 * — a truthful cut, not a remix.
 */
export function proposeRadioCut(
  segments: ReasoningSegment[],
  targetSeconds: number,
): RadioCutProposal {
  const ranked = rankSegments(segments).filter((segment) => segment.wordCount >= 6 && !segment.hasQuestion);
  const picked: ScoredSegment[] = [];
  let total = 0;
  for (const candidate of ranked) {
    if (total + candidate.duration > targetSeconds && picked.length > 0) continue;
    picked.push(candidate);
    total += candidate.duration;
    if (total >= targetSeconds * 0.85) break;
  }
  picked.sort((a, b) => {
    const aSeg = segments.find((segment) => segment.id === a.segmentId);
    const bSeg = segments.find((segment) => segment.id === b.segmentId);
    return (aSeg?.start_seconds ?? 0) - (bSeg?.start_seconds ?? 0);
  });

  return {
    segmentIds: picked.map((segment) => segment.segmentId),
    totalSeconds: Math.round(total * 10) / 10,
    score: picked.length === 0 ? 0 : Math.round(picked.reduce((sum, segment) => sum + segment.score, 0) / picked.length),
    rationale: picked.map((segment) => `${segment.segmentId}: ${segment.rationale.join(", ") || "base score"}`),
  };
}
