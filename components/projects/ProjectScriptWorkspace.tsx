"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  FilePlus2,
  FileText,
  History,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { WorkspaceRole } from "@/components/navigation/navigation-model";
import { useProjectScript } from "@/lib/hooks/useProjectScript";
import { useProjectScriptPlan } from "@/lib/hooks/useProjectScriptPlan";
import { replaceDemoProjectTasksFromScript } from "@/lib/demo/workspace-store";
import {
  PROJECT_SCRIPT_BLOCK_KINDS,
  PROJECT_SCRIPT_FORMATS,
  PROJECT_SCRIPT_SCHEMA_VERSION,
  parseProjectScriptContent,
  type ProjectScriptBlockKind,
  type ProjectScriptContent,
  type ProjectScriptDecision,
  type ProjectScriptFormat,
  type ProjectScriptState,
} from "@/lib/preproduction/project-script";
import { deriveProjectScriptPlanDraft } from "@/lib/preproduction/script-plan";
import styles from "./ProjectScriptWorkspace.module.css";

export interface ProjectScriptWorkspaceProps {
  projectId: string;
  projectName: string;
  demoMode: boolean;
  workspaceRole: WorkspaceRole;
  onPlanMaterialized?: () => Promise<void> | void;
}

interface EditableBlock {
  id: string;
  kind: ProjectScriptBlockKind;
  text: string;
  speaker: string;
  parenthetical: string;
}

interface EditableSection {
  id: string;
  heading: string;
  summary: string;
  estimatedDurationSeconds: string;
  blocks: EditableBlock[];
}

interface EditableScript {
  title: string;
  logline: string;
  format: ProjectScriptFormat;
  runtimeMinutes: string;
  sections: EditableSection[];
}

interface RevisionChoice {
  key: string;
  revisionNumber: number;
  state: ProjectScriptState;
  changeSummary: string | null;
  createdAt: string;
  content?: ProjectScriptContent;
}

const FORMAT_LABELS: Record<ProjectScriptFormat, string> = {
  commercial: "Commercial",
  documentary: "Documentary",
  interview: "Interview",
  voice_over: "Voice over",
  screenplay: "Screenplay",
  outline: "Outline",
};

const BLOCK_KIND_LABELS: Record<ProjectScriptBlockKind, string> = {
  scene_heading: "Scene heading",
  visual: "Visual",
  action: "Action",
  dialogue: "Dialogue",
  voice_over: "Voice over",
  interview_question: "Interview question",
  b_roll: "B-roll",
  on_screen_text: "On-screen text",
  graphic: "Graphic",
  music: "Music",
  sfx: "SFX",
  transition: "Transition",
  note: "Note",
};

const WRITE_ROLES = new Set<WorkspaceRole>([
  "owner",
  "admin",
  "producer",
  "editor",
]);
const PRODUCER_ROLES = new Set<WorkspaceRole>(["owner", "admin", "producer"]);
const DEMO_REVISION_CREATED_AT = "2026-07-16T12:00:00.000Z";

function createStableId(prefix: "section" | "block") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function blankBlock(
  kind: ProjectScriptBlockKind = "action",
  id = createStableId("block"),
): EditableBlock {
  return {
    id,
    kind,
    text: "",
    speaker: "",
    parenthetical: "",
  };
}

function blankScript(projectName: string): EditableScript {
  return {
    title: `${projectName} script`,
    logline: "",
    format: "commercial",
    runtimeMinutes: "",
    sections: [
      {
        id: "section-draft-1",
        heading: "Opening",
        summary: "",
        estimatedDurationSeconds: "",
        blocks: [blankBlock("action", "block-draft-1")],
      },
    ],
  };
}

function demoScript(projectName: string): EditableScript {
  return {
    title: `${projectName} story draft`,
    logline: "A clear opening, a grounded customer voice, and a concise path to action.",
    format: "commercial",
    runtimeMinutes: "1.5",
    sections: [
      {
        id: "section-opening",
        heading: "Opening image",
        summary: "Establish the problem in a familiar moment.",
        estimatedDurationSeconds: "20",
        blocks: [
          {
            id: "block-opening-visual",
            kind: "visual",
            text: "Close details of the workday beginning before the room fills.",
            speaker: "",
            parenthetical: "",
          },
          {
            id: "block-opening-text",
            kind: "on_screen_text",
            text: "Better work starts with a clearer plan.",
            speaker: "",
            parenthetical: "",
          },
        ],
      },
      {
        id: "section-proof",
        heading: "Customer proof",
        summary: "Let the interview answer carry the central claim.",
        estimatedDurationSeconds: "45",
        blocks: [
          {
            id: "block-proof-question",
            kind: "interview_question",
            text: "What changed once the team could see the whole production plan?",
            speaker: "Producer",
            parenthetical: "",
          },
          {
            id: "block-proof-broll",
            kind: "b_roll",
            text: "Team reviewing the active plan, then moving into production.",
            speaker: "",
            parenthetical: "",
          },
        ],
      },
      {
        id: "section-close",
        heading: "Close",
        summary: "Resolve with the product and one direct next step.",
        estimatedDurationSeconds: "25",
        blocks: [
          {
            id: "block-close-vo",
            kind: "voice_over",
            text: "Bring every production decision into one shared workspace.",
            speaker: "Narrator",
            parenthetical: "Confident, unhurried",
          },
          {
            id: "block-close-graphic",
            kind: "graphic",
            text: "Content Co-op / Plan together. Produce with clarity.",
            speaker: "",
            parenthetical: "",
          },
        ],
      },
    ],
  };
}

