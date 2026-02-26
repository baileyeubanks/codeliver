"use client";

import { useState, FormEvent } from "react";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const password = fd.get("password") as string;
    const confirm = fd.get("confirm_password") as string;

    if (password !== confirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          password,
          display_name: fd.get("display_name"),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Sign up failed");
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Connection error. Try again.");
      setLoading(false);
    }
  }

  const inputStyle = {
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
  };

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
          href="/login"
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
          &larr; Back to sign in
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
            Content Co-op
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
            Create account
          </h1>
          <p
            style={{
              margin: "0 0 1.2rem",
              color: "#7a9bc4",
              fontSize: ".82rem",
              lineHeight: 1.5,
            }}
          >
            One account for Co-Edit, Co-Script, and Co-Deliver.
          </p>

          {success ? (
            <div
              style={{
                textAlign: "center",
                padding: "1rem 0",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "rgba(107, 159, 212, 0.12)",
                  border: "1px solid rgba(107, 159, 212, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1rem",
                  fontSize: "1.2rem",
                  color: "#6b9fd4",
                }}
              >
                &#10003;
              </div>
              <h2
                style={{
                  fontSize: "1.1rem",
                  color: "#edf3ff",
                  fontWeight: 700,
                  margin: "0 0 .4rem",
                }}
              >
                Account created
              </h2>
              <p
                style={{
                  color: "#7a9bc4",
                  fontSize: ".82rem",
                  margin: "0 0 1rem",
                  lineHeight: 1.5,
                }}
              >
                You can now sign in with your email and password.
              </p>
              <a
                href="/login"
                style={{
                  display: "inline-block",
                  background: "#6b9fd4",
                  color: "#0c1322",
                  borderRadius: 999,
                  padding: ".65rem 1.6rem",
                  fontSize: ".74rem",
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  textTransform: "uppercase" as const,
                  textDecoration: "none",
                }}
              >
                Sign in
              </a>
            </div>
          ) : (
            <>
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
                    Name
                  </label>
                  <input
                    name="display_name"
                    type="text"
                    placeholder="Your name"
                    autoComplete="name"
                    style={inputStyle}
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
                    Email *
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    autoComplete="email"
                    style={inputStyle}
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
                    Password *
                  </label>
                  <input
                    name="password"
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    style={inputStyle}
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
                    Confirm password *
                  </label>
                  <input
                    name="confirm_password"
                    type="password"
                    required
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    style={inputStyle}
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
                  {loading ? "Creating account..." : "Create account"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
