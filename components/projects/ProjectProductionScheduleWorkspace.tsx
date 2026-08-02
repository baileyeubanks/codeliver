"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  FileStack,
  GripVertical,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkspaceRole } from "@/components/navigation/navigation-model";
import { useProjectProductionSchedule } from "@/lib/hooks/useProjectProductionSchedule";
import {
  PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS,
  PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
  isProjectProductionScheduleSubmittable,
  parseProjectProductionScheduleContent,
  type ProjectProductionScheduleContent,
  type ProjectProductionScheduleDay,
  type ProjectProductionScheduleItem,
  type ProjectProductionScheduleItemKind,
  type ProjectProductionScheduleState,
} from "@/lib/preproduction/production-schedule";
import styles from "./ProjectProductionScheduleWorkspace.module.css";

export interface ProjectProductionScheduleWorkspaceProps {
  projectId: string;
  projectName: string;
  demoMode: boolean;
  workspaceRole: WorkspaceRole;
}

type ScheduleTarget = "unscheduled" | string;

const WRITE_ROLES = new Set<WorkspaceRole>([
  "owner",
  "admin",
  "producer",
  "editor",
]);
const PRODUCER_ROLES = new Set<WorkspaceRole>(["owner", "admin", "producer"]);
const BANNER_KINDS = PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS.filter(
  (kind): kind is Exclude<ProjectProductionScheduleItemKind, "shot"> => kind !== "shot",
);

const KIND_LABELS: Record<ProjectProductionScheduleItemKind, string> = {
  shot: "Shot",
  setup: "Setup",
  meal: "Meal",
  company_move: "Company move",
  break: "Break",
  note: "Note",
};

const BANNER_DEFAULTS: Record<Exclude<ProjectProductionScheduleItemKind, "shot">, string> = {
  setup: "Production setup",
  meal: "Meal break",
  company_move: "Company move",
  break: "Production break",
  note: "Schedule note",
};

function cloneContent(content: ProjectProductionScheduleContent) {
  return structuredClone(content);
}