function editableFromContent(content: ProjectScriptContent): EditableScript {
  return {
    title: content.title,
    logline: content.logline ?? "",
    format: content.format,
    runtimeMinutes: content.estimatedRuntimeSeconds === null
      ? ""
      : String(content.estimatedRuntimeSeconds / 60),
    sections: content.sections.map((section) => ({
      id: section.id,
      heading: section.heading,
      summary: section.summary ?? "",
      estimatedDurationSeconds: section.estimatedDurationSeconds === null
        ? ""
        : String(section.estimatedDurationSeconds),
      blocks: section.blocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        text: block.text,
        speaker: block.speaker ?? "",
        parenthetical: block.parenthetical ?? "",
      })),
    })),
  };
}

function nullableNumber(value: string, multiplier = 1) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * multiplier) : Number.NaN;
}

function contentFromEditable(draft: EditableScript): ProjectScriptContent {
  const estimatedRuntimeSeconds = nullableNumber(draft.runtimeMinutes, 60);
  if (Number.isNaN(estimatedRuntimeSeconds)) {
    throw new Error("Runtime must be a positive number of minutes");
  }

  const content: ProjectScriptContent = {
    schemaVersion: PROJECT_SCRIPT_SCHEMA_VERSION,
    title: draft.title,
    logline: draft.logline.trim() || null,
    format: draft.format,
    estimatedRuntimeSeconds,
    sections: draft.sections.map((section, sectionIndex) => {
      const estimatedDurationSeconds = nullableNumber(section.estimatedDurationSeconds);
      if (Number.isNaN(estimatedDurationSeconds)) {
        throw new Error(`Section ${sectionIndex + 1} duration must be a positive number of seconds`);
      }
      return {
        id: section.id,
        heading: section.heading,
        summary: section.summary.trim() || null,
        estimatedDurationSeconds,
        blocks: section.blocks.map((block) => ({
          id: block.id,
          kind: block.kind,
          text: block.text,
          speaker: block.speaker.trim() || null,
          parenthetical: block.parenthetical.trim() || null,
        })),
      };
    }),
  };
  return parseProjectScriptContent(content);
}

