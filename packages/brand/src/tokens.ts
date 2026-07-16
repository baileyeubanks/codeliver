/* ─── Content Co-op Design Tokens ─── */

export const brand = {
  home: {
    background: "#edf4ee",
    ink: "#121d2a",
    muted: "#4a5e71",
    line: "#c8d7cb",
    accent: "#c7f7b8",
    cta: "#132642",
    ctaLine: "#395b89",
  },
  product: {
    background: "#070f1c",
    surface: "#0d1420",
    elevated: "#121c2b",
    ink: "#edf3ff",
    muted: "#9cadc8",
    line: "#243248",
    accent: "#b9ff77",
  },
  semantic: {
    success: "#3ec983",
    warning: "#e4ad5b",
    danger: "#de7676",
    ring: "#7ca0718f",
  },
} as const;

export const spacing = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  24: "96px",
} as const;

export const radii = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "18px",
  "2xl": "24px",
  full: "999px",
} as const;

export const typography = {
  display: {
    family: "'Space Grotesk', 'Inter', sans-serif",
    h1: "clamp(3rem, 7.8vw, 7.2rem)",
    h2: "clamp(1.5rem, 3vw, 3.4rem)",
    h3: "clamp(1rem, 1.7vw, 1.35rem)",
    letterSpacing: "-0.03em",
    lineHeight: { h1: "0.89", h2: "0.98", h3: "1.2" },
  },
  body: {
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    base: "1rem",
    sm: "0.88rem",
    xs: "0.78rem",
    xxs: "0.72rem",
    lineHeight: "1.62",
  },
  label: {
    size: "0.7rem",
    weight: "630",
    letterSpacing: "0.18em",
    transform: "uppercase" as const,
  },
} as const;

export const transitions = {
  fast: "140ms ease",
  base: "170ms ease",
  slow: "300ms ease",
} as const;

export const shadows = {
  sm: "0 2px 8px rgba(0,0,0,.08)",
  md: "0 10px 24px rgba(0,0,0,.12)",
  lg: "0 20px 42px rgba(0,0,0,.25)",
  hero: "0 20px 42px rgba(0,0,0,.32)",
} as const;

export const roles = ["context", "trust", "process", "texture"] as const;
export type RoleTag = (typeof roles)[number];
