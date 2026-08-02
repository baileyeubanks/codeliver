"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Clock3,
  FileStack,
  GripVertical,
  History,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkspaceRole } from "@/components/navigation/navigation-model";
import { useProjectCallSheet } from "@/lib/hooks/useProjectCallSheet";
import {
  isProjectCallSheetSubmittable,
  parseProjectCallSheetContent,
  PROJECT_CALL_SHEET_SCHEMA_VERSION,
  PROJECT_CALL_SHEET_SECTION_KINDS,
  type ProjectCallSheetContact,
  type ProjectCallSheetContent,
  type ProjectCallSheetSection,
  type ProjectCallSheetSectionKind,
  type ProjectCallSheetState,
} from "@/lib/preproduction/call-sheet";
import type { ProjectProductionScheduleDay } from "@/lib/preproduction/production-schedule";
import styles from "./ProjectCallSheetWorkspace.module.css";

export interface ProjectCallSheetWorkspaceProps {
  projectId: string;
  projectName: string;
  demoMode: boolean;
  workspaceRole: WorkspaceRole;
}

const WRITE_ROLES = new Set<WorkspaceRole>([
  "owner",
  "admin",
  "producer",
  "editor",
]);
const PRODUCER_ROLES = new Set<WorkspaceRole>(["owner", "admin", "producer"]);

const SECTION_LABELS: Record<ProjectCallSheetSectionKind, string> = {
  safety: "Safety",
  weather: "Weather",
  transport: "Transport",
  meal: "Meal",
  equipment: "Equipment",
  note: "Production note",
};

const SECTION_DEFAULTS: Record<ProjectCallSheetSectionKind, string> = {
  safety: "Review the site safety plan before first setup.",
  weather: "Weather is a manually entered production note, not a live forecast.",
  transport: "Confirm parking, load-in, and company-move instructions.",
  meal: "Confirm meal timing and dietary requirements.",
  equipment: "Confirm department checklists before unit call.",
  note: "Add the instruction the production team needs for this day.",
};

function cloneContent(content: ProjectCallSheetContent) {
  return structuredClone(content);
}

function normalizeContacts(contacts: readonly ProjectCallSheetContact[]) {
  return contacts.map((contact, index) => ({ ...contact, order: index + 1 }));
}

function normalizeSections(sections: readonly ProjectCallSheetSection[]) {
  return sections.map((section, index) => ({ ...section, order: index + 1 }));
}

function stableId(content: ProjectCallSheetContent, prefix: string) {
  const used = new Set([
    ...content.contacts.map((contact) => contact.id),
    ...content.sections.map((section) => section.id),
  ]);
  let ordinal = used.size + 1;
  let candidate = `${prefix}-${String(ordinal).padStart(3, "0")}`;
  while (used.has(candidate)) {
    ordinal += 1;
    candidate = `${prefix}-${String(ordinal).padStart(3, "0")}`;
  }
  return candidate;
}