function contentFromDemoDraft(draft: EditableScript) {
  return contentFromEditable(draft);
}

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function formatStatus(status: ProjectScriptState) {
  return status.replaceAll("_", " ");
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function blockSupportsSpeaker(kind: ProjectScriptBlockKind) {
  return kind === "dialogue" || kind === "voice_over" || kind === "interview_question";
}

function blockSupportsParenthetical(kind: ProjectScriptBlockKind) {
  return kind === "dialogue" || kind === "voice_over";
}

function blockPlaceholder(kind: ProjectScriptBlockKind) {
  switch (kind) {
    case "scene_heading": return "INT. LOCATION - DAY";
    case "visual": return "Describe what the audience sees";
    case "action": return "Describe the action";
    case "dialogue": return "Write the spoken line";
    case "voice_over": return "Write the voice-over copy";
    case "interview_question": return "Write the interview question";
    case "b_roll": return "Describe the supporting footage";
    case "on_screen_text": return "Write the exact on-screen copy";
    case "graphic": return "Describe the graphic or data treatment";
    case "music": return "Describe the music cue";
    case "sfx": return "Describe the sound effect";
    case "transition": return "CUT TO:";
    case "note": return "Add a production note";
  }
}

export function ProjectScriptWorkspace({
  projectId,
  projectName,
  demoMode,
  workspaceRole,
  onPlanMaterialized,
}: ProjectScriptWorkspaceProps) {
  const projectScript = useProjectScript(projectId, !demoMode);
  const roleCanDecide = PRODUCER_ROLES.has(workspaceRole);
  const scriptPlan = useProjectScriptPlan(projectId, !demoMode && roleCanDecide);
  const initialDemoContentRef = useRef<ProjectScriptContent | null>(null);
  if (initialDemoContentRef.current === null) {
    initialDemoContentRef.current = contentFromDemoDraft(demoScript(projectName));
  }

  const [draft, setDraft] = useState<EditableScript>(() =>
    demoMode ? editableFromContent(initialDemoContentRef.current!) : blankScript(projectName),
  );
  const [selectedSectionId, setSelectedSectionId] = useState(() => draft.sections[0]?.id ?? "");
  const [selectedRevisionKey, setSelectedRevisionKey] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [planApprovalNote, setPlanApprovalNote] = useState("");
  const [demoPlanDrafted, setDemoPlanDrafted] = useState(false);
  const [demoPlanActivated, setDemoPlanActivated] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<ProjectScriptDecision | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [started, setStarted] = useState(demoMode);
  const [localAnnouncement, setLocalAnnouncement] = useState("");
  const [demoRevisions, setDemoRevisions] = useState<RevisionChoice[]>(() => [{
    key: "local-demo-1",
    revisionNumber: 1,
    state: "draft",
    changeSummary: "Local demo draft",
    createdAt: DEMO_REVISION_CREATED_AT,
    content: initialDemoContentRef.current!,
  }]);
  const loadedRevisionRef = useRef<string | null>(null);

  const authoritativeHead = projectScript.snapshot?.head ?? null;
  const demoHead = demoRevisions[0] ?? null;
  const headKey = demoMode ? demoHead?.key ?? "" : authoritativeHead?.revisionId ?? "";
  const headState: ProjectScriptState = demoMode
    ? demoHead?.state ?? "draft"
    : authoritativeHead?.state ?? "draft";

  const revisionChoices = useMemo<RevisionChoice[]>(() => {
    if (demoMode) return demoRevisions;
    const snapshot = projectScript.snapshot;
    if (!snapshot) return [];
    return [...snapshot.revisions]
      .sort((left, right) => right.revisionNumber - left.revisionNumber)
      .map((revision) => ({
        key: revision.revisionId,
        revisionNumber: revision.revisionNumber,
        state: revision.state,
        changeSummary: revision.changeSummary,
        createdAt: revision.createdAt,
        content: revision.revisionId === snapshot.head?.revisionId
          ? snapshot.head.content
          : undefined,
      }));
  }, [demoMode, demoRevisions, projectScript.snapshot]);

  const selectedRevision = revisionChoices.find((revision) => revision.key === selectedRevisionKey)
    ?? revisionChoices[0]
    ?? null;
  const isHistoricalRevision = Boolean(selectedRevision && selectedRevision.key !== headKey);
  const visibleStatus = selectedRevision?.state ?? headState;
  const selectedSection = draft.sections.find((section) => section.id === selectedSectionId)
    ?? draft.sections[0]
    ?? null;
  const selectedSectionIndex = selectedSection
    ? draft.sections.findIndex((section) => section.id === selectedSection.id)
    : -1;

  const roleCanWrite = WRITE_ROLES.has(workspaceRole);
  const canRevise = demoMode
    ? roleCanWrite
    : Boolean(projectScript.snapshot?.permissions.canRevise);
  const canEdit = canRevise
    && !isHistoricalRevision
    && (headState === "draft" || headState === "changes_requested");
  const canSubmit = !isHistoricalRevision
    && headState === "draft"
    && !dirty
    && (demoMode
      ? roleCanWrite
      : Boolean(projectScript.snapshot?.permissions.canSubmit));
  const canDecide = !isHistoricalRevision
    && headState === "submitted"
    && roleCanDecide
    && (demoMode || Boolean(projectScript.snapshot?.permissions.canDecide));
  const isBusy = !demoMode && projectScript.operation !== null;
  const isReadOnly = started && (!canEdit || isHistoricalRevision);
  const approvedDemoRevision = demoMode
    ? demoRevisions.find((revision) => revision.state === "approved" && revision.content)
    : null;
  const approvedDemoPlan = approvedDemoRevision?.content
    ? deriveProjectScriptPlanDraft(approvedDemoRevision.content)
    : null;
  const handoffAvailable = demoMode
    ? Boolean(approvedDemoPlan)
    : Boolean(scriptPlan.proposal?.available);
  const handoffPlan = demoMode
    ? approvedDemoPlan
    : scriptPlan.proposal?.preview ?? null;
  const handoffDrafted = demoMode
    ? demoPlanDrafted
    : Boolean(scriptPlan.proposal?.draft);
  const handoffActivated = demoMode
    ? demoPlanActivated
    : Boolean(scriptPlan.proposal?.alreadyMaterialized);
  const handoffBusy = scriptPlan.operation !== null;
  const showPlanHandoff = roleCanDecide && (
    handoffAvailable
    || (!demoMode && headState === "approved" && (scriptPlan.loading || Boolean(scriptPlan.error)))
  );

  useEffect(() => {
    if (demoMode) {
      if (!selectedRevisionKey && demoHead) setSelectedRevisionKey(demoHead.key);
      return;
    }
    if (!authoritativeHead) {
      loadedRevisionRef.current = null;
      if (projectScript.ready) {
        setStarted(false);
        setSelectedRevisionKey("");
      }
      return;
    }
    setStarted(true);
    setSelectedRevisionKey((current) => current || authoritativeHead.revisionId);
    if (projectScript.conflict && dirty) {
      setSelectedRevisionKey(authoritativeHead.revisionId);
      return;
    }
    if (loadedRevisionRef.current === authoritativeHead.revisionId) return;
    loadedRevisionRef.current = authoritativeHead.revisionId;
    const nextDraft = editableFromContent(authoritativeHead.content);
    setDraft(nextDraft);
    setSelectedSectionId(nextDraft.sections[0]?.id ?? "");
    setDirty(false);
    setChangeSummary("");
    setValidationError(null);
    setSelectedRevisionKey(authoritativeHead.revisionId);
  }, [
    authoritativeHead,
    demoHead,
    demoMode,
    dirty,
    projectScript.conflict,
    projectScript.ready,
    selectedRevisionKey,
  ]);

  useEffect(() => {
    if (!demoMode && !authoritativeHead && projectScript.ready && !started) {
      const nextDraft = blankScript(projectName);
      setDraft(nextDraft);
      setSelectedSectionId(nextDraft.sections[0]?.id ?? "");
    }
  }, [authoritativeHead, demoMode, projectName, projectScript.ready, started]);

  function announce(message: string) {
    setLocalAnnouncement("");
    window.setTimeout(() => setLocalAnnouncement(message), 0);
  }

  function markChanged(nextDraft: EditableScript, message?: string) {
    setDraft(nextDraft);
    setDirty(true);
    setValidationError(null);
    if (message) announce(message);
  }

  function updateDraft(patch: Partial<EditableScript>) {
    markChanged({ ...draft, ...patch });
  }

  function updateSelectedSection(patch: Partial<EditableSection>) {
    if (!selectedSection) return;
    markChanged({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === selectedSection.id ? { ...section, ...patch } : section,
      ),
    });
  }

  function updateBlock(blockId: string, patch: Partial<EditableBlock>) {
    if (!selectedSection) return;
    updateSelectedSection({
      blocks: selectedSection.blocks.map((block) =>
        block.id === blockId ? { ...block, ...patch } : block,
      ),
    });
  }

  function addSection() {
    const section: EditableSection = {
      id: createStableId("section"),
      heading: `Section ${draft.sections.length + 1}`,
      summary: "",
      estimatedDurationSeconds: "",
      blocks: [blankBlock()],
    };
    markChanged({ ...draft, sections: [...draft.sections, section] }, "Section added");
    setSelectedSectionId(section.id);
  }

  function removeSection(sectionId: string) {
    if (draft.sections.length <= 1) return;
    const index = draft.sections.findIndex((section) => section.id === sectionId);
    const nextSections = draft.sections.filter((section) => section.id !== sectionId);
    markChanged({ ...draft, sections: nextSections }, "Section removed");
    if (selectedSectionId === sectionId) {
      setSelectedSectionId(nextSections[Math.max(0, index - 1)]?.id ?? nextSections[0]?.id ?? "");
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    const nextSections = moveItem(draft.sections, index, index + direction);
    markChanged({ ...draft, sections: nextSections }, `Section moved ${direction < 0 ? "up" : "down"}`);
  }

  function addBlock() {
    if (!selectedSection) return;
    updateSelectedSection({ blocks: [...selectedSection.blocks, blankBlock()] });
    announce("Block added");
  }

  function removeBlock(blockId: string) {
    if (!selectedSection || selectedSection.blocks.length <= 1) return;
    updateSelectedSection({
      blocks: selectedSection.blocks.filter((block) => block.id !== blockId),
    });
    announce("Block removed");
  }

  function moveBlock(index: number, direction: -1 | 1) {
    if (!selectedSection) return;
    updateSelectedSection({
      blocks: moveItem(selectedSection.blocks, index, index + direction),
    });
    announce(`Block moved ${direction < 0 ? "up" : "down"}`);
  }

  function handleSectionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = Math.min(draft.sections.length - 1, index + 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = draft.sections.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = draft.sections[nextIndex];
    if (!nextSection) return;
    setSelectedSectionId(nextSection.id);
    document.getElementById(`script-section-${nextIndex}`)?.focus();
  }

  function startScript() {
    const nextDraft = blankScript(projectName);
    setDraft(nextDraft);
    setSelectedSectionId(nextDraft.sections[0]?.id ?? "");
    setStarted(true);
    setDirty(true);
    announce("Blank script opened");
  }

  async function saveRevision() {
    let content: ProjectScriptContent;
    try {
      if (!changeSummary.trim()) throw new Error("Add a change summary before saving a revision");
      content = contentFromEditable(draft);
    } catch (caught) {
      setValidationError(caught instanceof Error ? caught.message : "Review the script fields before saving");
      return;
    }

    if (demoMode) {
      const revision: RevisionChoice = {
        key: `local-demo-${Date.now()}`,
        revisionNumber: (demoHead?.revisionNumber ?? 0) + 1,
        state: "draft",
        changeSummary: changeSummary.trim(),
        createdAt: new Date().toISOString(),
        content,
      };
      setDemoRevisions((current) => [
        revision,
        ...current.map((item) => ({ ...item, state: "superseded" as const })),
      ]);
      setSelectedRevisionKey(revision.key);
      setChangeSummary("");
      setDirty(false);
      setValidationError(null);
      announce("Local demo revision saved for this preview");
      return;
    }

    const snapshot = projectScript.snapshot;
    if (!snapshot) return;
    const saved = await projectScript.appendRevision({
      expectedAuthorityVersion: snapshot.authorityVersion,
      baseRevisionId: snapshot.head?.revisionId ?? null,
      changeSummary: changeSummary.trim(),
      content,
    });
    if (saved) {
      setDirty(false);
      setChangeSummary("");
      setValidationError(null);
    }
  }

  async function submitCurrentRevision() {
    if (dirty) {
      setValidationError("Save the current changes as a revision before submitting");
      return;
    }
    if (demoMode) {
      if (!demoHead) return;
      setDemoRevisions((current) => current.map((revision, index) =>
        index === 0 ? { ...revision, state: "submitted" } : revision,
      ));
      setDecisionNote("");
      announce("Local demo draft marked submitted for this preview");
      return;
    }
    const snapshot = projectScript.snapshot;
    if (!snapshot?.head) return;
    await projectScript.submitRevision({
      expectedAuthorityVersion: snapshot.authorityVersion,
      revisionId: snapshot.head.revisionId,
      note: null,
    });
  }

  async function recordDecision(decision: ProjectScriptDecision) {
    const note = decisionNote.trim();
    if (!note) {
      setValidationError("A producer note is required for either decision");
      return;
    }
    if (demoMode) {
      setDemoRevisions((current) => current.map((revision, index) =>
        index === 0 ? { ...revision, state: decision } : revision,
      ));
      setDecisionNote("");
      setValidationError(null);
      announce("Local demo producer decision recorded for this preview");
      return;
    }
    const snapshot = projectScript.snapshot;
    if (!snapshot?.head) return;
    setPendingDecision(decision);
    try {
      const recorded = await projectScript.decideRevision({
        expectedAuthorityVersion: snapshot.authorityVersion,
        revisionId: snapshot.head.revisionId,
        decision,
        note,
      });
      if (recorded) {
        setDecisionNote("");
        setValidationError(null);
        if (decision === "approved") await scriptPlan.reload();
      }
    } finally {
      setPendingDecision(null);
    }
  }

  async function generatePlanDraft() {
    if (!handoffPlan || handoffDrafted || handoffActivated) return;
    if (demoMode) {
      setDemoPlanDrafted(true);
      announce("Local governed production plan draft generated");
      return;
    }
    await scriptPlan.generateDraft();
  }

  async function approvePlanDraft() {
    const note = planApprovalNote.trim();
    if (!note) {
      setValidationError("A producer note is required before activating the production plan");
      return;
    }
    if (!handoffPlan || !handoffDrafted || handoffActivated) return;
    if (demoMode) {
      replaceDemoProjectTasksFromScript(projectId, handoffPlan.tasks);
      setDemoPlanActivated(true);
      setPlanApprovalNote("");
      setValidationError(null);
      announce("Local production plan activated from the approved script");
      await onPlanMaterialized?.();
      return;
    }
    const approved = await scriptPlan.approveDraft(note);
    if (approved) {
      setPlanApprovalNote("");
      setValidationError(null);
      await onPlanMaterialized?.();
    }
  }

  function selectRevision(key: string) {
    setSelectedRevisionKey(key);
    setValidationError(null);
    const choice = revisionChoices.find((revision) => revision.key === key);
    if (demoMode && choice?.content && key === headKey) {
      const nextDraft = editableFromContent(choice.content);
      setDraft(nextDraft);
      setSelectedSectionId(nextDraft.sections[0]?.id ?? "");
    }
  }

  const liveMessage = localAnnouncement || scriptPlan.announcement || projectScript.announcement;
  const errorMessage = validationError || (projectScript.conflict ? null : projectScript.error);

  if (!demoMode && !projectScript.ready && projectScript.loading) {
    return (
      <section className={styles.workspace} aria-label={`${projectName} Co-Script workspace`} aria-busy="true">
        <div className={styles.statePanel} role="status">
          <LoaderCircle className={styles.spin} size={24} aria-hidden="true" />
          <strong>Loading Co-Script</strong>
          <p>Fetching the latest immutable revision and its review state.</p>
          <div className={styles.loadingRows} aria-hidden="true"><span /><span /><span /></div>
        </div>
      </section>
    );
  }

  if (!demoMode && !projectScript.ready && projectScript.error) {
    return (
      <section className={styles.workspace} aria-label={`${projectName} Co-Script workspace`}>
        <div className={styles.statePanel} role="alert">
          <AlertTriangle size={24} aria-hidden="true" />
          <strong>Co-Script is unavailable</strong>
          <p>{projectScript.error}</p>
          <button className={styles.retryButton} type="button" onClick={() => void projectScript.reload()}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.workspace}
      aria-label={`${projectName} Co-Script workspace`}
      aria-busy={isBusy || undefined}
      data-demo={demoMode ? "true" : "false"}
    >
      <header className={styles.topbar}>
        <div className={styles.titleGroup}>
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}>Co-Script / {projectName}</span>
            {demoMode ? <span className={styles.demoBadge}>Local demo draft</span> : null}
          </div>
          <div className={styles.titleRow}>
            <h2>{draft.title || "Untitled script"}</h2>
            <span className={styles.statusBadge} data-status={visibleStatus}>
              {formatStatus(visibleStatus)}
            </span>
            {isReadOnly ? (
              <span className={styles.readOnlyBadge}><LockKeyhole size={11} aria-hidden="true" /> Read only</span>
            ) : null}
          </div>
        </div>

        <div className={styles.statusCluster}>
          {revisionChoices.length > 0 ? (
            <label className={styles.historyField}>
              <span>Revision history</span>
              <select
                aria-label="Select script revision"
                value={selectedRevision?.key ?? ""}
                onChange={(event) => selectRevision(event.target.value)}
              >
                {revisionChoices.map((revision) => (
                  <option key={revision.key} value={revision.key}>
                    Revision {revision.revisionNumber} / {formatStatus(revision.state)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      {demoMode ? (
        <div className={styles.demoBanner} role="note">
          <FileText size={15} aria-hidden="true" />
          <span>This is a local-only demo. Changes stay in this preview, never call project APIs, and are not authoritative.</span>
        </div>
      ) : null}

      {projectScript.conflict ? (
        <div className={styles.stateBanner} role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <div><strong>Revision conflict</strong><p>{projectScript.conflict}</p></div>
          <button className={styles.retryButton} type="button" onClick={() => void projectScript.reload()}>
            <RefreshCw size={13} aria-hidden="true" /> Reload latest
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        <div className={styles.stateBanner} data-tone="error" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <div><strong>Action needed</strong><p>{errorMessage}</p></div>
        </div>
      ) : null}

      <p className={styles.liveRegion} aria-live="polite" aria-atomic="true">{liveMessage}</p>

      {!started ? (
        <div className={styles.emptyPanel}>
          <FilePlus2 size={25} aria-hidden="true" />
          <strong>No script revisions yet</strong>
          <p>
            {canRevise
              ? "Start the first project-scoped script draft. Saving will append revision 1."
              : "A producer or editor must create the first script revision."}
          </p>
          {canRevise ? (
            <button className={styles.primaryButton} type="button" onClick={startScript}>
              <Plus size={14} aria-hidden="true" /> Start script
            </button>
          ) : null}
        </div>
      ) : isHistoricalRevision && selectedRevision ? (
        <div className={styles.emptyPanel}>
          <History size={25} aria-hidden="true" />
          <strong>Revision {selectedRevision.revisionNumber} is immutable history</strong>
          <p>
            {selectedRevision.changeSummary || "No change summary was recorded."}
            {` Saved ${formatHistoryDate(selectedRevision.createdAt)}. Select the latest revision to view or continue the script.`}
          </p>
          <button className={styles.secondaryButton} type="button" onClick={() => selectRevision(headKey)}>
            <RefreshCw size={14} aria-hidden="true" /> Return to latest revision
          </button>
        </div>
      ) : (
        <>
          <div className={styles.actionBar}>
            <span className={styles.actionHint}>
              {dirty
                ? "Unsaved edits must become a new immutable revision."
                : headState === "submitted"
                  ? "Submitted revisions are locked while awaiting a producer decision."
                  : headState === "approved"
                    ? "This approved revision is read only."
                    : "Current revision is synchronized."}
            </span>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={!canSubmit || isBusy || !headKey}
              onClick={() => void submitCurrentRevision()}
              title={dirty ? "Save a revision before submitting" : "Submit current revision"}
            >
              {projectScript.operation === "submit"
                ? <LoaderCircle className={styles.spin} size={14} aria-hidden="true" />
                : <Send size={14} aria-hidden="true" />}
              {projectScript.operation === "submit" ? "Submitting" : "Submit for review"}
            </button>
          </div>

          {isReadOnly ? (
            <div className={styles.readOnlyNotice} role="status">
              <LockKeyhole size={15} aria-hidden="true" />
              <div>
                <strong>{headState === "submitted" ? "Submitted revision" : "Read-only revision"}</strong>
                <p>
                  {headState === "submitted"
                    ? "Editing is paused until a producer records a decision."
                    : "Your role or the current revision state does not allow edits."}
                </p>
              </div>
            </div>
          ) : null}

          {showPlanHandoff ? (
            <section className={styles.planHandoff} aria-label="Approved script production plan handoff">
              <header className={styles.planHandoffHeader}>
                <span className={styles.planHandoffIcon} aria-hidden="true">
                  <ListChecks size={17} />
                </span>
                <div>
                  <strong>Production plan handoff</strong>
                  <p>Convert the exact approved script into reviewable project tasks before activation.</p>
                </div>
                <span
                  className={styles.handoffStatus}
                  data-state={handoffActivated ? "active" : handoffDrafted ? "draft" : "ready"}
                >
                  {handoffActivated ? "Plan active" : handoffDrafted ? "Draft ready" : "Ready to generate"}
                </span>
              </header>

              {!demoMode && scriptPlan.loading && !scriptPlan.ready ? (
                <div className={styles.handoffLoading} role="status">
                  <LoaderCircle className={styles.spin} size={15} aria-hidden="true" />
                  Loading the approved script handoff
                </div>
              ) : null}

              {!demoMode && scriptPlan.error ? (
                <div className={styles.handoffError} role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>{scriptPlan.error}</span>
                  <button className={styles.retryButton} type="button" onClick={() => void scriptPlan.reload()}>
                    <RefreshCw size={13} aria-hidden="true" /> Retry
                  </button>
                </div>
              ) : null}

              {handoffPlan ? (
                <div className={styles.planPreview}>
                  <div className={styles.planPreviewSummary}>
                    <span>Derived plan</span>
                    <strong>{handoffPlan.title}</strong>
                    <p>{handoffPlan.summary}</p>
                    <small>{handoffPlan.tasks.length} section task{handoffPlan.tasks.length === 1 ? "" : "s"}</small>
                  </div>
                  <ol className={styles.planTaskPreview} aria-label="Derived production tasks">
                    {handoffPlan.tasks.slice(0, 4).map((task, index) => (
                      <li key={task.clientTaskId}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div><strong>{task.title}</strong><p>{task.description}</p></div>
                      </li>
                    ))}
                    {handoffPlan.tasks.length > 4 ? (
                      <li className={styles.moreTasks}>
                        <span>+</span><div><strong>{handoffPlan.tasks.length - 4} more tasks</strong></div>
                      </li>
                    ) : null}
                  </ol>
                </div>
              ) : null}

              {handoffPlan && !handoffDrafted && !handoffActivated ? (
                <footer className={styles.handoffActions}>
                  <div>
                    <ShieldCheck size={15} aria-hidden="true" />
                    <span>Generation stores an immutable draft. It does not change the active plan.</span>
                  </div>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    disabled={handoffBusy || (!demoMode && !scriptPlan.proposal?.permissions.canGenerate)}
                    onClick={() => void generatePlanDraft()}
                  >
                    {scriptPlan.operation === "generate"
                      ? <LoaderCircle className={styles.spin} size={14} aria-hidden="true" />
                      : <ListChecks size={14} aria-hidden="true" />}
                    {scriptPlan.operation === "generate" ? "Generating draft" : "Generate governed draft"}
                  </button>
                </footer>
              ) : null}

              {handoffPlan && handoffDrafted && !handoffActivated ? (
                <footer className={styles.handoffDecision}>
                  <label className={styles.handoffNote}>
                    <span>Required producer approval note</span>
                    <textarea
                      rows={2}
                      maxLength={4000}
                      required
                      value={planApprovalNote}
                      onChange={(event) => {
                        setPlanApprovalNote(event.target.value);
                        setValidationError(null);
                      }}
                      placeholder="Confirm why this approved script is ready to become the active production plan"
                    />
                  </label>
                  <button
                    className={styles.decisionButton}
                    type="button"
                    disabled={
                      !planApprovalNote.trim()
                      || handoffBusy
                      || (!demoMode && !scriptPlan.proposal?.permissions.canApprove)
                    }
                    onClick={() => void approvePlanDraft()}
                  >
                    {scriptPlan.operation === "approve"
                      ? <LoaderCircle className={styles.spin} size={14} aria-hidden="true" />
                      : <ShieldCheck size={14} aria-hidden="true" />}
                    {scriptPlan.operation === "approve" ? "Activating plan" : "Approve and activate plan"}
                  </button>
                </footer>
              ) : null}

              {handoffPlan && handoffActivated ? (
                <footer className={styles.handoffComplete}>
                  <div><ShieldCheck size={16} aria-hidden="true" /><span>The approved script is bound to the active production plan.</span></div>
                  <button className={styles.secondaryButton} type="button" onClick={() => void onPlanMaterialized?.()}>
                    Open production tasks
                  </button>
                </footer>
              ) : null}
            </section>
          ) : null}

          <div className={styles.metadataBand}>
            <label className={styles.field}>
              <span>Script title</span>
              <input
                type="text"
                maxLength={240}
                value={draft.title}
                disabled={!canEdit}
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Format</span>
              <select
                value={draft.format}
                disabled={!canEdit}
                onChange={(event) => updateDraft({ format: event.target.value as ProjectScriptFormat })}
              >
                {PROJECT_SCRIPT_FORMATS.map((format) => (
                  <option key={format} value={format}>{FORMAT_LABELS[format]}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Runtime (minutes)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                inputMode="decimal"
                value={draft.runtimeMinutes}
                disabled={!canEdit}
                onChange={(event) => updateDraft({ runtimeMinutes: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Logline</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={draft.logline}
                disabled={!canEdit}
                onChange={(event) => updateDraft({ logline: event.target.value })}
                placeholder="One sentence that frames the story"
              />
            </label>
          </div>

          <div className={styles.editorGrid}>
            <aside className={styles.sectionRail} aria-label="Script sections">
              <div className={styles.railHeader}>
                <div><strong>Sections</strong><span>{draft.sections.length} total</span></div>
                <button
                  className={styles.iconButton}
                  type="button"
                  disabled={!canEdit}
                  aria-label="Add section"
                  title="Add section"
                  onClick={addSection}
                >
                  <Plus size={15} aria-hidden="true" />
                </button>
              </div>
              <ol className={styles.sectionList}>
                {draft.sections.map((section, index) => (
                  <li
                    className={styles.sectionItem}
                    data-active={section.id === selectedSection?.id ? "true" : "false"}
                    key={section.id}
                  >
                    <button
                      id={`script-section-${index}`}
                      className={styles.sectionButton}
                      type="button"
                      aria-current={section.id === selectedSection?.id ? "true" : undefined}
                      onClick={() => setSelectedSectionId(section.id)}
                      onKeyDown={(event) => handleSectionKeyDown(event, index)}
                    >
                      <span>{index + 1}</span><span>{section.heading || "Untitled section"}</span>
                    </button>
                    <div className={styles.sectionActions}>
                      <button
                        className={styles.iconButton}
                        type="button"
                        disabled={!canEdit || index === 0}
                        aria-label={`Move ${section.heading || `section ${index + 1}`} up`}
                        title="Move section up"
                        onClick={() => moveSection(index, -1)}
                      >
                        <ArrowUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        className={styles.iconButton}
                        type="button"
                        disabled={!canEdit || index === draft.sections.length - 1}
                        aria-label={`Move ${section.heading || `section ${index + 1}`} down`}
                        title="Move section down"
                        onClick={() => moveSection(index, 1)}
                      >
                        <ArrowDown size={13} aria-hidden="true" />
                      </button>
                      <button
                        className={styles.iconButton}
                        data-danger="true"
                        type="button"
                        disabled={!canEdit || draft.sections.length === 1}
                        aria-label={`Remove ${section.heading || `section ${index + 1}`}`}
                        title="Remove section"
                        onClick={() => removeSection(section.id)}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>

            <div className={styles.canvas}>
              {selectedSection ? (
                <>
                  <div className={styles.canvasHeader}>
                    <div className={styles.sectionTitleWrap}>
                      <span className={styles.sectionLabel}>Section {selectedSectionIndex + 1}</span>
                      <input
                        className={styles.sectionTitleInput}
                        type="text"
                        maxLength={240}
                        aria-label={`Section ${selectedSectionIndex + 1} heading`}
                        value={selectedSection.heading}
                        disabled={!canEdit}
                        onChange={(event) => updateSelectedSection({ heading: event.target.value })}
                      />
                    </div>
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.iconButton}
                        type="button"
                        disabled={!canEdit || selectedSectionIndex === 0}
                        aria-label="Move selected section up"
                        title="Move section up"
                        onClick={() => moveSection(selectedSectionIndex, -1)}
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        className={styles.iconButton}
                        type="button"
                        disabled={!canEdit || selectedSectionIndex === draft.sections.length - 1}
                        aria-label="Move selected section down"
                        title="Move section down"
                        onClick={() => moveSection(selectedSectionIndex, 1)}
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                      <button
                        className={styles.iconButton}
                        data-danger="true"
                        type="button"
                        disabled={!canEdit || draft.sections.length === 1}
                        aria-label="Remove selected section"
                        title="Remove section"
                        onClick={() => removeSection(selectedSection.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <label className={styles.blockField} data-wide="true">
                      <span>Section summary</span>
                      <textarea
                        rows={2}
                        maxLength={4000}
                        value={selectedSection.summary}
                        disabled={!canEdit}
                        onChange={(event) => updateSelectedSection({ summary: event.target.value })}
                        placeholder="What this section needs to accomplish"
                      />
                    </label>
                    <label className={styles.blockField}>
                      <span>Estimated duration (seconds)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={selectedSection.estimatedDurationSeconds}
                        disabled={!canEdit}
                        onChange={(event) => updateSelectedSection({ estimatedDurationSeconds: event.target.value })}
                      />
                    </label>
                  </div>

                  <ol className={styles.blockList} aria-label={`${selectedSection.heading || "Section"} blocks`}>
                    {selectedSection.blocks.map((block, index) => (
                      <li className={styles.block} key={block.id}>
                        <span className={styles.blockIndex}>{index + 1}</span>
                        <div className={styles.blockFields}>
                          <label className={styles.blockField}>
                            <span>Block kind</span>
                            <select
                              value={block.kind}
                              disabled={!canEdit}
                              aria-label={`Block ${index + 1} kind`}
                              onChange={(event) => updateBlock(block.id, {
                                kind: event.target.value as ProjectScriptBlockKind,
                              })}
                            >
                              {PROJECT_SCRIPT_BLOCK_KINDS.map((kind) => (
                                <option key={kind} value={kind}>{BLOCK_KIND_LABELS[kind]}</option>
                              ))}
                            </select>
                          </label>
                          {blockSupportsSpeaker(block.kind) ? (
                            <label className={styles.blockField}>
                              <span>Speaker</span>
                              <input
                                type="text"
                                maxLength={240}
                                value={block.speaker}
                                disabled={!canEdit}
                                onChange={(event) => updateBlock(block.id, { speaker: event.target.value })}
                                placeholder="Speaker or role"
                              />
                            </label>
                          ) : null}
                          {blockSupportsParenthetical(block.kind) ? (
                            <label className={styles.blockField}>
                              <span>Parenthetical</span>
                              <input
                                type="text"
                                maxLength={1000}
                                value={block.parenthetical}
                                disabled={!canEdit}
                                onChange={(event) => updateBlock(block.id, { parenthetical: event.target.value })}
                                placeholder="Delivery or performance note"
                              />
                            </label>
                          ) : null}
                          <label className={styles.blockField} data-wide="true">
                            <span>{BLOCK_KIND_LABELS[block.kind]} text</span>
                            <textarea
                              data-kind={block.kind}
                              rows={block.kind === "dialogue" || block.kind === "voice_over" ? 4 : 3}
                              maxLength={20000}
                              value={block.text}
                              disabled={!canEdit}
                              aria-label={`Block ${index + 1} ${BLOCK_KIND_LABELS[block.kind]} text`}
                              onChange={(event) => updateBlock(block.id, { text: event.target.value })}
                              placeholder={blockPlaceholder(block.kind)}
                            />
                          </label>
                        </div>
                        <div className={styles.blockActions}>
                          <button
                            className={styles.iconButton}
                            type="button"
                            disabled={!canEdit || index === 0}
                            aria-label={`Move block ${index + 1} up`}
                            title="Move block up"
                            onClick={() => moveBlock(index, -1)}
                          >
                            <ArrowUp size={14} aria-hidden="true" />
                          </button>
                          <button
                            className={styles.iconButton}
                            type="button"
                            disabled={!canEdit || index === selectedSection.blocks.length - 1}
                            aria-label={`Move block ${index + 1} down`}
                            title="Move block down"
                            onClick={() => moveBlock(index, 1)}
                          >
                            <ArrowDown size={14} aria-hidden="true" />
                          </button>
                          <button
                            className={styles.iconButton}
                            data-danger="true"
                            type="button"
                            disabled={!canEdit || selectedSection.blocks.length === 1}
                            aria-label={`Remove block ${index + 1}`}
                            title="Remove block"
                            onClick={() => removeBlock(block.id)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {selectedSection.blocks.length === 0 ? (
                    <div className={styles.emptyPanel}>
                      <MessageSquareText size={23} aria-hidden="true" />
                      <strong>No blocks in this section</strong>
                      <p>Add the first visual, action, dialogue, or production cue.</p>
                    </div>
                  ) : null}

                  <div className={styles.addBlockRow}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={!canEdit}
                      onClick={addBlock}
                    >
                      <Plus size={14} aria-hidden="true" /> Add block
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className={styles.revisionFooter}>
            <label className={styles.changeSummary}>
              <span>Change summary</span>
              <textarea
                rows={2}
                maxLength={4000}
                required
                value={changeSummary}
                disabled={!canEdit}
                onChange={(event) => {
                  setChangeSummary(event.target.value);
                  setValidationError(null);
                }}
                placeholder="Summarize what changed in this immutable revision"
              />
            </label>
            <div className={styles.footerActions}>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={!canEdit || !dirty || isBusy}
                onClick={() => void saveRevision()}
              >
                {projectScript.operation === "save"
                  ? <LoaderCircle className={styles.spin} size={14} aria-hidden="true" />
                  : <Save size={14} aria-hidden="true" />}
                {projectScript.operation === "save" ? "Saving" : "Save revision"}
              </button>
            </div>
          </div>

          {canDecide ? (
            <div className={styles.decisionBand}>
              <div className={styles.decisionHeading}>
                <strong>Producer decision</strong>
                <p>Record a note with either decision. Status changes only after the receipt is confirmed.</p>
              </div>
              <label className={styles.decisionNote}>
                <span>Required producer note</span>
                <textarea
                  rows={2}
                  maxLength={4000}
                  required
                  value={decisionNote}
                  onChange={(event) => {
                    setDecisionNote(event.target.value);
                    setValidationError(null);
                  }}
                  placeholder="Explain the approval or the requested revision"
                />
              </label>
              <div className={styles.decisionActions}>
                <button
                  className={styles.requestButton}
                  type="button"
                  disabled={!decisionNote.trim() || isBusy}
                  onClick={() => void recordDecision("changes_requested")}
                >
                  {pendingDecision === "changes_requested"
                    ? <LoaderCircle className={styles.spin} size={14} aria-hidden="true" />
                    : <RefreshCw size={14} aria-hidden="true" />}
                  {pendingDecision === "changes_requested" ? "Recording request" : "Request changes"}
                </button>
                <button
                  className={styles.decisionButton}
                  type="button"
                  disabled={!decisionNote.trim() || isBusy}
                  onClick={() => void recordDecision("approved")}
                >
                  {pendingDecision === "approved"
                    ? <LoaderCircle className={styles.spin} size={14} aria-hidden="true" />
                    : <Check size={14} aria-hidden="true" />}
                  {pendingDecision === "approved" ? "Recording approval" : "Record approval"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default ProjectScriptWorkspace;
