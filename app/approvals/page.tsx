"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Asset {
  id: string;
  project_name: string;
  title: string;
  status: string;
  updated_at: string;
  approval_gates: { id: string; role_required: string; state: string; gate_order: number }[];
}

export default function ApprovalsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/codeliver/assets")
      .then((r) => r.json())
      .then((d) => setAssets(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allGates = assets.flatMap((a) =>
    (a.approval_gates ?? []).map((g) => ({ ...g, asset_title: a.title, asset_id: a.id, project: a.project_name }))
  );

  const pendingGates = allGates.filter((g) => g.state !== "approved");
  const approvedGates = allGates.filter((g) => g.state === "approved");

  async function decide(gateId: string, decision: string) {
    const note = decision === "needs_change" ? prompt("Note (optional):") ?? "" : "";
    const res = await fetch(`/api/codeliver/approvals/${gateId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) {
      setAssets((prev) =>
        prev.map((a) => ({
          ...a,
          approval_gates: a.approval_gates.map((g) =>
            g.id === gateId ? { ...g, state: decision === "approved" ? "approved" : "needs_change" } : g
          ),
        }))
      );
    }
  }

  return (
    <main className="shell">
      <header className="nav">
        <div className="brand">Content Co-op</div>
        <nav className="nav-links">
          <a href="https://contentco-op.com">Home</a>
          <Link href="/">Co-Deliver</Link>
          <a className="active" href="#">Approvals</a>
        </nav>
        <div />
      </header>

      <section style={{ marginTop: "1rem" }}>
        <article className="panel">
          <div className="kicker">Approvals Dashboard</div>
          <h1 style={{ fontSize: "3rem" }}>Stakeholder decisions</h1>
          <p className="muted">Role-gated approval pipeline. Every decision is logged to the immutable audit trail.</p>

          {loading ? (
            <p className="muted" style={{ marginTop: "1rem" }}>Loading gates...</p>
          ) : (
            <>
              {/* Pending gates */}
              <div style={{ marginTop: "1.2rem" }}>
                <div className="kicker" style={{ marginBottom: ".4rem" }}>
                  Pending ({pendingGates.length})
                </div>
                {pendingGates.length === 0 ? (
                  <p className="muted">All gates approved. No pending decisions.</p>
                ) : (
                  <div className="gate-grid">
                    {pendingGates.map((g) => (
                      <div className="gate" key={g.id}>
                        <div className="gate-info">
                          <span className="gate-role">{g.role_required}</span>
                          <span className="gate-state">
                            <Link href={`/asset/${g.asset_id}`} style={{ color: "#d4e5ff" }}>{g.asset_title}</Link>
                            <span style={{ color: "#4a6888", marginLeft: ".4rem", fontSize: ".72rem" }}>{g.project}</span>
                          </span>
                        </div>
                        <div className="gate-actions">
                          <button
                            className="button success"
                            style={{ fontSize: ".56rem", padding: ".3rem .55rem" }}
                            onClick={() => decide(g.id, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            className="button danger"
                            style={{ fontSize: ".56rem", padding: ".3rem .55rem" }}
                            onClick={() => decide(g.id, "needs_change")}
                          >
                            Changes
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Completed gates */}
              {approvedGates.length > 0 && (
                <div style={{ marginTop: "1.4rem" }}>
                  <div className="kicker" style={{ marginBottom: ".4rem" }}>
                    Approved ({approvedGates.length})
                  </div>
                  <div className="gate-grid">
                    {approvedGates.map((g) => (
                      <div className="gate" key={g.id} style={{ opacity: 0.6 }}>
                        <div className="gate-info">
                          <span className="gate-role">{g.role_required}</span>
                          <span className="gate-state">{g.asset_title}</span>
                        </div>
                        <span className="badge approved">Approved</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </article>
      </section>
    </main>
  );
}