function demoCallSheet(projectName: string): ProjectCallSheetContent {
  return parseProjectCallSheetContent({
    schemaVersion: PROJECT_CALL_SHEET_SCHEMA_VERSION,
    title: `${projectName} - Production day 1`,
    scheduleDayId: "day-001",
    shootDate: "2026-07-20",
    timeZone: "America/Chicago",
    unitCallTime: "07:00",
    location: {
      name: "CERAWeek production stage",
      address: "1001 Avenida de las Americas, Houston, TX 77010",
      parkingNotes: "Crew parking in the south garage. Validate at production desk.",
      accessNotes: "Load-in through Hall C service entrance. Credentials required.",
      contactName: "Jordan Miles",
      contactPhone: "+1 713 555 0142",
    },
    contacts: [
      {
        id: "contact-001",
        order: 1,
        name: "Charles Rivera",
        role: "Producer",
        department: "Production",
        email: "charles@contentco-op.com",
        phone: "+1 915 555 0100",
        callTime: "06:30",
        notes: "Production lead and client contact.",
      },
      {
        id: "contact-002",
        order: 2,
        name: "Jamie Morgan",
        role: "Director of photography",
        department: "Camera",
        email: "jamie@example.com",
        phone: "+1 713 555 0128",
        callTime: "06:45",
        notes: null,
      },
      {
        id: "contact-003",
        order: 3,
        name: "Lena Diaz",
        role: "Sound mixer",
        department: "Audio",
        email: null,
        phone: "+1 713 555 0181",
        callTime: "06:45",
        notes: "Coordinate venue feed with house AV.",
      },
    ],
    sections: [
      {
        id: "section-001",
        order: 1,
        kind: "safety",
        title: "Stage and service-corridor safety",
        body: "Keep cable paths covered and service exits clear. Report incidents to the producer immediately.",
      },
      {
        id: "section-002",
        order: 2,
        kind: "transport",
        title: "Load-in",
        body: "Camera and lighting carts enter through Hall C between 06:00 and 06:30.",
      },
      {
        id: "section-003",
        order: 3,
        kind: "weather",
        title: "Weather note",
        body: "Interior production. Producer must confirm any exterior pickup conditions on the day.",
      },
    ],
    agenda: [
      {
        scheduleItemId: "item-001",
        order: 1,
        kind: "setup",
        sourceSceneId: null,
        sourceShotId: null,
        label: "Camera and lighting setup",
        startTime: "07:00",
        plannedDurationMinutes: 45,
      },
      {
        scheduleItemId: "item-002",
        order: 2,
        kind: "shot",
        sourceSceneId: "scene-001",
        sourceShotId: "shot-001-001",
        label: "Opening venue sequence",
        startTime: "07:45",
        plannedDurationMinutes: 60,
      },
      {
        scheduleItemId: "item-003",
        order: 3,
        kind: "shot",
        sourceSceneId: "scene-002",
        sourceShotId: "shot-002-001",
        label: "Primary interview coverage",
        startTime: "09:00",
        plannedDurationMinutes: 90,
      },
      {
        scheduleItemId: "item-004",
        order: 4,
        kind: "meal",
        sourceSceneId: null,
        sourceShotId: null,
        label: "Meal break",
        startTime: "12:00",
        plannedDurationMinutes: 30,
      },
    ],
    generalNotes: "Protect clean plates after each interview setup.",
  });
}

function demoScheduleDay(content: ProjectCallSheetContent): ProjectProductionScheduleDay {
  return {
    id: content.scheduleDayId,
    order: 1,
    date: content.shootDate,
    unitCallTime: content.unitCallTime,
    notes: content.generalNotes,
    items: content.agenda.map((item) => ({
      id: item.scheduleItemId,
      order: item.order,
      kind: item.kind,
      sourceSceneId: item.sourceSceneId,
      sourceShotId: item.sourceShotId,
      label: item.label,
      notes: null,
      startTime: item.startTime,
      plannedDurationMinutes: item.plannedDurationMinutes,
    })),
  };
}

function formatState(value: ProjectCallSheetState) {
  return value.replaceAll("_", " ");
}

function dayLabel(day: ProjectProductionScheduleDay) {
  if (!day.date) return `Day ${day.order}`;
  const parsed = new Date(`${day.date}T12:00:00`);
  return Number.isFinite(parsed.valueOf())
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(parsed)
    : `Day ${day.order}`;
}

