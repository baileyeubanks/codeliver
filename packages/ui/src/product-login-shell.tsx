"use client";

import type { FocusEvent, FormEventHandler } from "react";

type ProductLoginShellProps = {
  productLabel: string;
  description: string;
  error?: string;
  loading?: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onGoogleLogin?: () => void | Promise<void>;
  signupHref?: string;
  signupLabel?: string;
  submitLabel?: string;
  loadingLabel?: string;
  homeHref?: string;
};

type ProductTheme = {
  accent: string;
  accentSoft: string;
  displayLabel?: string;
  eyebrow: string;
  manifesto: string;
  features: string[];
};

const THEMES: Record<string, ProductTheme> = {
  "Co-Cut": {
    accent: "#91bfff",
    accentSoft: "rgba(145, 191, 255, 0.14)",
    eyebrow: "Editorial post system",
    manifesto: "Cuts move fast when the review loop, the media bin, and the timeline all belong to the same operating surface.",
    features: ["Waveform-first edit flow", "Browser-native approvals", "Field-to-boardroom turnarounds"],
  },
  "Co-Script": {
    accent: "#9ad2ff",
    accentSoft: "rgba(154, 210, 255, 0.14)",
    eyebrow: "Pre-production writing system",
    manifesto: "Watchlists, interview signals, and draft structure stay in one place so the script arrives already grounded in the footage reality.",
    features: ["Watchlist to script", "Interview structure", "Production-ready story beats"],
  },
  "Co-Deliver": {
    accent: "#8dc0ff",
    accentSoft: "rgba(141, 192, 255, 0.14)",
    eyebrow: "Delivery and sign-off system",
    manifesto: "Feedback gets cleaner when versions, comments, and final approvals sit on the same track instead of splitting across inboxes.",
    features: ["Timecoded review", "Version control", "Stakeholder sign-off"],
  },
  "Co-Production Pro": {
    accent: "#8dc0ff",
    accentSoft: "rgba(141, 192, 255, 0.14)",
    eyebrow: "Production and delivery system",
    manifesto: "Planning, production, review, editing, and delivery stay in one governed workspace from first brief to final handoff.",
    features: ["End-to-end production", "Frame-accurate review", "Controlled delivery"],
  },
  "Co-VideoPro": {
    accent: "#8dc0ff",
    accentSoft: "rgba(141, 192, 255, 0.14)",
    displayLabel: "Co-Production Pro",
    eyebrow: "Production and delivery system",
    manifesto: "Planning, production, review, editing, and delivery stay in one governed workspace from first brief to final handoff.",
    features: ["End-to-end production", "Frame-accurate review", "Controlled delivery"],
  },
  Root: {
    accent: "#b6d2ff",
    accentSoft: "rgba(182, 210, 255, 0.14)",
    eyebrow: "Operations access",
    manifesto: "The operating surface for ACS and Content Co-op. Internal systems, finance, quotes, dispatch, and delivery all route through here.",
    features: ["Internal ops access", "Shared business controls", "Protected workspace"],
  },
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid rgba(164, 197, 247, 0.24)",
  borderRadius: 0,
  background: "rgba(6, 12, 23, 0.78)",
  color: "#edf4ff",
  padding: ".85rem .95rem",
  fontSize: ".92rem",
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color 140ms ease, background 140ms ease",
};

const labelStyle = {
  fontSize: ".68rem",
  letterSpacing: ".16em",
  textTransform: "uppercase" as const,
  color: "rgba(191, 211, 245, 0.74)",
  fontWeight: 700,
};

function getTheme(productLabel: string): ProductTheme {
  return THEMES[productLabel] ?? {
    accent: "#9cc7ff",
    accentSoft: "rgba(156, 199, 255, 0.14)",
    eyebrow: "Access surface",
    manifesto: descriptionFallback(productLabel),
    features: ["Protected workspace", "Shared production systems", "Content Co-op access"],
  };
}

function descriptionFallback(productLabel: string) {
  return `${productLabel} is part of the Content Co-op operating system for production, review, and delivery.`;
}