function normalizeItems(items: readonly ProjectProductionScheduleItem[]) {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function normalizeDays(days: readonly ProjectProductionScheduleDay[]) {
  return days.map((day, index) => ({ ...day, order: index + 1 }));
}

function stableNextId(content: ProjectProductionScheduleContent, prefix: string) {
  const used = new Set([
    ...content.days.map((day) => day.id),
    ...content.unscheduled.map((item) => item.id),
    ...content.days.flatMap((day) => day.items.map((item) => item.id)),
  ]);
  let ordinal = used.size + 1;
  let candidate = `${prefix}-${String(ordinal).padStart(3, "0")}`;
  while (used.has(candidate)) {
    ordinal += 1;
    candidate = `${prefix}-${String(ordinal).padStart(3, "0")}`;
  }
  return candidate;
}

function localDemoSchedule(projectName: string): ProjectProductionScheduleContent {
  return parseProjectProductionScheduleContent({
    schemaVersion: PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
    title: `${projectName} production schedule`,
    timeZone: "America/Chicago",
    days: [
      {
        id: "day-001",
        order: 1,
        date: "2026-07-20",
        unitCallTime: "07:00",
        notes: "Primary photography",
        items: [
          {
            id: "item-001",
            order: 1,
            kind: "setup",
            sourceSceneId: null,
            sourceShotId: null,
            label: "Camera and lighting setup",
            notes: null,
            startTime: "07:00",
            plannedDurationMinutes: 45,
          },
          {
            id: "item-002",
            order: 2,
            kind: "shot",
            sourceSceneId: "scene-001",
            sourceShotId: "shot-001-001",
            label: null,
            notes: "Protect a clean plate after the take.",
            startTime: "07:45",
            plannedDurationMinutes: 60,
          },
          {
            id: "item-003",
            order: 3,
            kind: "shot",
            sourceSceneId: "scene-002",
            sourceShotId: "shot-002-001",
            label: null,
            notes: null,
            startTime: "09:00",
            plannedDurationMinutes: 90,
          },
          {
            id: "item-004",
            order: 4,
            kind: "meal",
            sourceSceneId: null,
            sourceShotId: null,
            label: "Meal break",
            notes: null,
            startTime: "12:00",
            plannedDurationMinutes: 30,
          },
        ],
      },
    ],
    unscheduled: [
      {
        id: "item-005",
        order: 1,
        kind: "shot",
        sourceSceneId: "scene-003",
        sourceShotId: "shot-003-001",
        label: null,
        notes: null,
        startTime: null,
        plannedDurationMinutes: null,
      },
    ],
  });
}

function formatStatus(value: ProjectProductionScheduleState) {
  return value.replaceAll("_", " ");
}

function dayLabel(day: ProjectProductionScheduleDay) {
  if (!day.date) return `Day ${day.order}`;
  const parsed = new Date(`${day.date}T12:00:00`);
  return Number.isFinite(parsed.valueOf())
    ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(parsed)
    : `Day ${day.order}`;
}

export function ProjectProductionScheduleWorkspace({
  projectId,
  projectName,
  demoMode,
  workspaceRole,
}: ProjectProductionScheduleWorkspaceProps) {
  const authority = useProjectProductionSchedule(projectId, !demoMode);
  const seededDemoContent = useMemo(() => localDemoSchedule(projectName), [projectName]);
  const incomingHead = demoMode ? null : authority.snapshot?.head ?? null;
  const contentKey = demoMode ? `demo:${projectName}` : incomingHead?.revisionId ?? null;
  const [draft, setDraft] = useState<ProjectProductionScheduleContent | null>(() =>
    demoMode ? cloneContent(seededDemoContent) : null,
  );
  const [baseline, setBaseline] = useState<ProjectProductionScheduleContent | null>(() =>
    demoMode ? cloneContent(seededDemoContent) : null,
  );
  const [selectedTarget, setSelectedTarget] = useState<ScheduleTarget>(
    seededDemoContent.days[0]?.id ?? "unscheduled",
  );
  const [changeSummary, setChangeSummary] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [bannerKind, setBannerKind] = useState<Exclude<ProjectProductionScheduleItemKind, "shot">>("setup");
  const [demoRevision, setDemoRevision] = useState(1);
  const [demoState, setDemoState] = useState<ProjectProductionScheduleState>("draft");
  const [demoActiveRevision, setDemoActiveRevision] = useState<number | null>(null);
  const [loadedContentKey, setLoadedContentKey] = useState<string | null>(contentKey);
  const [localError, setLocalError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  if (loadedContentKey !== contentKey) {
    const nextContent = demoMode ? seededDemoContent : incomingHead?.content ?? null;
    setLoadedContentKey(contentKey);
    setDraft(nextContent ? cloneContent(nextContent) : null);
    setBaseline(nextContent ? cloneContent(nextContent) : null);
    setSelectedTarget(nextContent?.days[0]?.id ?? "unscheduled");
    setChangeSummary("");
    setDecisionNote("");
    setLocalError(null);
    if (demoMode) {
      setDemoRevision(1);
      setDemoState("draft");
      setDemoActiveRevision(null);
    }
  }

  const state = demoMode ? demoState : incomingHead?.state ?? null;
  const revisionNumber = demoMode ? demoRevision : incomingHead?.revisionNumber ?? null;
  const activeRevisionNumber = demoMode
    ? demoActiveRevision
    : authority.snapshot?.active?.revisionNumber ?? null;
  const hasChanges = Boolean(
    draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline),
  );
  const roleCanWrite = WRITE_ROLES.has(workspaceRole);
  const roleCanDecide = PRODUCER_ROLES.has(workspaceRole);
  const canRevise = demoMode
    ? roleCanWrite && state !== "submitted"
    : Boolean(authority.snapshot?.permissions.canRevise && incomingHead);
  const isSubmittable = Boolean(draft && isProjectProductionScheduleSubmittable(draft));
  const canSubmit = demoMode
    ? roleCanWrite
      && Boolean(draft)
      && (state === "draft" || state === "changes_requested")
      && !hasChanges
      && isSubmittable
    : Boolean(
        authority.snapshot?.permissions.canSubmit
        && incomingHead
        && (incomingHead.state === "draft" || incomingHead.state === "changes_requested")
        && !hasChanges
        && isSubmittable,
      );
  const canDecide = demoMode
    ? roleCanDecide && state === "submitted"
    : Boolean(authority.snapshot?.permissions.canDecide && incomingHead?.state === "submitted");
  const selectedDay = selectedTarget === "unscheduled"
    ? null
    : draft?.days.find((day) => day.id === selectedTarget) ?? null;
  const selectedItems = selectedTarget === "unscheduled"
    ? draft?.unscheduled ?? []
    : selectedDay?.items ?? [];

  const sourceShotFacts = useMemo(() => {
    const facts = new Map<string, { scene: string; shot: string }>();
    const source = authority.snapshot?.source?.shotPlanContent;
    if (source) {
      for (const scene of source.scenes) {
        for (const shot of scene.shots) {
          facts.set(shot.id, { scene: scene.heading, shot: shot.purpose });
        }
      }
    } else if (demoMode) {
      facts.set("shot-001-001", { scene: "Opening image", shot: "Establish the workday" });
      facts.set("shot-002-001", { scene: "Customer proof", shot: "Primary interview coverage" });
      facts.set("shot-003-001", { scene: "Close", shot: "Resolve on the product" });
    }
    return facts;
  }, [authority.snapshot?.source?.shotPlanContent, demoMode]);

  function updateDay(dayId: string, updater: (day: ProjectProductionScheduleDay) => ProjectProductionScheduleDay) {
    if (!canRevise) return;
    setDraft((current) => current
      ? { ...current, days: current.days.map((day) => day.id === dayId ? updater(day) : day) }
      : current,
    );
    setLocalError(null);
  }

  function addDay() {
    if (!draft || !canRevise) return;
    const day: ProjectProductionScheduleDay = {
      id: stableNextId(draft, "day"),
      order: draft.days.length + 1,
      date: null,
      unitCallTime: null,
      notes: null,
      items: [],
    };
    setDraft({ ...draft, days: [...draft.days, day] });
    setSelectedTarget(day.id);
    setLocalError(null);
  }

  function removeSelectedDay() {
    if (!draft || !selectedDay || !canRevise) return;
    const remaining = normalizeDays(draft.days.filter((day) => day.id !== selectedDay.id));
    setDraft({
      ...draft,
      days: remaining,
      unscheduled: normalizeItems([...draft.unscheduled, ...selectedDay.items]),
    });
    setSelectedTarget(remaining[0]?.id ?? "unscheduled");
    setLocalError(null);
  }

  function moveDay(dayId: string, direction: -1 | 1) {
    if (!draft || !canRevise) return;
    const index = draft.days.findIndex((day) => day.id === dayId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.days.length) return;
    const days = [...draft.days];
    [days[index], days[target]] = [days[target], days[index]];
    setDraft({ ...draft, days: normalizeDays(days) });
    setLocalError(null);
  }

  function updateItem(itemId: string, updater: (item: ProjectProductionScheduleItem) => ProjectProductionScheduleItem) {
    if (!draft || !canRevise) return;
    setDraft({
      ...draft,
      unscheduled: draft.unscheduled.map((item) => item.id === itemId ? updater(item) : item),
      days: draft.days.map((day) => ({
        ...day,
        items: day.items.map((item) => item.id === itemId ? updater(item) : item),
      })),
    });
    setLocalError(null);
  }

  function relocateItem(itemId: string, target: ScheduleTarget) {
    if (!draft || !canRevise || target === selectedTarget) return;
    let moved: ProjectProductionScheduleItem | null = null;
    const unscheduled = draft.unscheduled.filter((item) => {
      if (item.id !== itemId) return true;
      moved = item;
      return false;
    });
    const daysWithoutItem = draft.days.map((day) => ({
      ...day,
      items: day.items.filter((item) => {
        if (item.id !== itemId) return true;
        moved = item;
        return false;
      }),
    }));
    if (!moved) return;
    const nextUnscheduled = target === "unscheduled"
      ? normalizeItems([...unscheduled, moved])
      : normalizeItems(unscheduled);
    const nextDays = daysWithoutItem.map((day) => ({
      ...day,
      items: normalizeItems(target === day.id ? [...day.items, moved!] : day.items),
    }));
    setDraft({ ...draft, unscheduled: nextUnscheduled, days: nextDays });
    setLocalError(null);
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    if (!draft || !canRevise) return;
    const items = selectedItems;
    const index = items.findIndex((item) => item.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    if (selectedTarget === "unscheduled") {
      setDraft({ ...draft, unscheduled: normalizeItems(reordered) });
    } else {
      setDraft({
        ...draft,
        days: draft.days.map((day) => day.id === selectedTarget
          ? { ...day, items: normalizeItems(reordered) }
          : day),
      });
    }
    setLocalError(null);
  }

  function addBanner() {
    if (!draft || !selectedDay || !canRevise) return;
    const item: ProjectProductionScheduleItem = {
      id: stableNextId(draft, `item-${bannerKind.replaceAll("_", "-")}`),
      order: selectedDay.items.length + 1,
      kind: bannerKind,
      sourceSceneId: null,
      sourceShotId: null,
      label: BANNER_DEFAULTS[bannerKind],
      notes: null,
      startTime: null,
      plannedDurationMinutes: null,
    };
    updateDay(selectedDay.id, (day) => ({ ...day, items: [...day.items, item] }));
  }

  function removeBanner(itemId: string) {
    if (!draft || !canRevise) return;
    if (selectedTarget === "unscheduled") {
      setDraft({ ...draft, unscheduled: normalizeItems(draft.unscheduled.filter((item) => item.id !== itemId)) });
    } else {
      updateDay(selectedTarget, (day) => ({
        ...day,
        items: normalizeItems(day.items.filter((item) => item.id !== itemId)),
      }));
    }
  }

  async function generateSchedule() {
    setLocalError(null);
    if (demoMode) {
      const next = cloneContent(seededDemoContent);
      setDraft(next);
      setBaseline(cloneContent(next));
      setSelectedTarget(next.days[0]?.id ?? "unscheduled");
      setDemoRevision(1);
      setDemoState("draft");
      setDemoActiveRevision(null);
      setAnnouncement("Local production schedule regenerated");
      return;
    }
    await authority.generateRevision();
  }

  async function saveRevision() {
    if (!draft || !hasChanges || !changeSummary.trim()) return;
    setLocalError(null);
    try {
      const content = parseProjectProductionScheduleContent(draft);
      if (demoMode) {
        setDemoRevision((value) => value + 1);
        setDemoState("draft");
        setDraft(cloneContent(content));
        setBaseline(cloneContent(content));
        setChangeSummary("");
        setAnnouncement("Local schedule revision saved");
        return;
      }
      const saved = await authority.appendRevision({
        content,
        changeSummary: changeSummary.trim(),
      });
      if (saved) setChangeSummary("");
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "The production schedule revision is invalid");
    }
  }

  async function submitRevision() {
    if (!canSubmit) {
      setLocalError("Schedule every item and enter the timezone, shoot date, unit call, start time, and production duration before submitting.");
      return;
    }
    setLocalError(null);
    if (demoMode) {
      setDemoState("submitted");
      setAnnouncement("Local production schedule submitted for producer review");
      return;
    }
    if (incomingHead) {
      await authority.submitRevision({ revisionId: incomingHead.revisionId, note: decisionNote.trim() || null });
    }
  }

  async function decide(decision: "approved" | "changes_requested") {
    if (!canDecide || (decision === "changes_requested" && !decisionNote.trim())) return;
    setLocalError(null);
    if (demoMode) {
      setDemoState(decision);
      if (decision === "approved") setDemoActiveRevision(demoRevision);
      setDecisionNote("");
      setAnnouncement(decision === "approved" ? "Local schedule approved and activated" : "Schedule changes requested");
      return;
    }
    if (incomingHead) {
      const decided = await authority.decideRevision({
        revisionId: incomingHead.revisionId,
        decision,
        note: decisionNote.trim() || null,
      });
      if (decided) setDecisionNote("");
    }
  }

  const operation = demoMode ? null : authority.operation;
  const error = localError ?? (demoMode ? null : authority.error ?? authority.conflict);
  const liveAnnouncement = demoMode ? announcement : authority.announcement;

  return (
    <section className={styles.workspace} aria-label="Governed production schedule">
      <p className={styles.srOnly} aria-live="polite">{liveAnnouncement}</p>
      <header className={styles.topbar}>
        <div className={styles.titleGroup}>
          <span className={styles.icon}><CalendarDays size={18} /></span>
          <div>
            <span>Active approved shot plan</span>
            <h3>{draft?.title ?? `${projectName} production schedule`}</h3>
          </div>
        </div>
        <div className={styles.statusGroup}>
          {revisionNumber ? <span className={styles.revisionBadge}>v{revisionNumber}</span> : null}
          {state ? <span className={styles.statusBadge} data-state={state}>{formatStatus(state)}</span> : null}
          {incomingHead?.stale ? <span className={styles.staleBadge}>Source changed</span> : null}
          {activeRevisionNumber ? <span className={styles.activeBadge}><ShieldCheck size={13} /> Active v{activeRevisionNumber}</span> : null}
          {demoMode || (authority.snapshot?.revisions.length ?? 0) > 0 ? (
            <details className={styles.historyMenu}>
              <summary><History size={13} /> History</summary>
              <div>
                {(demoMode
                  ? [{ revisionNumber: demoRevision, state: demoState, stale: false, createdAt: "Local preview" }]
                  : authority.snapshot?.revisions ?? []
                ).map((revision) => (
                  <span key={`${revision.revisionNumber}-${revision.createdAt}`}>
                    <strong>v{revision.revisionNumber}</strong>
                    <small>{formatStatus(revision.state)}{revision.stale ? " · stale" : ""}</small>
                  </span>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </header>

      {demoMode ? (
        <div className={styles.demoNotice} role="status">
          Local demo schedule. Changes stay in this preview, never call project APIs, and are not authoritative.
        </div>
      ) : null}

      {!demoMode && authority.loading && !authority.ready ? (
        <div className={styles.loadingState} role="status">
          <LoaderCircle size={18} className={styles.spinner} />
          Loading governed production schedule…
        </div>
      ) : error ? (
        <div className={styles.errorState} role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          {!demoMode ? (
            <button type="button" onClick={() => void authority.reload()}>
              <RefreshCw size={14} /> Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {!draft ? (
        <div className={styles.emptyState}>
          <FileStack size={28} />
          <div>
            <strong>{authority.snapshot?.source ? "Create the first schedule revision" : "Schedule source is not ready"}</strong>
            <p>
              {authority.snapshot?.source
                ? "Generate an unscheduled stripboard from the exact active approved shot plan. Production timing remains blank until a contributor enters it."
                : "Approve and activate a governed shot plan before creating the production schedule."}
            </p>
          </div>
          {authority.snapshot?.source && authority.snapshot.permissions.canGenerate ? (
            <button type="button" className={styles.primaryButton} onClick={() => void generateSchedule()} disabled={operation !== null}>
              {operation === "generate" ? <LoaderCircle className={styles.spinner} size={15} /> : <CalendarDays size={15} />}
              Generate schedule
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className={styles.sourceBar}>
            <span>
              <CircleDot size={13} />
              {demoMode
                ? "Local approved shot plan · 3 shots"
                : `Shot plan v${authority.snapshot?.source?.shotPlanRevisionNumber ?? "—"} · ${authority.snapshot?.source?.shotPlanContent.scenes.reduce((total, scene) => total + scene.shots.length, 0) ?? 0} shots`}
            </span>
            <div>
              <strong>{isSubmittable ? "Ready to submit" : `${draft.unscheduled.length} unscheduled`}</strong>
              {incomingHead?.stale && authority.snapshot?.permissions.canGenerate ? (
                <button type="button" onClick={() => void generateSchedule()} disabled={operation !== null}>
                  <RefreshCw size={13} /> Regenerate from current shot plan
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.settingsBar} aria-label="Production schedule settings">
            <label>
              <span>Schedule title</span>
              <input
                value={draft.title}
                disabled={!canRevise}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              <span>Timezone</span>
              <input
                list="production-schedule-timezones"
                value={draft.timeZone ?? ""}
                disabled={!canRevise}
                onChange={(event) => setDraft({ ...draft, timeZone: event.target.value || null })}
                placeholder="IANA timezone"
              />
              <datalist id="production-schedule-timezones">
                <option value="America/Chicago" />
                <option value="America/New_York" />
                <option value="America/Denver" />
                <option value="America/Los_Angeles" />
                <option value="UTC" />
              </datalist>
            </label>
            <div className={styles.authorityBoundary}>
              Schedule authority only. Crew, locations, permits, weather, and call sheets remain separate.
            </div>
          </div>

          <div className={styles.body}>
            <aside className={styles.dayRail} aria-label="Schedule days">
              <div className={styles.railHeading}>
                <span>Shoot days</span>
                <strong>{draft.days.length}</strong>
              </div>
              <div className={styles.dayList}>
                <button
                  type="button"
                  aria-current={selectedTarget === "unscheduled"}
                  onClick={() => setSelectedTarget("unscheduled")}
                >
                  <span>U</span>
                  <div><strong>Unscheduled</strong><small>{draft.unscheduled.length} items</small></div>
                  <ChevronRight size={13} />
                </button>
                {draft.days.map((day) => (
                  <button
                    type="button"
                    key={day.id}
                    aria-current={selectedTarget === day.id}
                    onClick={() => setSelectedTarget(day.id)}
                  >
                    <span>{day.order}</span>
                    <div><strong>{dayLabel(day)}</strong><small>{day.unitCallTime ? `Call ${day.unitCallTime}` : "Call not set"}</small></div>
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
              <button type="button" className={styles.addDayButton} onClick={addDay} disabled={!canRevise}>
                <Plus size={14} /> Add shoot day
              </button>
            </aside>

            <div className={styles.agenda}>
              <header className={styles.agendaHeader}>
                <div>
                  <span>{selectedTarget === "unscheduled" ? "Stripboard" : `Shoot day ${selectedDay?.order ?? ""}`}</span>
                  <h4>{selectedTarget === "unscheduled" ? "Unscheduled shots" : selectedDay ? dayLabel(selectedDay) : "Shoot day"}</h4>
                </div>
                {selectedDay ? (
                  <div className={styles.dayActions}>
                    <button type="button" className={styles.iconButton} onClick={() => moveDay(selectedDay.id, -1)} disabled={!canRevise || selectedDay.order === 1} title="Move shoot day earlier" aria-label="Move shoot day earlier"><ArrowUp size={15} /></button>
                    <button type="button" className={styles.iconButton} onClick={() => moveDay(selectedDay.id, 1)} disabled={!canRevise || selectedDay.order === draft.days.length} title="Move shoot day later" aria-label="Move shoot day later"><ArrowDown size={15} /></button>
                    <button type="button" className={styles.iconButton} onClick={removeSelectedDay} disabled={!canRevise} title="Remove shoot day" aria-label="Remove shoot day"><Trash2 size={15} /></button>
                  </div>
                ) : null}
              </header>

              {selectedDay ? (
                <div className={styles.daySettings}>
                  <label><span>Date</span><input type="date" value={selectedDay.date ?? ""} disabled={!canRevise} onChange={(event) => updateDay(selectedDay.id, (day) => ({ ...day, date: event.target.value || null }))} /></label>
                  <label><span>Unit call</span><input type="time" value={selectedDay.unitCallTime ?? ""} disabled={!canRevise} onChange={(event) => updateDay(selectedDay.id, (day) => ({ ...day, unitCallTime: event.target.value || null }))} /></label>
                  <label className={styles.dayNotes}><span>Day notes</span><input value={selectedDay.notes ?? ""} disabled={!canRevise} placeholder="Optional production note" onChange={(event) => updateDay(selectedDay.id, (day) => ({ ...day, notes: event.target.value || null }))} /></label>
                </div>
              ) : null}

              <div className={styles.itemList}>
                {selectedItems.map((item, index) => {
                  const fact = item.sourceShotId ? sourceShotFacts.get(item.sourceShotId) : null;
                  const itemName = item.kind === "shot"
                    ? fact?.shot ?? `Source shot ${item.sourceShotId ?? ""}`
                    : item.label ?? KIND_LABELS[item.kind];
                  return (
                    <article className={styles.scheduleItem} key={item.id} data-kind={item.kind}>
                      <div className={styles.itemOrder}><GripVertical size={14} /><strong>{String(item.order).padStart(2, "0")}</strong></div>
                      <div className={styles.itemContent}>
                        <header>
                          <div>
                            <span className={styles.kindBadge}>{KIND_LABELS[item.kind]}</span>
                            <strong>{itemName}</strong>
                            {fact ? <small>{fact.scene} · {item.sourceShotId}</small> : null}
                          </div>
                          <div className={styles.itemActions}>
                            <button type="button" onClick={() => moveItem(item.id, -1)} disabled={!canRevise || index === 0} title="Move item up" aria-label={`Move ${itemName} up`}><ArrowUp size={14} /></button>
                            <button type="button" onClick={() => moveItem(item.id, 1)} disabled={!canRevise || index === selectedItems.length - 1} title="Move item down" aria-label={`Move ${itemName} down`}><ArrowDown size={14} /></button>
                            {item.kind !== "shot" ? <button type="button" onClick={() => removeBanner(item.id)} disabled={!canRevise} title="Remove schedule item" aria-label={`Remove ${itemName}`}><Trash2 size={14} /></button> : null}
                          </div>
                        </header>
                        <div className={styles.itemFields}>
                          {item.kind !== "shot" ? (
                            <label className={styles.itemLabel}><span>Label</span><input value={item.label ?? ""} disabled={!canRevise} onChange={(event) => updateItem(item.id, (current) => ({ ...current, label: event.target.value }))} /></label>
                          ) : null}
                          <label><span>Start</span><input type="time" value={item.startTime ?? ""} disabled={!canRevise} onChange={(event) => updateItem(item.id, (current) => ({ ...current, startTime: event.target.value || null }))} /></label>
                          <label><span>Minutes</span><input type="number" min="1" max="1440" value={item.plannedDurationMinutes ?? ""} disabled={!canRevise} onChange={(event) => updateItem(item.id, (current) => ({ ...current, plannedDurationMinutes: event.target.value ? Number(event.target.value) : null }))} /></label>
                          <label className={styles.assignment}><span>Assignment</span><select value={selectedTarget} disabled={!canRevise} onChange={(event) => relocateItem(item.id, event.target.value)}><option value="unscheduled">Unscheduled</option>{draft.days.map((day) => <option value={day.id} key={day.id}>Day {day.order}{day.date ? ` · ${day.date}` : ""}</option>)}</select></label>
                          <label className={styles.itemNotes}><span>Notes</span><input value={item.notes ?? ""} disabled={!canRevise} placeholder="Optional" onChange={(event) => updateItem(item.id, (current) => ({ ...current, notes: event.target.value || null }))} /></label>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {selectedItems.length === 0 ? (
                  <div className={styles.noItems}>
                    <Clock3 size={20} />
                    <strong>{selectedTarget === "unscheduled" ? "Every shot is assigned" : "No items on this shoot day"}</strong>
                  </div>
                ) : null}
              </div>

              {selectedDay ? (
                <div className={styles.addBannerBar}>
                  <select value={bannerKind} disabled={!canRevise} aria-label="Schedule item type" onChange={(event) => setBannerKind(event.target.value as Exclude<ProjectProductionScheduleItemKind, "shot">)}>
                    {BANNER_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
                  </select>
                  <button type="button" className={styles.secondaryButton} onClick={addBanner} disabled={!canRevise}><Plus size={14} /> Add schedule item</button>
                </div>
              ) : null}
            </div>
          </div>

          <footer className={styles.workflow}>
            <div className={styles.revisionFields}>
              <label><span>Revision summary</span><input value={changeSummary} disabled={!canRevise} placeholder="Required to save a new immutable revision" onChange={(event) => setChangeSummary(event.target.value)} /></label>
              <label><span>Producer note</span><input value={decisionNote} disabled={!canSubmit && !canDecide} placeholder={canDecide ? "Required when requesting changes" : "Optional submission note"} onChange={(event) => setDecisionNote(event.target.value)} /></label>
            </div>
            <div className={styles.workflowActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void saveRevision()} disabled={!canRevise || !hasChanges || !changeSummary.trim() || operation !== null}>{operation === "save" ? <LoaderCircle className={styles.spinner} size={14} /> : <Save size={14} />} Save revision</button>
              <button type="button" className={styles.primaryButton} onClick={() => void submitRevision()} disabled={!canSubmit || operation !== null}>{operation === "submit" ? <LoaderCircle className={styles.spinner} size={14} /> : <Send size={14} />} Submit</button>
              {canDecide ? <button type="button" className={styles.secondaryButton} onClick={() => void decide("changes_requested")} disabled={!decisionNote.trim() || operation !== null}>Request changes</button> : null}
              {canDecide ? <button type="button" className={styles.approveButton} onClick={() => void decide("approved")} disabled={operation !== null}><Check size={14} /> Approve and activate</button> : null}
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
