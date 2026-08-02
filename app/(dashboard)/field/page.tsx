"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoMode } from "@/lib/demo/mode";
import {
  setProductionDayStatus,
  setReleaseStatus,
  setShotStatus,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { defaultFieldProjectId, nearestFieldDay } from "@/lib/covideopro/field.ts";
import { shotReadinessForDay } from "@/lib/covideopro/shots.ts";

const DAY_NEXT: Record<string, string | null> = {
  scheduled: "in_progress",
  in_progress: "wrapped",
  wrapped: null,
  cancelled: "scheduled",
};

const RELEASE_NEXT: Record<string, string | null> = {
  unsent: "sent",
  sent: "signed",
  signed: null,
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "14px 16px",
  marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 650,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--muted)",
  marginBottom: 8,
};

const verb: React.CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--accent)",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

export default function FieldPage() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!demoMode) {
    return (
      <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
        <div className="empty-state" style={{ minHeight: 320 }}>
          <h3 className="empty-state-title">Field is not connected yet</h3>
          <p className="empty-state-text">Connect this workspace to see production days, shot lists, releases, and clearances for your shoots.</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const projectId = searchParams.get("project")
    ?? defaultFieldProjectId(workspace.projects, workspace.productionDays, fromDate);
  const project = workspace.projects.find((candidate) => candidate.id === projectId) ?? workspace.projects[0];

  if (!project) {
    return (
      <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
        <div className="empty-state" style={{ minHeight: 320 }}>
          <h3 className="empty-state-title">No projects yet</h3>
          <p className="empty-state-text">The field view needs a project with production days.</p>
        </div>
      </div>
    );
  }

  const days = workspace.productionDays
    .filter((day) => day.project_id === project.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const anchorDay = days.find((day) => day.id === selectedDayId && day.status !== "cancelled")
    ?? nearestFieldDay(days, fromDate);

  const shots = workspace.shots.filter((shot) => shot.project_id === project.id);
  const readiness = anchorDay ? shotReadinessForDay(anchorDay, shots) : null;
  const liveShots = anchorDay
    ? shots
        .filter((shot) => shot.production_day_id === anchorDay.id && shot.status !== "dropped")
        .sort((a, b) => (a.priority === b.priority ? a.scene.localeCompare(b.scene) : a.priority === "must" ? -1 : 1))
    : [];
  const dayReleases = anchorDay
    ? workspace.releases.filter((release) => release.project_id === project.id && release.production_day_ids.includes(anchorDay.id))
    : [];
  const locations = workspace.locations.filter((location) => location.project_id === project.id);
  const crew = workspace.crewMembers.filter((member) => member.project_id === project.id);

  return (
    <div className="projects-content flex-1 overflow-y-auto px-5 py-5">
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <header className="mb-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Production</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Field</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">The shoot day in your pocket — shots, releases, clearances.</p>
          <select
            aria-label="Field project"
            value={project.id}
            onChange={(event) => {
              setSelectedDayId(null);
              router.replace(`/field?project=${event.target.value}&demo=1`);
            }}
            className="mt-3 w-full"
            style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", padding: "0 12px" }}
          >
            {workspace.projects.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </header>

        {days.length > 0 ? (
          <nav aria-label="Production days" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 6 }}>
            {days.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => setSelectedDayId(day.id)}
                data-active={anchorDay?.id === day.id}
                style={{
                  ...verb,
                  color: anchorDay?.id === day.id ? "var(--accent)" : "var(--muted)",
                  borderColor: anchorDay?.id === day.id ? "var(--accent)" : "var(--border)",
                  opacity: day.status === "cancelled" ? 0.45 : 1,
                }}
              >
                {day.date.slice(5)} · {day.type}
              </button>
            ))}
          </nav>
        ) : null}

        {anchorDay ? (
          <section aria-label="Field day" style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <strong className="text-base text-[var(--ink)]">{anchorDay.date}</strong>
                <span className="text-sm text-[var(--muted)]"> · {anchorDay.type}</span>
                <small className="block mt-1 text-xs text-[var(--muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  call {anchorDay.call ?? "—"} · wrap {anchorDay.wrap ?? "—"}
                </small>
              </div>
              <span style={{ ...sectionTitle, marginBottom: 0 }}>{anchorDay.status.replace("_", " ")}</span>
            </div>
            {anchorDay.notes ? <p className="mt-2 text-sm text-[var(--ink)]">{anchorDay.notes}</p> : null}
            {DAY_NEXT[anchorDay.status] ? (
              <button
                type="button"
                style={{ ...verb, marginTop: 10 }}
                onClick={() => {
                  const next = DAY_NEXT[anchorDay.status] as "in_progress" | "wrapped" | "scheduled";
                  const result = setProductionDayStatus(anchorDay.id, next);
                  setNotice(result.ok ? `${anchorDay.date} → ${next.replace("_", " ")}.` : result.reason);
                }}
              >
                Mark {DAY_NEXT[anchorDay.status]?.replace("_", " ")}
              </button>
            ) : null}
          </section>
        ) : (
          <section aria-label="Field day" style={card}>
            <p className="text-sm text-[var(--muted)]">No production days for {project.name} yet. Days land here as they are scheduled.</p>
          </section>
        )}

        {anchorDay && anchorDay.type === "principal" && readiness ? (
          <section aria-label="Shot list" style={card}>
            <h2 style={sectionTitle}>Shot list — {readiness.covered}/{readiness.total} covered · must {readiness.mustCovered}/{readiness.mustTotal}</h2>
            {liveShots.map((shot) => (
              <div key={shot.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ ...sectionTitle, marginBottom: 0, width: 56, flexShrink: 0 }}>{shot.size}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, textDecoration: shot.status === "covered" ? "line-through" : "none", opacity: shot.status === "covered" ? 0.6 : 1 }}>
                  <strong>{shot.scene}</strong> — {shot.description}
                </span>
                {shot.status === "planned" ? (
                  <button
                    type="button"
                    style={verb}
                    onClick={() => {
                      const result = setShotStatus(shot.id, "covered");
                      setNotice(result.ok ? `Covered: ${shot.description}.` : result.reason);
                    }}
                  >
                    Mark covered
                  </button>
                ) : (
                  <button
                    type="button"
                    style={verb}
                    onClick={() => {
                      const result = setShotStatus(shot.id, "planned");
                      setNotice(result.ok ? `Reopened: ${shot.description}.` : result.reason);
                    }}
                  >
                    Reopen
                  </button>
                )}
              </div>
            ))}
            {liveShots.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No shots planned for this day yet — add them from the project workspace.</p>
            ) : null}
          </section>
        ) : null}

        {dayReleases.length > 0 ? (
          <section aria-label="Releases" style={card}>
            <h2 style={sectionTitle}>Releases on this day</h2>
            {dayReleases.map((release) => (
              <div key={release.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong className="text-sm text-[var(--ink)]">{release.person_name}</strong>
                  <small className="block text-xs text-[var(--muted)]">{release.type} · {release.language} · {release.status}</small>
                </span>
                {RELEASE_NEXT[release.status] ? (
                  <button
                    type="button"
                    style={verb}
                    onClick={() => {
                      const next = RELEASE_NEXT[release.status] as "sent" | "signed";
                      const result = setReleaseStatus(release.id, next);
                      setNotice(result.ok ? `${release.person_name} → ${next}.` : result.reason);
                    }}
                  >
                    {release.status === "unsent" ? "Send release" : "Mark signed"}
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {locations.length > 0 ? (
          <section aria-label="Locations" style={card}>
            <h2 style={sectionTitle}>Locations & clearances</h2>
            {locations.map((location) => (
              <div key={location.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <strong className="text-sm text-[var(--ink)]">{location.name}</strong>
                <small className="block text-xs text-[var(--muted)]">
                  {location.access_window ?? "window TBD"} · agreement {location.agreement_status} · cleared {location.cleared_to_film.length} · restricted {location.restricted.length}
                </small>
              </div>
            ))}
          </section>
        ) : null}

        {crew.length > 0 ? (
          <section aria-label="Unit" style={card}>
            <h2 style={sectionTitle}>Unit ({crew.length})</h2>
            {crew.map((member) => (
              <div key={member.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <strong className="text-sm text-[var(--ink)]">{member.name}</strong>
                <small className="block text-xs text-[var(--muted)]">{member.role} · {member.days} day{member.days === 1 ? "" : "s"}</small>
              </div>
            ))}
          </section>
        ) : null}

        {notice ? (
          <p role="status" aria-live="polite" className="mt-2 text-sm" style={{ color: "var(--accent)" }}>{notice}</p>
        ) : null}
      </div>
    </div>
  );
}