function splitLabel(productLabel: string) {
  const [prefix, ...rest] = productLabel.split("-");
  if (rest.length === 0) {
    return { prefix: "", suffix: productLabel };
  }
  return { prefix: `${prefix}-`, suffix: rest.join("-") };
}

export function ProductLoginShell({
  productLabel,
  description,
  error = "",
  loading = false,
  onSubmit,
  onGoogleLogin,
  signupHref = "/signup",
  signupLabel = "Create one",
  submitLabel = "Sign in",
  loadingLabel = "Signing in...",
  homeHref = "https://contentco-op.com",
}: ProductLoginShellProps) {
  const theme = getTheme(productLabel);
  const displayProductLabel = theme.displayLabel ?? productLabel;
  const { prefix, suffix } = splitLabel(displayProductLabel);

  const focusHandler = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.style.borderColor = theme.accent;
    event.currentTarget.style.background = "rgba(7, 15, 29, 0.94)";
  };

  const blurHandler = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.style.borderColor = "rgba(164, 197, 247, 0.24)";
    event.currentTarget.style.background = "rgba(6, 12, 23, 0.78)";
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 16% 0%, rgba(70, 128, 222, 0.22), transparent 30rem), radial-gradient(circle at 84% 12%, rgba(46, 94, 177, 0.16), transparent 28rem), linear-gradient(180deg, #07111d 0%, #081425 55%, #050b15 100%)",
        color: "#edf4ff",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "2rem 1.15rem",
        display: "grid",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "min(1380px, 100%)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "clamp(1.5rem, 4vw, 3.25rem)",
          alignItems: "stretch",
        }}
      >
        <section
          style={{
            position: "relative",
            display: "grid",
            alignContent: "space-between",
            minHeight: "min(760px, calc(100vh - 4rem))",
            padding: "clamp(1.2rem, 2vw, 1.8rem) 0",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, transparent 0, transparent calc(100% - 1px), rgba(164, 197, 247, 0.14) calc(100% - 1px), rgba(164, 197, 247, 0.14) 100%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ display: "grid", gap: "1.25rem", paddingRight: "clamp(1rem, 3vw, 2.6rem)" }}>
            <a
              href={homeHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: ".55rem",
                width: "fit-content",
                fontSize: ".72rem",
                fontWeight: 700,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "rgba(205, 223, 250, 0.78)",
              }}
            >
              <span style={{ color: theme.accent }}>&larr;</span> contentco-op.com
            </a>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: ".65rem",
                width: "fit-content",
                padding: ".5rem 0",
                borderBottom: `1px solid ${theme.accentSoft}`,
                fontSize: ".72rem",
                fontWeight: 700,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                color: "rgba(191, 211, 245, 0.72)",
              }}
            >
              <span
                style={{
                  width: "3.25rem",
                  height: 1,
                  background: theme.accent,
                  display: "inline-block",
                }}
              />
              {theme.eyebrow}
            </div>

            <div style={{ display: "grid", gap: "1rem" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "clamp(.72rem, 1vw, .82rem)",
                  fontWeight: 700,
                  letterSpacing: ".2em",
                  textTransform: "uppercase",
                  color: theme.accent,
                }}
              >
                Access
              </p>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display), Fraunces, Georgia, serif",
                  fontSize: "clamp(4rem, 10vw, 8.5rem)",
                  lineHeight: 0.9,
                  letterSpacing: "-.06em",
                  color: "#f5f9ff",
                  maxWidth: "9ch",
                }}
              >
                {prefix ? <span style={{ color: theme.accent, fontStyle: "italic" }}>{prefix}</span> : null}
                {suffix}
              </h1>
              <p
                style={{
                  margin: 0,
                  maxWidth: "34rem",
                  color: "rgba(230, 239, 255, 0.82)",
                  fontSize: "clamp(1rem, 1.4vw, 1.18rem)",
                  lineHeight: 1.65,
                }}
              >
                {theme.manifesto}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "1rem",
              paddingRight: "clamp(1rem, 3vw, 2.6rem)",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: ".85rem",
                borderTop: `1px solid ${theme.accentSoft}`,
                paddingTop: "1.1rem",
              }}
            >
              {theme.features.map((feature, index) => (
                <div
                  key={feature}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: ".9rem",
                    alignItems: "start",
                  }}
                >
                  <span
                    style={{
                      color: theme.accent,
                      fontSize: ".72rem",
                      fontWeight: 700,
                      letterSpacing: ".16em",
                      textTransform: "uppercase",
                    }}
                  >
                    0{index + 1}
                  </span>
                  <p
                    style={{
                      margin: 0,
                      color: "rgba(218, 231, 251, 0.76)",
                      fontSize: ".94rem",
                      lineHeight: 1.6,
                    }}
                  >
                    {feature}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            position: "relative",
            alignSelf: "center",
            border: `1px solid ${theme.accentSoft}`,
            background:
              "linear-gradient(180deg, rgba(9, 17, 30, 0.96) 0%, rgba(5, 10, 18, 0.98) 100%)",
            clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)",
            padding: "clamp(1.4rem, 3vw, 2rem)",
            boxShadow: "0 28px 90px rgba(0, 0, 0, 0.34)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: `linear-gradient(90deg, ${theme.accent} 0%, transparent 78%)`,
            }}
          />

          <div style={{ display: "grid", gap: ".45rem", marginBottom: "1.35rem" }}>
            <p
              style={{
                margin: 0,
                fontSize: ".68rem",
                fontWeight: 700,
                letterSpacing: ".18em",
                textTransform: "uppercase",
                color: theme.accent,
              }}
            >
              Sign in
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: "1.75rem",
                lineHeight: 1,
                letterSpacing: "-.04em",
                color: "#f5f9ff",
              }}
            >
              Access {displayProductLabel}
            </h2>
            <p
              style={{
                margin: 0,
                color: "rgba(201, 220, 248, 0.72)",
                fontSize: ".9rem",
                lineHeight: 1.6,
              }}
            >
              {description}
            </p>
          </div>

          {onGoogleLogin ? (
            <>
              <button
                type="button"
                onClick={onGoogleLogin}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: ".6rem",
                  padding: ".85rem 1rem",
                  background: "#f7f9fc",
                  color: "#1f2937",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 0,
                  fontSize: ".84rem",
                  fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  marginBottom: "1rem",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: ".75rem",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ height: 1, background: "rgba(164, 197, 247, 0.16)" }} />
                <span style={{ fontSize: ".72rem", color: "rgba(191, 211, 245, 0.54)" }}>or</span>
                <div style={{ height: 1, background: "rgba(164, 197, 247, 0.16)" }} />
              </div>
            </>
          ) : null}

          {error ? (
            <div
              style={{
                color: "#f6b0b0",
                fontSize: ".82rem",
                marginBottom: ".85rem",
                padding: ".7rem .85rem",
                borderLeft: "2px solid rgba(246, 176, 176, 0.78)",
                background: "rgba(96, 27, 27, 0.24)",
              }}
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: ".9rem" }}>
            <div style={{ display: "grid", gap: ".38rem" }}>
              <label style={labelStyle}>Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                autoComplete="email"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
              />
            </div>

            <div style={{ display: "grid", gap: ".38rem" }}>
              <label style={labelStyle}>Password</label>
              <input
                name="password"
                type="password"
                required
                placeholder="Password"
                autoComplete="current-password"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: ".5rem",
                width: "100%",
                padding: ".9rem 1rem",
                border: 0,
                borderRadius: 0,
                background: theme.accent,
                color: "#07111d",
                fontSize: ".76rem",
                fontWeight: 800,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                cursor: loading ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: loading ? 0.68 : 1,
              }}
            >
              {loading ? loadingLabel : submitLabel}
            </button>
          </form>

          <div
            style={{
              marginTop: "1rem",
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              fontSize: ".76rem",
              color: "rgba(191, 211, 245, 0.62)",
            }}
          >
            <span>Protected workspace</span>
            <span>
              Need access?{" "}
              <a href={signupHref} style={{ color: theme.accent, textDecoration: "none", fontWeight: 700 }}>
                {signupLabel}
              </a>
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
