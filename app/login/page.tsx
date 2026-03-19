"use client";

import { Suspense, useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";

const REVIEW_STEPS = [
  "Review link",
  "Timecoded feedback",
  "Version history",
  "Approval state",
  "Final package",
] as const;

const CHIPS = [
  "Agency + client alignment",
  "Review to approval",
  "Delivery without the email hunt",
] as const;

type AuthSessionResponse = {
  authenticated: boolean;
  email?: string;
  id?: string;
};

function normalizeNextPath(nextPath: string | null | undefined) {
  if (!nextPath) return "/";
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }
  return nextPath;
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const nextPath = normalizeNextPath(searchParams.get("next"));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) return;

        const data = (await res.json()) as AuthSessionResponse;
        if (!cancelled && data.authenticated) {
          window.location.replace(nextPath);
        }
      } catch {
        // Ignore session probe failures here.
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [nextPath]);

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
      window.location.href = nextPath;
    } catch {
      setError("Connection error. Try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        .login-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, 430px);
          background:
            radial-gradient(circle at top right, rgba(95, 192, 198, 0.16), transparent 30%),
            linear-gradient(180deg, #08111d 0%, #0b1626 100%);
          color: #edf3ff;
          font-family: "Plus Jakarta Sans", "Avenir Next", "Segoe UI", sans-serif;
        }

        .brand-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 2.4rem 2.4rem 2rem;
          border-right: 1px solid rgba(122, 204, 209, 0.14);
        }

        .topbar,
        .support-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .brand-line,
        .step-line,
        .eyebrow,
        .review-label,
        .form-kicker {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .brand-line {
          color: rgba(202, 219, 245, 0.82);
        }

        .step-line,
        .eyebrow,
        .review-label,
        .form-kicker {
          color: rgba(146, 223, 228, 0.78);
        }

        .top-link,
        .support-link {
          color: rgba(184, 219, 232, 0.78);
          text-decoration: none;
          font-size: 0.78rem;
        }

        .hero {
          display: grid;
          gap: 1rem;
          max-width: 620px;
          padding: 2rem 0;
        }

        .hero h1,
        .form-card h2 {
          margin: 0;
          font-family: "Fraunces", Georgia, serif;
          letter-spacing: -0.05em;
        }

        .hero h1 {
          font-size: clamp(2.8rem, 5.8vw, 4.8rem);
          line-height: 0.94;
        }

        .hero h1 span {
          display: block;
          color: rgba(197, 240, 242, 0.88);
        }

        .hero p,
        .review-card p,
        .form-card p,
        .microcopy {
          margin: 0;
          color: rgba(191, 209, 238, 0.78);
          line-height: 1.72;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
        }

        .chip {
          padding: 0.44rem 0.72rem;
          border-radius: 999px;
          border: 1px solid rgba(122, 204, 209, 0.18);
          background: rgba(255, 255, 255, 0.04);
          font-size: 0.76rem;
          color: #edf3ff;
        }

        .review-card {
          max-width: 540px;
          display: grid;
          gap: 0.9rem;
          padding: 1.1rem 1.15rem;
          border: 1px solid rgba(122, 204, 209, 0.14);
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.03);
        }

        .review-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.7rem;
        }

        .review-pill {
          padding: 0.8rem 0.85rem;
          border-radius: 18px;
          background: rgba(7, 15, 26, 0.82);
          border: 1px solid rgba(122, 204, 209, 0.12);
          font-size: 0.84rem;
          color: #f4f7ff;
        }

        .form-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.4rem;
        }

        .form-card {
          width: min(100%, 380px);
          display: grid;
          gap: 1rem;
          padding: 1.6rem;
          border-radius: 28px;
          border: 1px solid rgba(122, 204, 209, 0.18);
          background:
            linear-gradient(180deg, rgba(11, 21, 37, 0.98), rgba(10, 18, 31, 0.94)),
            radial-gradient(circle at top, rgba(122, 204, 209, 0.1), transparent 46%);
          box-shadow: 0 28px 60px rgba(4, 10, 18, 0.32);
        }

        .form-card h2 {
          font-size: 2rem;
          line-height: 0.98;
        }

        .form {
          display: grid;
          gap: 0.78rem;
        }

        .field {
          display: grid;
          gap: 0.32rem;
        }

        .label {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(175, 219, 222, 0.76);
        }

        .input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.8rem 0.9rem;
          border-radius: 12px;
          border: 1px solid rgba(122, 204, 209, 0.18);
          background: rgba(255, 255, 255, 0.04);
          color: #edf3ff;
          font: inherit;
          outline: none;
          transition: border-color 140ms ease, background 140ms ease;
        }

        .input:focus {
          border-color: rgba(146, 223, 228, 0.92);
          background: rgba(255, 255, 255, 0.06);
        }

        .button {
          margin-top: 0.2rem;
          width: 100%;
          border: 0;
          border-radius: 999px;
          padding: 0.86rem 1rem;
          background: #8fe1e5;
          color: #08111d;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 140ms ease, opacity 140ms ease;
        }

        .button:hover {
          transform: translateY(-1px);
        }

        .button:disabled {
          opacity: 0.62;
          cursor: wait;
          transform: none;
        }

        .error {
          padding: 0.72rem 0.85rem;
          border-radius: 14px;
          border: 1px solid rgba(222, 118, 118, 0.2);
          background: rgba(222, 118, 118, 0.08);
          color: #de7676;
          font-size: 0.84rem;
        }

        .microcopy {
          font-size: 0.74rem;
        }

        @media (max-width: 980px) {
          .login-root {
            grid-template-columns: 1fr;
          }

          .brand-panel {
            border-right: 0;
            border-bottom: 1px solid rgba(122, 204, 209, 0.14);
          }
        }

        @media (max-width: 640px) {
          .brand-panel,
          .form-panel {
            padding: 1.4rem 1rem;
          }

          .topbar,
          .support-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .review-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <main className="login-root">
        <section className="brand-panel">
          <div className="topbar">
            <div className="brand-line">Content Co-op / Co-Deliver</div>
            <a className="top-link" href="https://contentco-op.com/suite#co-deliver">
              Back to suite
            </a>
          </div>

          <div className="hero">
            <div className="step-line">Step 3 / Review and delivery</div>
            <h1>
              Ship the work
              <span>without losing the thread.</span>
            </h1>
            <p>
              Co-Deliver keeps agency and client aligned after the cut is ready. Send review links, collect revisions, manage versions, gather approvals, and package final delivery in one clean surface.
            </p>
            <div className="chip-row">
              {CHIPS.map((chip) => (
                <span key={chip} className="chip">
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="review-card">
            <div className="review-label">What Co-Deliver closes</div>
            <p>Review links can stay lightweight for the client while the workspace keeps the approval trail and delivery packaging intact.</p>
            <div className="review-grid">
              {REVIEW_STEPS.map((step) => (
                <div key={step} className="review-pill">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="form-panel">
          <div className="form-card">
            <div className="form-kicker">Workspace sign-in</div>
            <h2>Open Co-Deliver.</h2>
            <p>
              Use your team account to manage review, revision, approval, and delivery. Public review links can still be shared separately when the client does not need a full workspace seat.
            </p>

            {error ? <div className="error">{error}</div> : null}

            <form className="form" onSubmit={handleSubmit}>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
              </div>

              <div className="field">
                <label className="label">Password</label>
                <input className="input" name="password" type="password" required autoComplete="current-password" placeholder="Password" />
              </div>

              <button className="button" type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="support-row">
              <a className="support-link" href="https://contentco-op.com/suite#co-deliver">
                See how it works
              </a>
              <a className="support-link" href="https://contentco-op.com/brief">
                Start with your brief
              </a>
            </div>

            <p className="microcopy">
              Honest surface note: market the review, revisions, approvals, and delivery core as live. Assisted transcript and AI summary flows should stay framed as beta where deeper automation is still being wired.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
