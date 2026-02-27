"use client";

import { useState, FormEvent } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

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

  async function handleGoogleLogin() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
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

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: ".5rem",
              padding: ".65rem 1rem",
              background: "#fff",
              color: "#333",
              border: "1px solid #d0d5dd",
              borderRadius: 10,
              fontSize: ".82rem",
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "background 140ms ease",
              marginBottom: "1rem",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div style={{
            display: "flex", alignItems: "center", gap: ".75rem",
            marginBottom: "1rem", color: "#4a6888", fontSize: ".72rem",
          }}>
            <div style={{ flex: 1, height: 1, background: "#2b4263" }} />
            <span>or</span>
            <div style={{ flex: 1, height: 1, background: "#2b4263" }} />
          </div>

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
