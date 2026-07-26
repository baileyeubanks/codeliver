/**
 * Calendar placement for the project workspace (P24).
 *
 * A Sunday-start month grid plus the project's dated events — shoot days,
 * review deadlines, deliveries, tasks, milestones — collected only from real
 * seeds. Undated records never invent dates; datetimes reduce to date keys.
 */

import { toDateKey } from "./dates.ts";

export interface CalendarDayCell {
  /** `YYYY-MM-DD` */
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Sunday-start weeks covering the whole month (4–6 rows). `today` is a
 * `YYYY-MM-DD` key, injected so the grid stays pure and testable.
 */
export function buildCalendarGrid(
  year: number,
  month: number,
  today: string,
): CalendarDayCell[][] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startOffset = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weekCount = Math.ceil((startOffset + daysInMonth) / 7);

  const weeks: CalendarDayCell[][] = [];
  for (let week = 0; week < weekCount; week += 1) {
    const cells: CalendarDayCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const offset = week * 7 + weekday - startOffset;
      const cellDate = new Date(Date.UTC(year, month, 1 + offset));
      const key = dateKey(
        cellDate.getUTCFullYear(),
        cellDate.getUTCMonth(),
        cellDate.getUTCDate(),
      );
      cells.push({
        date: key,
        day: cellDate.getUTCDate(),
        inMonth: offset >= 0 && offset < daysInMonth,
        isToday: key === today,
      });
    }
    weeks.push(cells);
  }
  return weeks;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export type ProjectEventType = "shoot" | "review" | "milestone" | "delivery" | "task" | "meeting";

export interface ProjectEvent {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  type: ProjectEventType;
  label: string;
  detail?: string;
}

export const PROJECT_EVENT_TYPE_LABELS: Record<ProjectEventType, string> = {
  shoot: "Shoot",
  review: "Review deadline",
  milestone: "Milestone",
  delivery: "Delivery",
  task: "Task",
  meeting: "Meeting",
};

/** Milestones whose title mentions a cut/review/approval read as review deadlines. */
const REVIEW_DEADLINE_PATTERN = /review|cut|approval|feedback/i;

export function collectProjectEvents(input: {
  planItems: readonly {
    id: string;
    kind: string;
    title: string;
    date: string | null;
    status: string;
  }[];
  productionDays: readonly { id: string; date: string; type: string; notes?: string }[];
  deliverables: readonly { id: string; name: string; status: string; delivered_at: string | null }[];
}): ProjectEvent[] {
  const events: ProjectEvent[] = [];

  for (const item of input.planItems) {
    if (!item.date) continue;
    const type: ProjectEventType =
      item.kind === "production_day"
        ? "shoot"
        : item.kind === "milestone"
          ? REVIEW_DEADLINE_PATTERN.test(item.title)
            ? "review"
            : "milestone"
          : "task";
    events.push({ id: item.id, date: toDateKey(item.date), type, label: item.title });
  }

  for (const day of input.productionDays) {
    if (!day.date) continue;
    events.push({
      id: day.id,
      date: toDateKey(day.date),
      type: "shoot",
      label: day.type === "principal" ? "Shoot day" : `Shoot (${day.type})`,
      detail: day.notes,
    });
  }

  for (const deliverable of input.deliverables) {
    if (!deliverable.delivered_at) continue;
    events.push({
      id: deliverable.id,
      date: toDateKey(deliverable.delivered_at),
      type: "delivery",
      label: `Delivered ${deliverable.name}`,
    });
  }

  return events;
}

/** Bucket events by date key; stable order within a day (shoots first). */
export function groupEventsByDate(
  events: readonly ProjectEvent[],
): Record<string, ProjectEvent[]> {
  const order: ProjectEventType[] = ["shoot", "review", "delivery", "milestone", "task", "meeting"];
  const sorted = [...events].sort(
    (a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.label.localeCompare(b.label),
  );
  const grouped: Record<string, ProjectEvent[]> = {};
  for (const event of sorted) {
    (grouped[event.date] ??= []).push(event);
  }
  return grouped;
}
