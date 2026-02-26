"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Version {
  id: string;
  version_number: number;
  created_at: string;
}

export default function VersionCompare() {
  const { id } = useParams<{ id: string }>();
  const [versions, setVersions] = useState<Version[]>([]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/codeliver/assets/${id}/versions`)
      .then((r) => r.json())
      .then((d) => setVersions(d.items ?? []))
      .catch(() => {});
  }, [id]);

  return (
    <main className="shell" style={{ paddingTop: "1rem" }}>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".5rem" }}>
        <Link className="badge-link" href="/">Queue</Link>
        <span style={{ color: "#4a6888" }}>/</span>
        <Link className="badge-link" href={`/asset/${id}`}>Review</Link>
        <span style={{ color: "#4a6888" }}>/</span>
        <span style={{ color: "#7a9bc4", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".1em" }}>Compare</span>
      </div>

      <article className="panel">
        <div className="kicker">Version Compare</div>
        <h1 style={{ fontSize: "2.8rem" }}>Side-by-side review</h1>
        <p className="muted">Compare deliverable versions to track changes and validate revisions.</p>

        {versions.length < 2 ? (
          <div style={{ marginTop: "1.2rem", padding: "2rem", textAlign: "center", border: "1px solid #2b4263", borderRadius: 14, background: "#0a1524" }}>
            <p className="muted">Version compare requires at least 2 versions. Upload a new version from the review screen.</p>
            <Link className="button" href={`/asset/${id}`} style={{ marginTop: ".8rem", display: "inline-block" }}>
              Back to review
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".8rem", marginTop: "1rem" }}>
              {/* Left: older version */}
              <div>
                <div className="kicker" style={{ marginBottom: ".4rem" }}>Version {versions[versions.length - 2]?.version_number}</div>
                <div className="player">
                  <span>v{versions[versions.length - 2]?.version_number} preview</span>
                </div>
                <div className="meta" style={{ marginTop: ".3rem", fontSize: ".72rem", color: "#7a9bc4" }}>
                  Uploaded {new Date(versions[versions.length - 2]?.created_at).toLocaleString()}
                </div>
              </div>

              {/* Right: latest version */}
              <div>
                <div className="kicker" style={{ marginBottom: ".4rem" }}>Version {versions[versions.length - 1]?.version_number} (Latest)</div>
                <div className="player">
                  <span>v{versions[versions.length - 1]?.version_number} preview</span>
                </div>
                <div className="meta" style={{ marginTop: ".3rem", fontSize: ".72rem", color: "#7a9bc4" }}>
                  Uploaded {new Date(versions[versions.length - 1]?.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Version list */}
            <div style={{ marginTop: "1.2rem" }}>
              <div className="kicker" style={{ marginBottom: ".4rem" }}>All Versions ({versions.length})</div>
              <div className="thread">
                {versions.map((v) => (
                  <div className="thread-item" key={v.id}>
                    <span className="badge">v{v.version_number}</span>
                    <span>{new Date(v.created_at).toLocaleString()}</span>
                    <span className="badge">{v.id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </article>
    </main>
  );
}
