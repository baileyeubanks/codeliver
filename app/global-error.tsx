"use client";

import CoProductionBrand from "@/components/brand/CoProductionBrand";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#edf1f4",
          color: "#18223e",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        <main
          style={{
            boxSizing: "border-box",
            minHeight: "100svh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <section
            style={{
              width: "min(100%, 456px)",
              boxSizing: "border-box",
              border: "1px solid #d9e1e9",
              borderRadius: 8,
              background: "#ffffff",
              padding: "32px 28px",
              textAlign: "center",
              boxShadow: "0 12px 34px rgba(32, 55, 88, 0.08)",
            }}
          >
            <CoProductionBrand
              variant="stacked"
              sizes="(max-width: 520px) 188px, 212px"
              priority
              style={{
                "--co-production-brand-width": "212px",
                margin: "0 auto 20px",
              }}
            />
            <p
              style={{
                margin: "0 0 8px",
                color: "#145bb8",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Workspace error
            </p>
            <h1
              style={{
                margin: "0 0 8px",
                color: "#18223e",
                fontFamily: "Manrope, Inter, sans-serif",
                fontSize: 25,
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                maxWidth: 360,
                margin: "0 auto 22px",
                color: "#647287",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {error.message || "The workspace could not finish loading."}
            </p>
            <button
              onClick={reset}
              style={{
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #145bb8",
                borderRadius: 7,
                background: "#145bb8",
                padding: "0 20px",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
