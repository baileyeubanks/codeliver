"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface AuditEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface Asset {
  id: string;
  title: string;
  project_name: string;
  status: string;
}

export default function AuditTrail() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/codeliver/assets/${id}`).then((r) => r.json()),
      fetch(`/api/codeliver/assets/${id}/audit-log`).then((r) => r.json()),
    ])
      .then(([assetData, eventData]) => {
        setAsset(assetData);
        setEvents(eventData.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  function dotClass(type: string) {
    if (type.includes("approved")) return "approved";
    if (type.includes("change") || type.includes("needs")) return "change";
    return "";
  }

  return (
    <main className="shell" style={{ paddingTop: "1rem" }}>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".5rem" }}>
        <Link className="badge-link" href="/">Queue</Link>
        <span style={{ color: "#4a6888" }}>/</span>
        <Link className="badge-link" href={`/asset/${id}`}>Review</Link>
        <span style={{ color: "#4a6888" }}>/</span>
        <span style={{ color: "#7a9bc4", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".1em" }}>Audit</span>
      </div>

      <article className="panel">
        <div className="kicker">Audit Trail</div>
        <h1 style={{ fontSize: "3rem" }}>Decision history</h1>
        {asset && (
          <p className="muted">
            {asset.title} — {asset.project_name} — Status: {asset.status.replace("_", " ")}
          </p>
        )}

        {loading ? (
          <p className="muted" style={{ marginTop: "1rem" }}>Loading audit trail...</p>
        ) : events.length === 0 ? (
          <div style={{ marginTop: "1.2rem", padding: "1.5rem", textAlign: "center", border: "1px solid #2b4263", borderRadius: 14, background: "#0a1524" }}>
            <p className="muted">No events recorded yet.</p>
          </div>
        ) : (
          <div className="timeline" style={{ marginTop: "1rem" }}>
            {events.map((e) => (
              <div className="timeline-item" key={e.id}>
                <div className={`timeline-dot ${dotClass(e.event_type)}`} />
                <div>
                  <div style={{ fontSize: ".88rem", fontWeight: 600 }}>{e.event_type.replace(/_/g, " ")}</div>
                  {e.payload && Object.keys(e.payload).length > 0 && (
                    <div style={{ fontSize: ".72rem", color: "#5a7ea8", marginTop: ".15rem" }}>
                      {Object.entries(e.payload)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </div>
                  )}
                  <div style={{ fontSize: ".68rem", color: "#4a6888", marginTop: ".1rem" }}>
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <span className="badge" style={{ fontSize: ".55rem" }}>
                  {e.event_type.split("_")[0]}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
    </main>
  );
}
