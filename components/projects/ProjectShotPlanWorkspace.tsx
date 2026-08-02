"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Clapperboard,
  FileStack,
  History,
  LayoutTemplate,
  ListChecks,
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
import { useProjectShotPlan } from "@/lib/hooks/useProjectShotPlan";
import {
  PROJECT_SHOT_PLAN_COVERAGE_KINDS,
  PROJECT_SHOT_PLAN_FRAMINGS,
  PROJECT_SHOT_PLAN_MOVEMENTS,
  PROJECT_SHOT_PLAN_SCHEMA_VERSION,
  deriveProjectShotPlanContent,
  parseProjectShotPlanContent,
  type ProjectShotPlanContent,
  type ProjectShotPlanCoverageKind,
  type ProjectShotPlanFraming,
  type ProjectShotPlanMovement,
  type ProjectShotPlanScene,
  type ProjectShotPlanShot,
  type ProjectShotPlanState,
} from "@/lib/preproduction/shot-plan";
import {
  PROJECT_SCRIPT_SCHEMA_VERSION,
  type ProjectScriptContent,
} from "@/lib/preproduction/project-script";
import styles from "./ProjectShotPlanWorkspace.module.css";

type ShotPlanView = "storyboard" | "shot-list";

export interface ProjectShotPlanWorkspaceProps {
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

const COVERAGE_LABELS: Record<ProjectShotPlanCoverageKind, string> = {
  establishing: "Establishing",
  coverage: "Coverage",
  interview: "Interview",
  b_roll: "B-roll",
  action: "Action",
  graphic: "Graphic",
  transition: "Transition",
  other: "Other",
};

const FRAMING_LABELS: Record<ProjectShotPlanFraming, string> = {
  unspecified: "Not set",
  extreme_wide: "Extreme wide",
  wide: "Wide",
  medium: "Medium",
  medium_close_up: "Medium close-up",
  close_up: "Close-up",
  extreme_close_up: "Extreme close-up",
  over_shoulder: "Over shoulder",
  two_shot: "Two shot",
  detail: "Detail",
  aerial: "Aerial",
  pov: "POV",
};

const MOVEMENT_LABELS: Record<ProjectShotPlanMovement, string> = {
  unspecified: "Not set",
  locked: "Locked",
  pan: "Pan",
  tilt: "Tilt",
  dolly: "Dolly",
  truck: "Truck",
  crane: "Crane",
  gimbal: "Gimbal",
  handheld: "Handheld",
  drone: "Drone",
  zoom: "Zoom",
};

function demoScript(projectName: string): ProjectScriptContent {
  return {
    schemaVersion: PROJECT_SCRIPT_SCHEMA_VERSION,
    title: `${projectName} story draft`,
    logline: "A clear opening, a grounded customer voice, and a concise path to action.",
    format: "commercial",
    estimatedRuntimeSeconds: 90,
    sections: [
      {
        id: "section-opening",
        heading: "Opening image",
        summary: "Establish the problem in a familiar moment.",
        estimatedDurationSeconds: 20,
        blocks: [
          {
            id: "block-opening-visual",
            kind: "visual",
            text: "Close details of the workday beginning before the room fills.",
            speaker: null,
            parenthetical: null,
          },
          {
            id: "block-opening-text",
            kind: "on_screen_text",
            text: "Better work starts with a clearer plan.",
            speaker: null,
            parenthetical: null,
          },
        ],
      },
      {
        id: "section-proof",
        heading: "Customer proof",
        summary: "Let the interview answer carry the central claim.",
        estimatedDurationSeconds: 45,
        blocks: [
          {
            id: "block-proof-question",
            kind: "interview_question",
            text: "What changed once the team could see the whole production plan?",
            speaker: "Producer",
            parenthetical: null,
          },
          {
            id: "block-proof-broll",
            kind: "b_roll",
            text: "Team reviewing the active plan, then moving into production.",
            speaker: null,
            parenthetical: null,
          },
        ],
      },
      {
        id: "section-close",
        heading: "Close",
        summary: "Resolve with the product and one direct next step.",
        estimatedDurationSeconds: 25,
        blocks: [
          {
            id: "block-close-graphic",
            kind: "graphic",
            text: "Content Co-op / Plan together. Produce with clarity.",
            speaker: null,
            parenthetical: null,
          },
        ],
      },
    ],
  };
}

function formatStatus(value: ProjectShotPlanState) {
  return value.replaceAll("_", " ");
}

function durationLabel(value: number | null) {
  return value === null ? "Duration not set" : `${value}s`;
}

function nextShotOrdinal(scene: ProjectShotPlanScene) {
  const used = new Set(scene.shots.map((shot) => shot.id));
  let ordinal = scene.shots.length + 1;
  while (used.has(`shot-${String(scene.order).padStart(3, "0")}-${String(ordinal).padStart(3, "0")}`)) {
    ordinal += 1;
  }
  return ordinal;
}

function additionalShot(scene: ProjectShotPlanScene): ProjectShotPlanShot {
  const ordinal = nextShotOrdinal(scene);
  const prefix = `${String(scene.order).padStart(3, "0")}-${String(ordinal).padStart(3, "0")}`;
  return {
    id: `shot-${prefix}`,
    order: scene.shots.length + 1,
    scriptBlockIds: [],
    purpose: "Additional approved coverage",
    coverageKind: "coverage",
    framing: "unspecified",
    movement: "unspecified",
    subject: null,
    description: "Visual coverage not yet specified.",
    audioIntent: null,
    estimatedDurationSeconds: null,
    storyboardPanels: [
      {
        id: `panel-${prefix}-001`,
        order: 1,
        visualDescription: "Visual coverage not yet specified.",
        assetId: null,
        versionId: null,
      },
    ],
  };
}

function additionalPanel(shot: ProjectShotPlanShot) {
  const base = shot.id.replace(/^shot-/, "panel-");
  const used = new Set(shot.storyboardPanels.map((panel) => panel.id));
  let ordinal = shot.storyboardPanels.length + 1;
  let id = `${base}-${String(ordinal).padStart(3, "0")}`;
  while (used.has(id)) {
    ordinal += 1;
    id = `${base}-${String(ordinal).padStart(3, "0")}`;
  }
  return {
    id,
    order: shot.storyboardPanels.length + 1,
    visualDescription: "Panel brief not yet specified.",
    assetId: null,
    versionId: null,
  };
}

function normalizeShotOrder(shots: readonly ProjectShotPlanShot[]) {
  return shots.map((shot, index) => ({ ...shot, order: index + 1 }));
}

function cloneContent(content: ProjectShotPlanContent): ProjectShotPlanContent {
  return structuredClone(content);
}

export function ProjectShotPlanWorkspace({
  projectId,
  projectName,
  demoMode,
  workspaceRole,
}: ProjectShotPlanWorkspaceProps) {
  const authority = useProjectShotPlan(projectId, !demoMode);
  const seededDemoContent = useMemo(
    () => deriveProjectShotPlanContent(demoScript(projectName)),
    [projectName],
  );
  const incomingHead = demoMode ? null : authority.snapshot?.head ?? null;
  const contentKey = demoMode ? `demo:${projectName}` : incomingHead?.revisionId ?? null;
  const [view, setView] = useState<ShotPlanView>("storyboard");
  const [draft, setDraft] = useState<ProjectShotPlanContent | null>(() =>
    demoMode ? cloneContent(seededDemoContent) : null,
  );
  const [baseline, setBaseline] = useState<ProjectShotPlanContent | null>(() =>
    demoMode ? cloneContent(seededDemoContent) : null,
  );
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(
    seededDemoContent.scenes[0]?.id ?? null,
  );
  const [selectedShotId, setSelectedShotId] = useState<string | null>(
    seededDemoContent.scenes[0]?.shots[0]?.id ?? null,
  );
  const [changeSummary, setChangeSummary] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [demoRevision, setDemoRevision] = useState(1);
  const [demoState, setDemoState] = useState<ProjectShotPlanState>("draft");
  const [demoActiveRevision, setDemoActiveRevision] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [loadedContentKey, setLoadedContentKey] = useState<string | null>(contentKey);

  if (loadedContentKey !== contentKey) {
    const nextContent = demoMode
      ? seededDemoContent
      : incomingHead?.content ?? null;
    setLoadedContentKey(contentKey);
    setDraft(nextContent ? cloneContent(nextContent) : null);
    setBaseline(nextContent ? cloneContent(nextContent) : null);
    setSelectedSceneId(nextContent?.scenes[0]?.id ?? null);
    setSelectedShotId(nextContent?.scenes[0]?.shots[0]?.id ?? null);
    setChangeSummary("");
    setDecisionNote("");
    if (demoMode) {
      setDemoRevision(1);
      setDemoState("draft");
      setDemoActiveRevision(null);
    }
  }

  const head = incomingHead;
  const state = demoMode ? demoState : head?.state ?? null;
  const revisionNumber = demoMode ? demoRevision : head?.revisionNumber ?? null;
  const activeRevisionNumber = demoMode
    ? demoActiveRevision
    : authority.snapshot?.active?.revisionNumber ?? null;
  const selectedScene = draft?.scenes.find((scene) => scene.id === selectedSceneId)
    ?? draft?.scenes[0]
    ?? null;
  const selectedShot = selectedScene?.shots.find((shot) => shot.id === selectedShotId)
    ?? selectedScene?.shots[0]
    ?? null;
  const hasChanges = Boolean(
    draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline),
  );
  const roleCanWrite = WRITE_ROLES.has(workspaceRole);
  const roleCanDecide = PRODUCER_ROLES.has(workspaceRole);
  const canRevise = demoMode
    ? roleCanWrite && state !== "submitted"
    : Boolean(authority.snapshot?.permissions.canRevise && head);
  const canSubmit = demoMode
    ? roleCanWrite
      && Boolean(draft)
      && (state === "draft" || state === "changes_requested")
      && !hasChanges
    : Boolean(
        authority.snapshot?.permissions.canSubmit
        && head
        && (head.state === "draft" || head.state === "changes_requested")
        && !hasChanges,
      );
  const canDecide = demoMode
    ? roleCanDecide && state === "submitted"
    : Boolean(authority.snapshot?.permissions.canDecide && head?.state === "submitted");
  const shotCount = draft?.scenes.reduce((total, scene) => total + scene.shots.length, 0) ?? 0;
  const panelCount = draft?.scenes.reduce(
    (total, scene) => total + scene.shots.reduce(
      (sceneTotal, shot) => sceneTotal + shot.storyboardPanels.length,
      0,
    ),
    0,
  ) ?? 0;

