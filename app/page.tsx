"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Asset {
  id: string;
  project_name: string;
  title: string;
  status: string;
  updated_at: string;
  approval_gates: { id: string; role_required: string; state: string }[];
  timecoded_comments: { count: number }[];
}

interface GateSummary {
  total: number;
  approved: number;
  pending: number;
  needs_change: number;
}

function gateSummary(gates: Asset["approval_gates"]): GateSummary {
  const total = gates.length;
  const approved = gates.filter((g) => g.state === "approved").length;
  const needs_change = gates.filter((g) => g.state === "needs_change").length;
  return { total, approved, pending: total - approved - needs_change, needs_change };
}

function statusBadge(status: string) {
  if (status === "approved") return "approved";
  if (status === "needs_change") return "needs-change";
  return "open";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CoDeliverHome() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/codeliver/assets")
      .then((r) => r.json())
      .then((d) => setAssets(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalAssets = assets.length;
  const pendingReview = assets.filter((a) => a.status === "in_review").length;
  const approvedCount = assets.filter((a) => a.status === "approved").length;
  const allGates = assets.flatMap((a) => a.approval_gates ?? []);
  const gatesOpen = allGates.filter((g) => g.state === "open").length;

  return (
    <main className="shell">
      <header className="nav">
        <div className="brand">Content Co-op</div>
        <nav className="nav-links">
          <a href="https://contentco-op.com">Home</a>
          <a href="https://coedit.contentco-op.com">Co-Edit</a>
          <a href="https://coscript.contentco-op.com">Co-Script</a>
          <a className="active" href="#">Co-Deliver</a>
        </nav>
        <div style={{ display: "flex", gap: ".4rem" }}>
          <Link className="button" href="/approvals">Approvals</Link>
        </div>
      </header>

      {/* Stats */}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Deliverables</div>
          <div className="stat-value">{totalAssets}</div>
          <div className="stat-sub">Total assets</div>
        </div>
        <div className="stat">
          <div className="stat-label">In Review</div>
          <div className="stat-value">{pendingReview}</div>
          <div className="stat-sub">Awaiting proof</div>
        </div>
        <div className="stat">
          <div className="stat-label">Approved</div>
          <div className="stat-value">{approvedCount}</div>
          <div className="stat-sub">Cleared for delivery</div>
        </div>
        <div className="stat">
          <div className="stat-label">Open Gates</div>
          <div className="stat-value">{gatesOpen}</div>
          <div className="stat-sub">Awaiting sign-off</div>
        </div>
      </div>

      <section className="grid" style={{ marginTop: "1rem" }}>
        {/* Queue */}
        <article className="panel">
          <div className="kicker">Delivery Queue</div>
          <h1 style={{ fontSize: "3.2rem" }}>Delivery review</h1>
          <p className="muted">Timecoded review, version control, and stakeholder sign-off — all in one lane.</p>

          {loading ? (
            <p className="muted" style={{ marginTop: "1rem" }}>Loading deliverables...</p>
          ) : assets.length === 0 ? (
            <div style={{ marginTop: "1rem", padding: "1.5rem", textAlign: "center", border: "1px solid #2b4263", borderRadius: 14, background: "#0a1524" }}>
              <p className="muted">No deliverables yet. Assets will appear here for review and sign-off.</p>
            </div>
          ) : (
            <div className="table">
              <div className="row">
                <span>Deliverable</span>
                <span>Project</span>
                <span>Status</span>
                <span>Gates</span>
                <span>Action</span>
              </div>
              {assets.map((a) => {
                const gs = gateSummary(a.approval_gates ?? []);
                return (
                  <div className="row" key={a.id}>
                    <span>
                      <strong>{a.title}</strong>
                      <br />
                      <small style={{ color: "#7a9bc4" }}>{timeAgo(a.updated_at)}</small>
                    </span>
                    <span style={{ fontSize: ".82rem" }}>{a.project_name}</span>
                    <span><span className={`badge ${statusBadge(a.status)}`}>{a.status.replace("_", " ")}</span></span>
                    <span style={{ fontSize: ".78rem" }}>
                      {gs.total > 0 ? `${gs.approved}/${gs.total}` : "—"}
                    </span>
                    <span>
                      <Link className="badge-link" href={`/asset/${a.id}`}>Review</Link>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        {/* Sidebar: approval gates */}
        <article className="panel">
          <div className="kicker">Sign-Off</div>
          <h2>Pending gates</h2>
          <p className="muted">Role-based approval gates awaiting stakeholder decisions.</p>

          <div className="gate-grid">
            {assets
              .flatMap((a) =>
                (a.approval_gates ?? [])
                  .filter((g) => g.state !== "approved")
                  .map((g) => ({ ...g, asset_title: a.title, asset_id: a.id }))
              )
              .slice(0, 8)
              .map((g) => (
                <div className="gate" key={g.id}>
                  <div className="gate-info">
                    <span className="gate-role">{g.role_required}</span>
                    <span className="gate-state">{g.asset_title}</span>
                  </div>
                  <div className="gate-actions">
                    <Link className="button" href={`/asset/${g.asset_id}`} style={{ fontSize: ".6rem", padding: ".35rem .6rem" }}>
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            {assets.flatMap((a) => (a.approval_gates ?? []).filter((g) => g.state !== "approved")).length === 0 && (
              <p className="muted" style={{ textAlign: "center", padding: ".8rem" }}>All gates clear</p>
            )}
          </div>

          <div style={{ marginTop: "1rem" }}>
            <Link className="button" href="/approvals">All approvals</Link>
          </div>
        </article>
      </section>
    </main>
  );
}
