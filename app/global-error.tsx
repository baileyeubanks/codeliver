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
      <body style={{ background: "#0f172a", color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Something went wrong</h1>
            <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>{error.message}</p>
            <button
              onClick={reset}
              style={{
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "0.5rem 1.5rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
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
