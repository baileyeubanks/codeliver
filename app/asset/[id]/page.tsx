"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Asset {
  id: string;
  project_name: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  timecode: string;
  body: string;
  state: string;
  created_at: string;
}

interface Gate {
  id: string;
  role_required: string;
  state: string;
  gate_order: number;
  approval_decisions: { id: string; decision: string; note: string; created_at: string }[];
}

interface Version {
  id: string;
  version_number: number;
  created_at: string;
}

interface AuditEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export default function AssetReview() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newTimecode, setNewTimecode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/codeliver/assets/${id}`).then((r) => r.json()).then(setAsset).catch(() => {});
    fetch(`/api/codeliver/assets/${id}/comments?asset_id=${id}`).then((r) => r.json()).then((d) => setComments(d.items ?? [])).catch(() => {});
    fetch(`/api/codeliver/assets/${id}/gates`).then((r) => r.json()).then((d) => setGates(d.items ?? [])).catch(() => {});
    fetch(`/api/codeliver/assets/${id}/versions`).then((r) => r.json()).then((d) => setVersions(d.items ?? [])).catch(() => {});
    fetch(`/api/codeliver/assets/${id}/audit-log`).then((r) => r.json()).then((d) => setEvents(d.items ?? [])).catch(() => {});
  }, [id]);

  async function addComment() {
    if (!newComment.trim() || !newTimecode.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/codeliver/assets/" + id + "/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: id, at: newTimecode, body: newComment }),
    });
    if (res.ok) {
      const data = await res.json();
      setComments((prev) => [...prev, data]);
      setNewComment("");
      setNewTimecode("");
    }
    setSubmitting(false);
  }

  async function resolveComment(commentId: string) {
    const res = await fetch(`/api/codeliver/assets/${id}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "resolved" }),
    });
    if (res.ok) {
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, state: "resolved" } : c)));
    }
  }

  async function submitDecision(gateId: string, decision: string) {
    const note = decision === "needs_change" ? prompt("Note (optional):") ?? "" : "";
    const res = await fetch(`/api/codeliver/approvals/${gateId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) {
      setGates((prev) =>
        prev.map((g) => (g.id === gateId ? { ...g, state: decision === "approved" ? "approved" : "needs_change" } : g))
      );
    }
  }

  if (!asset) {
    return (
      <main className="shell" style={{ paddingTop: "1rem" }}>
        <p className="muted">Loading asset...</p>
      </main>
    );
  }

  return (
    <main className="shell" style={{ paddingTop: "1rem" }}>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".5rem" }}>
        <Link className="badge-link" href="/">Queue</Link>
        <span style={{ color: "#4a6888" }}>/</span>
        <Link className="badge-link" href={`/audit/${id}`}>Audit trail</Link>
      </div>

      <section className="grid">
        {/* Left: player + comments */}
        <article className="panel">
          <div className="kicker">Asset / {asset.title}</div>
          <h1 style={{ fontSize: "2.8rem" }}>Timecoded proof review</h1>
          <p className="muted">{asset.project_name} — Version {versions.length || 1}</p>

          {/* Player placeholder */}
          <div className="player">
            <span>Video player — {asset.title}</span>
          </div>

          <div style={{ marginTop: ".65rem", display: "flex", gap: ".45rem", flexWrap: "wrap" }}>
            {versions.length > 1 && (
              <Link className="button" href={`/asset/${id}/compare`}>Compare versions</Link>
            )}
          </div>

          {/* Comment thread */}
          <div style={{ marginTop: "1rem" }}>
            <div className="kicker" style={{ marginBottom: ".4rem" }}>Comments ({comments.length})</div>
            <div className="thread">
              {comments.length === 0 ? (
                <p className="muted" style={{ padding: ".4rem 0" }}>No comments yet. Add timecoded feedback below.</p>
              ) : (
                comments.map((c) => (
                  <article className="thread-item" key={c.id}>
                    <span className={`badge ${c.state === "resolved" ? "approved" : "open"}`}>{c.timecode}</span>
                    <div>
                      <div className="body">{c.body}</div>
                      <div className="meta">{c.state}</div>
                    </div>
                    {c.state === "open" && (
                      <button
                        className="button"
                        style={{ fontSize: ".56rem", padding: ".25rem .5rem" }}
                        onClick={() => resolveComment(c.id)}
                      >
                        Resolve
                      </button>
                    )}
                    {c.state === "resolved" && <span className="badge approved">Done</span>}
                  </article>
                ))
              )}
            </div>

            {/* Add comment */}
            <div className="comment-form">
              <input
                className="input"
                type="text"
                placeholder="00:00"
                value={newTimecode}
                onChange={(e) => setNewTimecode(e.target.value)}
                style={{ width: 72 }}
              />
              <input
                className="input"
                type="text"
                placeholder="Add timecoded comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
              />
              <button className="button primary" onClick={addComment} disabled={submitting}>
                {submitting ? "..." : "Send"}
              </button>
            </div>
          </div>
        </article>

        {/* Right: gates + audit */}
        <article className="panel">
          <div className="kicker">Approval Gates</div>
          <h2>Stakeholder sign-off</h2>

          <div className="gate-grid">
            {gates.length === 0 ? (
              <p className="muted">No approval gates configured.</p>
            ) : (
              gates.sort((a, b) => a.gate_order - b.gate_order).map((g) => (
                <div className="gate" key={g.id}>
                  <div className="gate-info">
                    <span className="gate-role">{g.role_required}</span>
                    <span className="gate-state">
                      <span className={`badge ${g.state === "approved" ? "approved" : g.state === "needs_change" ? "needs-change" : "open"}`}>
                        {g.state.replace("_", " ")}
                      </span>
                    </span>
                  </div>
                  {g.state !== "approved" && (
                    <div className="gate-actions">
                      <button
                        className="button success"
                        style={{ fontSize: ".56rem", padding: ".3rem .55rem" }}
                        onClick={() => submitDecision(g.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="button danger"
                        style={{ fontSize: ".56rem", padding: ".3rem .55rem" }}
                        onClick={() => submitDecision(g.id, "needs_change")}
                      >
                        Changes
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Recent audit events */}
          <div style={{ marginTop: "1.4rem" }}>
            <div className="kicker" style={{ marginBottom: ".4rem" }}>Recent Activity</div>
            <div className="timeline">
              {events.slice(0, 6).map((e) => (
                <div className="timeline-item" key={e.id}>
                  <div className={`timeline-dot ${e.event_type.includes("approved") ? "approved" : e.event_type.includes("change") ? "change" : ""}`} />
                  <div>
                    <div style={{ fontSize: ".82rem" }}>{e.event_type.replace(/_/g, " ")}</div>
                    <div style={{ fontSize: ".68rem", color: "#7a9bc4" }}>
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="badge" style={{ fontSize: ".55rem" }}>
                    {e.event_type.split("_")[0]}
                  </span>
                </div>
              ))}
              {events.length === 0 && <p className="muted">No activity yet.</p>}
            </div>
            {events.length > 6 && (
              <Link className="button" href={`/audit/${id}`} style={{ marginTop: ".6rem", display: "inline-block" }}>
                Full audit trail
              </Link>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
