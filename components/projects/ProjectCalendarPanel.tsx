"use client";

/**
 * P24 Calendar tab — a month grid with shoot dates, review deadlines,
 * deliveries, and task dates from the project record. Today is marked;
 * event chips are typed and colored; months page backward and forward.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildCalendarGrid,
  collectProjectEvents,
  groupEventsByDate,
  PROJECT_EVENT_TYPE_LABELS,
  type ProjectEventType,
} from "@/lib/projects/calendar.ts";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import styles from "./ProjectWorkspaceTabs.module.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EVENT_CHIP_CLASS: Record<ProjectEventType, string> = {
  shoot: styles.eventChipShoot,
  review: styles.eventChipReview,
  milestone: styles.eventChipMilestone,
  delivery: styles.eventChipDelivery,
  task: styles.eventChipTask,
  meeting: styles.eventChipMeeting,
};

export default function ProjectCalendarPanel({ projectId }: { projectId: string }) {
  const workspace = useDemoWorkspace();
  const todayKey = new Date().toISOString().slice(0, 10);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });

  const eventsByDate = useMemo(() => {
    const scoped = <T extends { project_id: string }>(rows: readonly T[]) =>
      rows.filter((row) => row.project_id === projectId);
    return groupEventsByDate(
      collectProjectEvents({
        planItems: scoped(workspace.planItems),
        productionDays: scoped(workspace.productionDays),
        deliverables: scoped(workspace.deliverables),
      }),
    );
  }, [workspace.planItems, workspace.productionDays, workspace.deliverables, projectId]);

  const weeks = buildCalendarGrid(monthCursor.year, monthCursor.month, todayKey);
  const presentTypes = [...new Set(Object.values(eventsByDate).flat().map((event) => event.type))];

  function shiftMonth(delta: number) {
    setMonthCursor((cursor) => {
      const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  }

  return (
    <div className={styles.panelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Calendar</h2>
          <p className={styles.panelSubtitle}>
            Shoot dates, review deadlines, deliveries, and task dates from the project record.
          </p>
        </div>
      </div>

      <div className={styles.calendarHeader}>
        <button
          type="button"
          className={styles.calendarNav}
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <h3 className={styles.calendarTitle} aria-live="polite">
          {MONTH_NAMES[monthCursor.month]} {monthCursor.year}
        </h3>
        <button
          type="button"
          className={styles.calendarNav}
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.calendarGrid} role="grid" aria-label={`${MONTH_NAMES[monthCursor.month]} ${monthCursor.year}`}>
        {WEEKDAY_LABELS.map((weekday) => (
          <div key={weekday} className={styles.calendarWeekday} role="columnheader">
            {weekday}
          </div>
        ))}
        {weeks.flat().map((cell) => {
          const dayEvents = eventsByDate[cell.date] ?? [];
          const cellClass = cell.isToday
            ? styles.calendarCellToday
            : cell.inMonth
              ? styles.calendarCell
              : styles.calendarCellOutside;
          return (
            <div
              key={cell.date}
              className={cellClass}
              role="gridcell"
              aria-current={cell.isToday ? "date" : undefined}
              aria-label={dayEvents.length > 0 ? `${cell.date}: ${dayEvents.map((event) => event.label).join(", ")}` : cell.date}
            >
              <span className={cell.inMonth ? styles.calendarDay : styles.calendarDayOutside}>
                {cell.day}
              </span>
              {dayEvents.map((event) => (
                <span key={event.id} className={EVENT_CHIP_CLASS[event.type]} title={event.detail ?? event.label}>
                  {event.label}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      {presentTypes.length > 0 && (
        <div className={styles.legendRow} aria-label="Event types">
          {presentTypes.map((type) => (
            <span key={type} className={styles.legendItem}>
              <span className={EVENT_CHIP_CLASS[type]} aria-hidden="true">&nbsp;</span>
              {PROJECT_EVENT_TYPE_LABELS[type]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