function moveRow<T>(rows: readonly T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function ProjectCallSheetWorkspace({
  projectId,
  projectName,
  demoMode,
  workspaceRole,
}: ProjectCallSheetWorkspaceProps) {
  const authority = useProjectCallSheet(projectId, !demoMode);
  const seededDemo = useMemo(() => demoCallSheet(projectName), [projectName]);
  const incomingHead = demoMode ? null : authority.snapshot?.head ?? null;
  const contentKey = demoMode ? `demo:${projectName}` : incomingHead?.revisionId ?? null;
  const [draft, setDraft] = useState<ProjectCallSheetContent | null>(() =>
    demoMode ? cloneContent(seededDemo) : null,
  );
  const [baseline, setBaseline] = useState<ProjectCallSheetContent | null>(() =>
    demoMode ? cloneContent(seededDemo) : null,
  );
  const [loadedContentKey, setLoadedContentKey] = useState<string | null>(contentKey);
  const [changeSummary, setChangeSummary] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [sectionKind, setSectionKind] = useState<ProjectCallSheetSectionKind>("safety");
  const [demoRevision, setDemoRevision] = useState(2);
  const [demoState, setDemoState] = useState<ProjectCallSheetState>("draft");
  const [demoActiveRevision, setDemoActiveRevision] = useState<number | null>(1);
  const [localError, setLocalError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  if (loadedContentKey !== contentKey) {
    const nextContent = demoMode ? seededDemo : incomingHead?.content ?? null;
    setLoadedContentKey(contentKey);
    setDraft(nextContent ? cloneContent(nextContent) : null);
    setBaseline(nextContent ? cloneContent(nextContent) : null);
    setChangeSummary("");
    setDecisionNote("");
    setLocalError(null);
  }

  const sourceDays = demoMode
    ? [demoScheduleDay(seededDemo)]
    : authority.snapshot?.source?.productionScheduleContent.days ?? [];
  const selectedScheduleDayId = demoMode
    ? seededDemo.scheduleDayId
    : authority.selectedScheduleDayId;
  const selectedDay = sourceDays.find((day) => day.id === selectedScheduleDayId) ?? null;
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
  const submittable = Boolean(draft && isProjectCallSheetSubmittable(draft));
  const canSubmit = demoMode
    ? roleCanWrite
      && Boolean(draft)
      && (state === "draft" || state === "changes_requested")
      && !hasChanges
      && submittable
    : Boolean(
        authority.snapshot?.permissions.canSubmit
        && incomingHead
        && (incomingHead.state === "draft" || incomingHead.state === "changes_requested")
        && !hasChanges
        && submittable,
      );
  const canDecide = demoMode
    ? roleCanDecide && state === "submitted"
    : Boolean(authority.snapshot?.permissions.canDecide && incomingHead?.state === "submitted");
  const locationReady = Boolean(draft?.location.name && draft.location.address);
  const contactsReady = Boolean(
    draft?.contacts.length
    && draft.contacts.every((contact) => contact.callTime && (contact.email || contact.phone)),
  );
  const safetyReady = Boolean(draft?.sections.some((section) => section.kind === "safety"));
  const agendaReady = Boolean(
    draft?.agenda.length
    && draft.agenda.every((item) => item.startTime && item.plannedDurationMinutes),
  );

  function updateLocation(
    key: keyof ProjectCallSheetContent["location"],
    value: string,
  ) {
    if (!draft || !canRevise) return;
    setDraft({
      ...draft,
      location: { ...draft.location, [key]: value || null },
    });
    setLocalError(null);
  }

  function addContact() {
    if (!draft || !canRevise) return;
    setDraft({
      ...draft,
      contacts: [
        ...draft.contacts,
        {
          id: stableId(draft, "contact"),
          order: draft.contacts.length + 1,
          name: "New contact",
          role: "Crew",
          department: null,
          email: null,
          phone: null,
          callTime: draft.unitCallTime,
          notes: null,
        },
      ],
    });
    setLocalError(null);
  }

  function updateContact(
    contactId: string,
    key: keyof ProjectCallSheetContact,
    value: string,
  ) {
    if (!draft || !canRevise || key === "id" || key === "order") return;
    setDraft({
      ...draft,
      contacts: draft.contacts.map((contact) =>
        contact.id === contactId
          ? { ...contact, [key]: value || (key === "name" || key === "role" ? "" : null) }
          : contact,
      ),
    });
    setLocalError(null);
  }

  function moveContact(index: number, direction: -1 | 1) {
    if (!draft || !canRevise) return;
    setDraft({ ...draft, contacts: normalizeContacts(moveRow(draft.contacts, index, direction)) });
  }

  function removeContact(contactId: string) {
    if (!draft || !canRevise) return;
    setDraft({
      ...draft,
      contacts: normalizeContacts(draft.contacts.filter((contact) => contact.id !== contactId)),
    });
  }

  function addSection() {
    if (!draft || !canRevise) return;
    setDraft({
      ...draft,
      sections: [
        ...draft.sections,
        {
          id: stableId(draft, `section-${sectionKind}`),
          order: draft.sections.length + 1,
          kind: sectionKind,
          title: SECTION_LABELS[sectionKind],
          body: SECTION_DEFAULTS[sectionKind],
        },
      ],
    });
    setLocalError(null);
  }

  function updateSection(
    sectionId: string,
    key: "kind" | "title" | "body",
    value: string,
  ) {
    if (!draft || !canRevise) return;
    setDraft({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? { ...section, [key]: value }
          : section,
      ),
    });
    setLocalError(null);
  }

  function moveSection(index: number, direction: -1 | 1) {
    if (!draft || !canRevise) return;
    setDraft({ ...draft, sections: normalizeSections(moveRow(draft.sections, index, direction)) });
  }

  function removeSection(sectionId: string) {
    if (!draft || !canRevise) return;
    setDraft({
      ...draft,
      sections: normalizeSections(draft.sections.filter((section) => section.id !== sectionId)),
    });
  }

  function selectDay(dayId: string) {
    if (demoMode || dayId === selectedScheduleDayId) return;
    if (authority.selectDay(dayId)) {
      setDraft(null);
      setBaseline(null);
      setLoadedContentKey(null);
    }
  }

  async function generateRevision() {
    setLocalError(null);
    if (demoMode) {
      const next = cloneContent(seededDemo);
      setDraft(next);
      setBaseline(cloneContent(next));
      setDemoRevision(1);
      setDemoState("draft");
      setDemoActiveRevision(null);
      setAnnouncement("Local call-sheet revision generated");
      return;
    }
    await authority.generateRevision();
  }

  async function saveRevision() {
    if (!draft || !hasChanges || !changeSummary.trim()) return;
    setLocalError(null);
    try {
      const content = parseProjectCallSheetContent(draft);
      if (demoMode) {
        setDemoRevision((value) => value + 1);
        setDemoState("draft");
        setDraft(cloneContent(content));
        setBaseline(cloneContent(content));
        setChangeSummary("");
        setAnnouncement("Local call-sheet revision saved");
        return;
      }
      const saved = await authority.appendRevision({
        content,
        changeSummary: changeSummary.trim(),
      });
      if (saved) setChangeSummary("");
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "The call-sheet revision is invalid");
    }
  }

  async function submitRevision() {
    if (!canSubmit) {
      setLocalError("Add the location, a reachable contact with a call time, a safety section, and complete agenda timing before submitting.");
      return;
    }
    setLocalError(null);
    if (demoMode) {
      setDemoState("submitted");
      setAnnouncement("Local call sheet submitted for producer review");
      return;
    }
    if (incomingHead) {
      await authority.submitRevision({
        revisionId: incomingHead.revisionId,
        note: decisionNote.trim() || null,
      });
    }
  }

  async function decide(decision: "approved" | "changes_requested") {
    if (!canDecide || (decision === "changes_requested" && !decisionNote.trim())) return;
    setLocalError(null);
    if (demoMode) {
      setDemoState(decision);
      if (decision === "approved") setDemoActiveRevision(demoRevision);
      setDecisionNote("");
      setAnnouncement(decision === "approved" ? "Local call sheet approved and activated" : "Call-sheet changes requested");
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
  const dayRail = sourceDays.length > 0 ? (
    <aside className={styles.dayRail} aria-label="Approved schedule days">
      <div className={styles.railHeading}>
        <span>Shoot days</span>
        <strong>{sourceDays.length}</strong>
      </div>
      <div className={styles.dayList}>
        {sourceDays.map((day) => (
          <button
            type="button"
            key={day.id}
            aria-current={selectedScheduleDayId === day.id}
            onClick={() => selectDay(day.id)}
          >
            <span className={styles.dayNumber}>{day.order}</span>
            <div>
              <strong>{dayLabel(day)}</strong>
              <small>{day.unitCallTime ? `Unit call ${day.unitCallTime}` : "Call not set"}</small>
              {selectedScheduleDayId === day.id && activeRevisionNumber ? <span className={styles.dayState}>Approved v{activeRevisionNumber}</span> : null}
            </div>
            <ChevronRight size={13} />
          </button>
        ))}
      </div>
    </aside>
  ) : null;

  return (
    <section className={styles.workspace} aria-label="Governed production call sheet">
      <p className={styles.srOnly} aria-live="polite">{liveAnnouncement}</p>
      <header className={styles.topbar}>
        <div className={styles.titleGroup}>
          <span className={styles.icon}><ClipboardList size={18} /></span>
          <div>
            <span className={styles.eyebrow}>Approved production schedule</span>
            <h3>{draft?.title ?? `${projectName} call sheet`}</h3>
          </div>
        </div>
        <div className={styles.statusGroup}>
          {revisionNumber ? <span className={styles.revisionBadge}>v{revisionNumber}</span> : null}
          {state ? <span className={styles.statusBadge} data-state={state}>{formatState(state)}</span> : null}
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
                    <small>{formatState(revision.state)}{revision.stale ? " - stale" : ""}</small>
                  </span>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </header>

      {demoMode ? (
        <div className={styles.demoNotice} role="status">
          Local demo call sheet. Changes stay in this preview, never call project APIs, and are not authoritative.
        </div>
      ) : null}

      {!demoMode && authority.loading && !authority.ready ? (
        <div className={styles.loadingState} role="status">
          <LoaderCircle size={18} className={styles.spinner} />
          Loading governed call sheet...
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
        <div className={dayRail ? styles.body : undefined}>
          {dayRail}
          <div className={styles.emptyState}>
            <FileStack size={28} />
            <div>
              <strong>{authority.snapshot?.source ? "Create this day's call sheet" : "Call-sheet source is not ready"}</strong>
              <p>
                {authority.snapshot?.source
                  ? "Generate a revision from the exact selected day in the active approved schedule, then add logistics, contacts, and production instructions."
                  : "Approve and activate a complete production schedule before creating a call sheet."}
              </p>
            </div>
            {authority.snapshot?.source && authority.snapshot.permissions.canGenerate ? (
              <button type="button" className={styles.primaryButton} onClick={() => void generateRevision()} disabled={operation !== null}>
                {operation === "generate" ? <LoaderCircle className={styles.spinner} size={15} /> : <ClipboardList size={15} />}
                Generate call sheet
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.sourceBar}>
            <span>
              <CircleDot size={13} />
              {demoMode
                ? "Local approved schedule - Day 1"
                : `Schedule v${authority.snapshot?.source?.productionScheduleRevisionNumber ?? "-"} - ${sourceDays.length} shoot day${sourceDays.length === 1 ? "" : "s"}`}
            </span>
            <div>
              <strong>{submittable ? "Ready to submit" : "Production details required"}</strong>
              {incomingHead?.stale && authority.snapshot?.permissions.canGenerate ? (
                <button type="button" className={styles.secondaryButton} onClick={() => void generateRevision()} disabled={operation !== null}>
                  <RefreshCw size={13} /> Regenerate
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.body}>
            {dayRail}

            <div className={styles.sheet}>
              <header className={styles.sheetHeader}>
                <div>
                  <span>Production day {selectedDay?.order ?? ""}</span>
                  <h4>{draft.title}</h4>
                </div>
                <div className={styles.dateFacts}>
                  <span><CalendarClock size={13} /> {draft.shootDate}</span>
                  <span><Clock3 size={13} /> Unit call {draft.unitCallTime}</span>
                  <span>{draft.timeZone}</span>
                </div>
              </header>

              <div className={styles.readiness} aria-label="Call-sheet readiness">
                <span data-ready={locationReady}><MapPin size={13} /> {locationReady ? "Location ready" : "Location required"}</span>
                <span data-ready={contactsReady}><Users size={13} /> {contactsReady ? "Contacts ready" : "Reachable contact required"}</span>
                <span data-ready={safetyReady}><ShieldCheck size={13} /> {safetyReady ? "Safety included" : "Safety section required"}</span>
                <span data-ready={agendaReady}><CheckCircle2 size={13} /> {agendaReady ? "Agenda complete" : "Schedule timing incomplete"}</span>
              </div>

              <section className={styles.section} aria-labelledby="call-sheet-location">
                <header className={styles.sectionHeader}>
                  <div><span>Logistics</span><h4 id="call-sheet-location">Location and access</h4></div>
                </header>
                <div className={styles.locationGrid}>
                  <label className={styles.field}><span>Location name</span><input value={draft.location.name ?? ""} disabled={!canRevise} onChange={(event) => updateLocation("name", event.target.value)} /></label>
                  <label className={styles.field}><span>Location contact</span><input value={draft.location.contactName ?? ""} disabled={!canRevise} onChange={(event) => updateLocation("contactName", event.target.value)} /></label>
                  <label className={`${styles.field} ${styles.fieldWide}`}><span>Address</span><input value={draft.location.address ?? ""} disabled={!canRevise} onChange={(event) => updateLocation("address", event.target.value)} /></label>
                  <label className={styles.field}><span>Location phone</span><input type="tel" value={draft.location.contactPhone ?? ""} disabled={!canRevise} onChange={(event) => updateLocation("contactPhone", event.target.value)} /></label>
                  <label className={styles.field}><span>Parking</span><input value={draft.location.parkingNotes ?? ""} disabled={!canRevise} onChange={(event) => updateLocation("parkingNotes", event.target.value)} /></label>
                  <label className={`${styles.field} ${styles.fieldWide}`}><span>Access and load-in</span><textarea value={draft.location.accessNotes ?? ""} disabled={!canRevise} onChange={(event) => updateLocation("accessNotes", event.target.value)} /></label>
                  <label className={`${styles.field} ${styles.fieldWide}`}><span>General notes</span><textarea value={draft.generalNotes ?? ""} disabled={!canRevise} onChange={(event) => setDraft({ ...draft, generalNotes: event.target.value || null })} /></label>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="call-sheet-contacts">
                <header className={styles.sectionHeader}>
                  <div><span>Crew calls</span><h4 id="call-sheet-contacts">Production contacts</h4></div>
                  <strong>{draft.contacts.length}</strong>
                </header>
                <div className={styles.contactList}>
                  {draft.contacts.map((contact, index) => (
                    <article className={styles.contactItem} key={contact.id}>
                      <div className={styles.rowOrder}><GripVertical size={14} /><strong>{String(contact.order).padStart(2, "0")}</strong></div>
                      <div className={styles.contactFields}>
                        <label className={styles.field}><span>Name</span><input value={contact.name} disabled={!canRevise} onChange={(event) => updateContact(contact.id, "name", event.target.value)} /></label>
                        <label className={styles.field}><span>Role</span><input value={contact.role} disabled={!canRevise} onChange={(event) => updateContact(contact.id, "role", event.target.value)} /></label>
                        <label className={styles.field}><span>Department</span><input value={contact.department ?? ""} disabled={!canRevise} onChange={(event) => updateContact(contact.id, "department", event.target.value)} /></label>
                        <label className={styles.field}><span>Call time</span><input type="time" value={contact.callTime ?? ""} disabled={!canRevise} onChange={(event) => updateContact(contact.id, "callTime", event.target.value)} /></label>
                        <label className={styles.field}><span>Email</span><input type="email" value={contact.email ?? ""} disabled={!canRevise} onChange={(event) => updateContact(contact.id, "email", event.target.value)} /></label>
                        <label className={styles.field}><span>Phone</span><input type="tel" value={contact.phone ?? ""} disabled={!canRevise} onChange={(event) => updateContact(contact.id, "phone", event.target.value)} /></label>
                        <label className={`${styles.field} ${styles.contactNotes}`}><span>Notes</span><input value={contact.notes ?? ""} disabled={!canRevise} onChange={(event) => updateContact(contact.id, "notes", event.target.value)} /></label>
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.iconButton} onClick={() => moveContact(index, -1)} disabled={!canRevise || index === 0} title="Move contact up" aria-label={`Move ${contact.name} up`}><ArrowUp size={14} /></button>
                        <button type="button" className={styles.iconButton} onClick={() => moveContact(index, 1)} disabled={!canRevise || index === draft.contacts.length - 1} title="Move contact down" aria-label={`Move ${contact.name} down`}><ArrowDown size={14} /></button>
                        <button type="button" className={styles.iconButton} onClick={() => removeContact(contact.id)} disabled={!canRevise} title="Remove contact" aria-label={`Remove ${contact.name}`}><Trash2 size={14} /></button>
                      </div>
                    </article>
                  ))}
                  {draft.contacts.length === 0 ? <div className={styles.noRows}><Users size={18} /> Add the first production contact.</div> : null}
                </div>
                <div className={styles.addRow}>
                  <button type="button" className={styles.secondaryButton} onClick={addContact} disabled={!canRevise}><Plus size={14} /> Add contact</button>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="call-sheet-agenda">
                <header className={styles.sectionHeader}>
                  <div><span>Schedule source</span><h4 id="call-sheet-agenda">Day agenda</h4></div>
                  <strong>{draft.agenda.length}</strong>
                </header>
                <div className={styles.agendaList}>
                  {draft.agenda.map((item) => (
                    <article className={styles.agendaItem} key={item.scheduleItemId}>
                      <span>{item.startTime ?? "-"}</span>
                      <span className={styles.agendaKind}>{item.kind.replaceAll("_", " ")}</span>
                      <div>
                        <strong>{item.label ?? item.sourceShotId ?? "Schedule item"}</strong>
                        <small>{item.sourceSceneId && item.sourceShotId ? `${item.sourceSceneId} - ${item.sourceShotId}` : "Approved schedule item"}</small>
                      </div>
                      <span className={styles.agendaDuration}>{item.plannedDurationMinutes ? `${item.plannedDurationMinutes} min` : "-"}</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.section} aria-labelledby="call-sheet-instructions">
                <header className={styles.sectionHeader}>
                  <div><span>Production notes</span><h4 id="call-sheet-instructions">Instructions and safety</h4></div>
                  <strong>{draft.sections.length}</strong>
                </header>
                <div className={styles.instructionList}>
                  {draft.sections.map((section, index) => (
                    <article className={styles.instructionItem} key={section.id}>
                      <div className={styles.rowOrder}><GripVertical size={14} /><strong>{String(section.order).padStart(2, "0")}</strong></div>
                      <div className={styles.instructionFields}>
                        <label className={styles.field}><span>Type</span><select value={section.kind} disabled={!canRevise} onChange={(event) => updateSection(section.id, "kind", event.target.value)}>{PROJECT_CALL_SHEET_SECTION_KINDS.map((kind) => <option key={kind} value={kind}>{SECTION_LABELS[kind]}</option>)}</select></label>
                        <label className={styles.field}><span>Title</span><input value={section.title} disabled={!canRevise} onChange={(event) => updateSection(section.id, "title", event.target.value)} /></label>
                        <label className={`${styles.field} ${styles.instructionBody}`}><span>Instruction</span><textarea value={section.body} disabled={!canRevise} onChange={(event) => updateSection(section.id, "body", event.target.value)} /></label>
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.iconButton} onClick={() => moveSection(index, -1)} disabled={!canRevise || index === 0} title="Move instruction up" aria-label={`Move ${section.title} up`}><ArrowUp size={14} /></button>
                        <button type="button" className={styles.iconButton} onClick={() => moveSection(index, 1)} disabled={!canRevise || index === draft.sections.length - 1} title="Move instruction down" aria-label={`Move ${section.title} down`}><ArrowDown size={14} /></button>
                        <button type="button" className={styles.iconButton} onClick={() => removeSection(section.id)} disabled={!canRevise} title="Remove instruction" aria-label={`Remove ${section.title}`}><Trash2 size={14} /></button>
                      </div>
                    </article>
                  ))}
                  {draft.sections.length === 0 ? <div className={styles.noRows}><ShieldCheck size={18} /> Add safety and production instructions.</div> : null}
                </div>
                <div className={styles.addRow}>
                  <div className={styles.workflowActions}>
                    <select value={sectionKind} disabled={!canRevise} aria-label="Instruction type" onChange={(event) => setSectionKind(event.target.value as ProjectCallSheetSectionKind)}>{PROJECT_CALL_SHEET_SECTION_KINDS.map((kind) => <option key={kind} value={kind}>{SECTION_LABELS[kind]}</option>)}</select>
                    <button type="button" className={styles.secondaryButton} onClick={addSection} disabled={!canRevise}><Plus size={14} /> Add instruction</button>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <footer className={styles.workflow}>
            <div className={styles.revisionFields}>
              <label className={styles.field}><span>Revision summary</span><input value={changeSummary} disabled={!canRevise} placeholder="Required to save a new immutable revision" onChange={(event) => setChangeSummary(event.target.value)} /></label>
              <label className={styles.field}><span>Producer note</span><input value={decisionNote} disabled={!canSubmit && !canDecide} placeholder={canDecide ? "Required when requesting changes" : "Optional submission note"} onChange={(event) => setDecisionNote(event.target.value)} /></label>
            </div>
            <div className={styles.workflowActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void saveRevision()} disabled={!canRevise || !hasChanges || !changeSummary.trim() || operation !== null}>{operation === "save" ? <LoaderCircle className={styles.spinner} size={14} /> : <Save size={14} />} Save revision</button>
              <button type="button" className={styles.primaryButton} onClick={() => void submitRevision()} disabled={!canSubmit || operation !== null}>{operation === "submit" ? <LoaderCircle className={styles.spinner} size={14} /> : <Send size={14} />} Submit</button>
              {canDecide ? <button type="button" className={styles.secondaryButton} onClick={() => void decide("changes_requested")} disabled={!decisionNote.trim() || operation !== null}>Request changes</button> : null}
              {canDecide ? <button type="button" className={styles.approveButton} onClick={() => void decide("approved")} disabled={operation !== null}><Check size={14} /> Approve and activate</button> : null}
            </div>
          </footer>
          <p className={styles.boundary}>
            Call-sheet authoring only. Contacts and location details are revision snapshots, not canonical crew or location records. Approval does not send, notify, acknowledge, or prove receipt.
          </p>
        </>
      )}
    </section>
  );
}
