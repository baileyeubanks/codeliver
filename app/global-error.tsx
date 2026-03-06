"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#0c1322", color: "#edf3ff", fontFamily: "Inter, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Something went wrong</h1>
            <p style={{ color: "#9cadc8", marginBottom: "1rem" }}>{error.message}</p>
            <button
              onClick={reset}
              style={{
                background: "#102641",
                color: "#e8f1ff",
                border: "1px solid #3f618f",
                borderRadius: "999px",
                padding: "0.5rem 1.5rem",
                cursor: "pointer",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase" as const,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
