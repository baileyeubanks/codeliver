"use client";

import { useState, FormEvent } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Invalid credentials");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Connection error. Try again.");
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0c1322",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        <a
          href="https://contentco-op.com"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: ".4rem",
            fontSize: ".72rem",
            letterSpacing: ".1em",
            textTransform: "uppercase" as const,
            fontWeight: 600,
            color: "#5a7ea8",
            textDecoration: "none",
            marginBottom: "1.2rem",
          }}
        >
          &larr; contentco-op.com
        </a>

        <section
          style={{
            border: "1px solid #2b4263",
            borderRadius: 18,
            background: "linear-gradient(160deg, #101b2e, #0d1828)",
            padding: "2rem 1.6rem",
          }}
        >
          <div
            style={{
              fontSize: ".72rem",
              letterSpacing: ".18em",
              textTransform: "uppercase" as const,
              color: "#6b9fd4",
              fontWeight: 700,
            }}
          >
            Co-Deliver
          </div>
          <h1
            style={{
              margin: ".3rem 0 .4rem",
              fontSize: "1.4rem",
              color: "#edf3ff",
              letterSpacing: "-.02em",
              fontWeight: 700,
            }}
          >
            Sign in
          </h1>
          <p
            style={{
              margin: "0 0 1.2rem",
              color: "#7a9bc4",
              fontSize: ".82rem",
              lineHeight: 1.5,
            }}
          >
            Timecoded review, version control, and stakeholder sign-off for
            deliverables.
          </p>

          {error && (
            <div
              style={{
                color: "#de7676",
                fontSize: ".82rem",
                marginBottom: ".8rem",
                padding: ".5rem .75rem",
                borderRadius: 8,
                background: "rgba(222, 118, 118, 0.08)",
                border: "1px solid rgba(222, 118, 118, 0.2)",
              }}
            >
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: "grid", gap: ".7rem" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: ".28rem" }}>
              <label
                style={{
                  fontSize: ".68rem",
                  letterSpacing: ".1em",
                  textTransform: "uppercase" as const,
                  color: "#7a9bc4",
                  fontWeight: 700,
                }}
              >
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                autoComplete="email"
                style={{
                  border: "1px solid #325276",
                  borderRadius: 10,
                  background: "#0d1a2e",
                  color: "#e9f0ff",
                  padding: ".65rem .75rem",
                  fontSize: ".88rem",
                  fontFamily: "inherit",
                  outline: "none",
                  transition: "border-color 140ms ease",
                  width: "100%",
                  boxSizing: "border-box" as const,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6b9fd4")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#325276")}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: ".28rem" }}>
              <label
                style={{
                  fontSize: ".68rem",
                  letterSpacing: ".1em",
                  textTransform: "uppercase" as const,
                  color: "#7a9bc4",
                  fontWeight: 700,
                }}
              >
                Password
              </label>
              <input
                name="password"
                type="password"
                required
                placeholder="Password"
                autoComplete="current-password"
                style={{
                  border: "1px solid #325276",
                  borderRadius: 10,
                  background: "#0d1a2e",
                  color: "#e9f0ff",
                  padding: ".65rem .75rem",
                  fontSize: ".88rem",
                  fontFamily: "inherit",
                  outline: "none",
                  transition: "border-color 140ms ease",
                  width: "100%",
                  boxSizing: "border-box" as const,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6b9fd4")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#325276")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: ".4rem",
                background: "#6b9fd4",
                color: "#0c1322",
                border: "1px solid #6b9fd4",
                borderRadius: 999,
                padding: ".65rem 1.6rem",
                fontSize: ".74rem",
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase" as const,
                cursor: loading ? "wait" : "pointer",
                fontFamily: "inherit",
                transition: "opacity 140ms ease, transform 140ms ease",
                opacity: loading ? 0.6 : 1,
                width: "100%",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.opacity = "0.88";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = loading ? "0.6" : "1";
                e.currentTarget.style.transform = "none";
              }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p
            style={{
              margin: "1.2rem 0 0",
              textAlign: "center",
              fontSize: ".76rem",
              color: "#4a6888",
            }}
          >
            Don&apos;t have an account?{" "}
            <a
              href="/signup"
              style={{
                color: "#6b9fd4",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Create one
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
