import * as stylex from "@stylexjs/stylex"

/**
 * Sunlite UI design tokens.
 *
 * The values intentionally mirror the visual language already used throughout the
 * controller: deep navy surfaces, violet actions, cyan automation accents and
 * semantic amber/green/red feedback.
 */
export const tokens = stylex.defineVars({
  colorCanvas: "#080a12",
  colorSurface: "rgba(18, 22, 38, 0.86)",
  colorSurfaceSolid: "#111827",
  colorSurfaceInset: "#050814",
  colorSurfaceRaised: "#0b1120",
  colorOverlay: "rgba(2, 6, 23, 0.78)",

  colorText: "#f8fafc",
  colorTextSubtle: "#cbd5e1",
  colorTextMuted: "#94a3b8",
  colorViolet: "#8b5cf6",
  colorVioletSoft: "rgba(139, 92, 246, 0.16)",
  colorCyan: "#22d3ee",
  colorCyanStrong: "#0891b2",
  colorSuccess: "#34d399",
  colorWarning: "#fbbf24",
  colorDanger: "#ef4444",

  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderDefault: "rgba(255, 255, 255, 0.12)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  borderViolet: "rgba(167, 139, 250, 0.5)",
  borderCyan: "rgba(34, 211, 238, 0.36)",

  radiusSm: "8px",
  radiusMd: "12px",
  radiusLg: "14px",
  radiusXl: "22px",
  radiusPanel: "24px",
  radiusRound: "999px",

  space1: "4px",
  space2: "8px",
  space3: "12px",
  space4: "16px",
  space5: "20px",
  space6: "24px",

  shadowPanel: "0 16px 48px rgba(0, 0, 0, 0.28)",
  shadowDialog: "0 30px 100px rgba(0, 0, 0, 0.62)",
  focusRing: "0 0 0 3px rgba(167, 139, 250, 0.32)",
})