  function updateScene(sceneId: string, updater: (scene: ProjectShotPlanScene) => ProjectShotPlanScene) {
    if (!canRevise) return;
    setDraft((current) => current
      ? { ...current, scenes: current.scenes.map((scene) => scene.id === sceneId ? updater(scene) : scene) }
      : current,
    );
    setLocalError(null);
  }

  function updateShot(updater: (shot: ProjectShotPlanShot) => ProjectShotPlanShot) {
    if (!selectedScene || !selectedShot || !canRevise) return;
    updateScene(selectedScene.id, (scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => shot.id === selectedShot.id ? updater(shot) : shot),
    }));
  }

  function moveShot(sceneId: string, shotId: string, direction: -1 | 1) {
    const scene = draft?.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene || !canRevise) return;
    const index = scene.shots.findIndex((shot) => shot.id === shotId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scene.shots.length) return;
    updateScene(sceneId, (currentScene) => {
      const shots = [...currentScene.shots];
      [shots[index], shots[target]] = [shots[target], shots[index]];
      return { ...currentScene, shots: normalizeShotOrder(shots) };
    });
    setSelectedShotId(shotId);
  }

  function addShot() {
    if (!selectedScene || !canRevise) return;
    const shot = additionalShot(selectedScene);
    updateScene(selectedScene.id, (scene) => ({ ...scene, shots: [...scene.shots, shot] }));
    setSelectedShotId(shot.id);
  }

  function removeSelectedShot() {
    if (!selectedScene || !selectedShot || selectedScene.shots.length <= 1 || !canRevise) return;
    const index = selectedScene.shots.findIndex((shot) => shot.id === selectedShot.id);
    const remaining = normalizeShotOrder(selectedScene.shots.filter((shot) => shot.id !== selectedShot.id));
    updateScene(selectedScene.id, (scene) => ({ ...scene, shots: remaining }));
    setSelectedShotId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
  }

  function addPanel() {
    if (!selectedShot || !canRevise) return;
    updateShot((shot) => ({
      ...shot,
      storyboardPanels: [...shot.storyboardPanels, additionalPanel(shot)],
    }));
  }

  function movePanel(panelId: string, direction: -1 | 1) {
    if (!selectedShot || !canRevise) return;
    const index = selectedShot.storyboardPanels.findIndex((panel) => panel.id === panelId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= selectedShot.storyboardPanels.length) return;
    updateShot((shot) => {
      const panels = [...shot.storyboardPanels];
      [panels[index], panels[target]] = [panels[target], panels[index]];
      return {
        ...shot,
        storyboardPanels: panels.map((panel, panelIndex) => ({
          ...panel,
          order: panelIndex + 1,
        })),
      };
    });
  }

  function removePanel(panelId: string) {
    if (!selectedShot || selectedShot.storyboardPanels.length <= 1 || !canRevise) return;
    updateShot((shot) => ({
      ...shot,
      storyboardPanels: shot.storyboardPanels
        .filter((panel) => panel.id !== panelId)
        .map((panel, index) => ({ ...panel, order: index + 1 })),
    }));
  }

  async function generatePlan() {
    setLocalError(null);
    if (demoMode) {
      const next = cloneContent(seededDemoContent);
      setDraft(next);
      setBaseline(cloneContent(next));
      setDemoRevision(1);
      setDemoState("draft");
      setSelectedSceneId(next.scenes[0]?.id ?? null);
      setSelectedShotId(next.scenes[0]?.shots[0]?.id ?? null);
      setAnnouncement("Governed shot plan revision generated from the approved script");
      return;
    }
    await authority.generateRevision();
  }

  async function saveRevision() {
    if (!draft || !hasChanges || !changeSummary.trim()) return;
    setLocalError(null);
    try {
      const content = parseProjectShotPlanContent(draft);
      if (demoMode) {
        setDemoRevision((value) => value + 1);
        setDemoState("draft");
        setDraft(cloneContent(content));
        setBaseline(cloneContent(content));
        setChangeSummary("");
        setAnnouncement("Shot plan revision saved");
        return;
      }
      const saved = await authority.appendRevision({
        content,
        changeSummary: changeSummary.trim(),
      });
      if (saved) setChangeSummary("");
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "The shot plan revision is invalid");
    }
  }

  async function submitRevision() {
    if (!canSubmit) return;
    setLocalError(null);
    if (demoMode) {
      setDemoState("submitted");
      setAnnouncement("Shot plan submitted for producer review");
      return;
    }
    if (head) await authority.submitRevision({ revisionId: head.revisionId, note: decisionNote.trim() || null });
  }

  async function decide(decision: "approved" | "changes_requested") {
    if (!canDecide || (decision === "changes_requested" && !decisionNote.trim())) return;
    setLocalError(null);
    if (demoMode) {
      setDemoState(decision);
      if (decision === "approved") setDemoActiveRevision(demoRevision);
      setDecisionNote("");
      setAnnouncement(decision === "approved" ? "Shot plan approved and activated" : "Changes requested");
      return;
    }
    if (head) {
      const decided = await authority.decideRevision({
        revisionId: head.revisionId,
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
    <section className={styles.workspace} aria-label="Governed shot plan">
      <p className={styles.srOnly} aria-live="polite">{liveAnnouncement}</p>
      <header className={styles.topbar}>
        <div className={styles.titleGroup}>
          <span className={styles.icon}><Clapperboard size={18} /></span>
          <div>
            <span>Approved script + active production plan</span>
            <h3>{draft?.title ?? `${projectName} shot plan`}</h3>
          </div>
        </div>
        <div className={styles.statusGroup}>
          {revisionNumber ? <span className={styles.revisionBadge}>v{revisionNumber}</span> : null}
          {state ? <span className={styles.statusBadge} data-state={state}>{formatStatus(state)}</span> : null}
          {head?.stale ? <span className={styles.staleBadge}>Sources changed</span> : null}
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

      {!demoMode && authority.loading && !authority.ready ? (
        <div className={styles.loadingState} role="status">
          <LoaderCircle size={18} className={styles.spinner} />
          Loading governed shot plan…
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
            <strong>{authority.snapshot?.source ? "Create the first shot-plan revision" : "Shot-plan sources are not ready"}</strong>
            <p>
              {authority.snapshot?.source
                ? "Generate a conservative first pass from the exact approved script and its active bound production plan."
                : "Approve a script and activate its governed production plan before creating shots."}
            </p>
          </div>
          {authority.snapshot?.source && authority.snapshot.permissions.canGenerate ? (
            <button type="button" className={styles.primaryButton} onClick={() => void generatePlan()} disabled={operation !== null}>
              {operation === "generate" ? <LoaderCircle className={styles.spinner} size={15} /> : <Clapperboard size={15} />}
              Generate shot plan
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className={styles.controlBar}>
            <div className={styles.viewSwitcher} role="group" aria-label="Shot plan view">
              <button type="button" aria-pressed={view === "storyboard"} onClick={() => setView("storyboard")}>
                <LayoutTemplate size={14} /> Storyboard
              </button>
              <button type="button" aria-pressed={view === "shot-list"} onClick={() => setView("shot-list")}>
                <ListChecks size={14} /> Shot list
              </button>
            </div>
            <div className={styles.planFacts}>
              <span>{draft.scenes.length} scenes</span>
              <span>{shotCount} shots</span>
              <span>{panelCount} text panels</span>
              {!demoMode && authority.snapshot?.source ? (
                <span>Script v{authority.snapshot.source.scriptRevisionNumber} · Plan v{authority.snapshot.source.productionPlanRevisionNumber}</span>
              ) : null}
            </div>
          </div>

          <div className={styles.body}>
            <nav className={styles.sceneRail} aria-label="Shot-plan scenes">
              <div className={styles.railHeading}>
                <span>Scenes</span>
                <strong>{draft.scenes.length}</strong>
              </div>
              <div className={styles.sceneList}>
                {draft.scenes.map((scene) => (
                  <button
                    type="button"
                    key={scene.id}
                    aria-current={scene.id === selectedScene?.id ? "true" : undefined}
                    onClick={() => {
                      setSelectedSceneId(scene.id);
                      setSelectedShotId(scene.shots[0]?.id ?? null);
                    }}
                  >
                    <span>{String(scene.order).padStart(2, "0")}</span>
                    <div>
                      <strong>{scene.heading}</strong>
                      <small>{scene.shots.length} shots · {durationLabel(scene.estimatedDurationSeconds)}</small>
                    </div>
                  </button>
                ))}
              </div>
            </nav>

            <main className={styles.canvas}>
              {selectedScene ? (
                <>
                  <header className={styles.sceneHeader}>
                    <div>
                      <span>Scene {String(selectedScene.order).padStart(2, "0")}</span>
                      <h4>{selectedScene.heading}</h4>
                      <p>{selectedScene.objective ?? "No objective recorded for this script section."}</p>
                    </div>
                    {canRevise ? (
                      <button type="button" className={styles.secondaryButton} onClick={addShot}>
                        <Plus size={14} /> Add shot
                      </button>
                    ) : null}
                  </header>

                  {view === "storyboard" ? (
                    <div className={styles.storyboardGrid}>
                      {selectedScene.shots.map((shot) => (
                        <button
                          type="button"
                          key={shot.id}
                          className={styles.storyboardCard}
                          data-selected={shot.id === selectedShot?.id || undefined}
                          onClick={() => setSelectedShotId(shot.id)}
                          aria-pressed={shot.id === selectedShot?.id}
                          aria-label={`Select shot ${selectedScene.order}.${shot.order}`}
                        >
                          <div className={styles.cardHeading}>
                            <span>Shot {String(shot.order).padStart(2, "0")}</span>
                            <strong>{COVERAGE_LABELS[shot.coverageKind]}</strong>
                          </div>
                          {shot.storyboardPanels.map((panel) => (
                            <div className={styles.textPanel} key={panel.id}>
                              <span>Panel {panel.order} · Text brief</span>
                              <p>{panel.visualDescription}</p>
                            </div>
                          ))}
                          <div className={styles.cardMeta}>
                            <span>{FRAMING_LABELS[shot.framing]}</span>
                            <span>{MOVEMENT_LABELS[shot.movement]}</span>
                            <span>{durationLabel(shot.estimatedDurationSeconds)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.shotTable} role="table" aria-label={`${selectedScene.heading} shot list`}>
                      <div className={styles.shotTableHead} role="row">
                        <span>Shot</span><span>Purpose</span><span>Coverage</span><span>Framing</span><span>Movement</span><span>Duration</span><span>Order</span>
                      </div>
                      {selectedScene.shots.map((shot, index) => (
                        <div
                          className={styles.shotRow}
                          data-selected={shot.id === selectedShot?.id || undefined}
                          role="row"
                          key={shot.id}
                          onClick={() => setSelectedShotId(shot.id)}
                        >
                          <button
                            type="button"
                            className={styles.shotSelect}
                            aria-label={`Select shot ${selectedScene.order}.${shot.order}`}
                            aria-pressed={shot.id === selectedShot?.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedShotId(shot.id);
                            }}
                          >
                            {String(selectedScene.order).padStart(2, "0")}.{String(shot.order).padStart(2, "0")}
                          </button>
                          <span>{shot.purpose}</span>
                          <span>{COVERAGE_LABELS[shot.coverageKind]}</span>
                          <span>{FRAMING_LABELS[shot.framing]}</span>
                          <span>{MOVEMENT_LABELS[shot.movement]}</span>
                          <span>{durationLabel(shot.estimatedDurationSeconds)}</span>
                          <span className={styles.rowActions}>
                            <button type="button" title="Move shot up" aria-label="Move shot up" disabled={!canRevise || index === 0} onClick={(event) => { event.stopPropagation(); moveShot(selectedScene.id, shot.id, -1); }}>
                              <ArrowUp size={14} />
                            </button>
                            <button type="button" title="Move shot down" aria-label="Move shot down" disabled={!canRevise || index === selectedScene.shots.length - 1} onClick={(event) => { event.stopPropagation(); moveShot(selectedScene.id, shot.id, 1); }}>
                              <ArrowDown size={14} />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </main>

            {selectedScene && selectedShot ? (
              <aside className={styles.inspector} aria-label="Selected shot details">
                <div className={styles.inspectorHeading}>
                  <div>
                    <span>Selected shot</span>
                    <strong>{String(selectedScene.order).padStart(2, "0")}.{String(selectedShot.order).padStart(2, "0")}</strong>
                  </div>
                  {canRevise ? (
                    <button type="button" title="Remove shot" aria-label="Remove shot" disabled={selectedScene.shots.length <= 1} onClick={removeSelectedShot}>
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
                <label>
                  <span>Purpose</span>
                  <input value={selectedShot.purpose} readOnly={!canRevise} onChange={(event) => updateShot((shot) => ({ ...shot, purpose: event.target.value }))} />
                </label>
                <label>
                  <span>Visual description</span>
                  <textarea value={selectedShot.description} readOnly={!canRevise} onChange={(event) => updateShot((shot) => ({ ...shot, description: event.target.value }))} />
                </label>
                <div className={styles.panelEditor}>
                  <div className={styles.panelEditorHeading}>
                    <span>Storyboard text briefs</span>
                    {canRevise ? (
                      <button type="button" className={styles.panelAddButton} onClick={addPanel}>
                        <Plus size={13} /> Add panel
                      </button>
                    ) : null}
                  </div>
                  {selectedShot.storyboardPanels.map((panel, index) => (
                    <div className={styles.panelItem} key={panel.id}>
                      <label htmlFor={`shot-plan-panel-${panel.id}`}>Panel {panel.order}</label>
                      <textarea id={`shot-plan-panel-${panel.id}`} value={panel.visualDescription} readOnly={!canRevise} onChange={(event) => updateShot((shot) => ({
                        ...shot,
                        storyboardPanels: shot.storyboardPanels.map((candidate) => candidate.id === panel.id ? { ...candidate, visualDescription: event.target.value } : candidate),
                      }))} />
                      {canRevise ? (
                        <span className={styles.panelActions}>
                          <button type="button" title="Move panel up" aria-label={`Move panel ${panel.order} up`} disabled={index === 0} onClick={() => movePanel(panel.id, -1)}><ArrowUp size={13} /></button>
                          <button type="button" title="Move panel down" aria-label={`Move panel ${panel.order} down`} disabled={index === selectedShot.storyboardPanels.length - 1} onClick={() => movePanel(panel.id, 1)}><ArrowDown size={13} /></button>
                          <button type="button" title="Remove panel" aria-label={`Remove panel ${panel.order}`} disabled={selectedShot.storyboardPanels.length <= 1} onClick={() => removePanel(panel.id)}><Trash2 size={13} /></button>
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className={styles.fieldGrid}>
                  <label>
                    <span>Coverage</span>
                    <select value={selectedShot.coverageKind} disabled={!canRevise} onChange={(event) => updateShot((shot) => ({ ...shot, coverageKind: event.target.value as ProjectShotPlanCoverageKind }))}>
                      {PROJECT_SHOT_PLAN_COVERAGE_KINDS.map((value) => <option key={value} value={value}>{COVERAGE_LABELS[value]}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Duration</span>
                    <input type="number" min="1" step="1" value={selectedShot.estimatedDurationSeconds ?? ""} readOnly={!canRevise} placeholder="Not set" onChange={(event) => updateShot((shot) => ({ ...shot, estimatedDurationSeconds: event.target.value ? Math.max(1, Number(event.target.value)) : null }))} />
                  </label>
                </div>
                <label>
                  <span>Framing</span>
                  <select value={selectedShot.framing} disabled={!canRevise} onChange={(event) => updateShot((shot) => ({ ...shot, framing: event.target.value as ProjectShotPlanFraming }))}>
                    {PROJECT_SHOT_PLAN_FRAMINGS.map((value) => <option key={value} value={value}>{FRAMING_LABELS[value]}</option>)}
                  </select>
                </label>
                <label>
                  <span>Movement</span>
                  <select value={selectedShot.movement} disabled={!canRevise} onChange={(event) => updateShot((shot) => ({ ...shot, movement: event.target.value as ProjectShotPlanMovement }))}>
                    {PROJECT_SHOT_PLAN_MOVEMENTS.map((value) => <option key={value} value={value}>{MOVEMENT_LABELS[value]}</option>)}
                  </select>
                </label>
                <label>
                  <span>Subject</span>
                  <input value={selectedShot.subject ?? ""} readOnly={!canRevise} placeholder="Not specified" onChange={(event) => updateShot((shot) => ({ ...shot, subject: event.target.value || null }))} />
                </label>
                <label>
                  <span>Audio intent</span>
                  <textarea value={selectedShot.audioIntent ?? ""} readOnly={!canRevise} placeholder="No audio intent recorded" onChange={(event) => updateShot((shot) => ({ ...shot, audioIntent: event.target.value || null }))} />
                </label>
              </aside>
            ) : null}
          </div>

          <footer className={styles.workflowBar}>
            <div className={styles.revisionFields}>
              {hasChanges ? (
                <label>
                  <span>Revision summary</span>
                  <input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} placeholder="What changed in this shot plan?" maxLength={2000} />
                </label>
              ) : null}
              {(state === "submitted" || canSubmit) ? (
                <label>
                  <span>{state === "submitted" ? "Producer note" : "Submission note"}</span>
                  <input value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder={state === "submitted" ? "Required when requesting changes" : "Optional context for review"} maxLength={4000} />
                </label>
              ) : null}
            </div>
            <div className={styles.workflowActions}>
              {hasChanges ? (
                <button type="button" className={styles.secondaryButton} disabled={!changeSummary.trim() || operation !== null} onClick={() => void saveRevision()}>
                  {operation === "save" ? <LoaderCircle className={styles.spinner} size={15} /> : <Save size={15} />}
                  Save revision
                </button>
              ) : null}
              {canSubmit ? (
                <button type="button" className={styles.primaryButton} disabled={operation !== null} onClick={() => void submitRevision()}>
                  {operation === "submit" ? <LoaderCircle className={styles.spinner} size={15} /> : <Send size={15} />}
                  Submit
                </button>
              ) : null}
              {canDecide ? (
                <>
                  <button type="button" className={styles.secondaryButton} disabled={!decisionNote.trim() || operation !== null} onClick={() => void decide("changes_requested")}>Request changes</button>
                  <button type="button" className={styles.primaryButton} disabled={operation !== null} onClick={() => void decide("approved")}>
                    {operation === "decision" ? <LoaderCircle className={styles.spinner} size={15} /> : <Check size={15} />}
                    Approve and activate
                  </button>
                </>
              ) : null}
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

export const PROJECT_SHOT_PLAN_WORKSPACE_SCHEMA_VERSION =
  PROJECT_SHOT_PLAN_SCHEMA_VERSION;
