import * as stylex from "@stylexjs/stylex"
import { tokens } from "./tokens.stylex"

const styles = stylex.create({
  button: {
    display: "inline-grid",
    placeItems: "center",
    boxSizing: "border-box",
    borderStyle: "solid",
    borderRadius: tokens.radiusLg,
    color: tokens.colorText,
    cursor: {
      default: "pointer",
      ":disabled": "not-allowed",
    },
    font: "inherit",
    fontWeight: 800,
    lineHeight: 1.1,
    opacity: {
      default: 1,
      ":disabled": 0.48,
    },
    outline: "none",
    transition:
      "background-color 150ms ease, border-color 150ms ease, transform 120ms ease, box-shadow 150ms ease",
    transform: {
      default: "translateY(0)",
      ":active": "translateY(1px)",
    },
    boxShadow: {
      default: "none",
      ":focus-visible": tokens.focusRing,
    },
  },
  buttonSmall: {
    minHeight: "32px",
    borderWidth: "1px",
    borderRadius: tokens.radiusMd,
    padding: "7px 10px",
    fontSize: "0.78rem",
  },
  buttonMedium: {
    minHeight: "40px",
    borderWidth: "1px",
    padding: "10px 14px",
    fontSize: "0.86rem",
  },
  buttonPrimaryViolet: {
    borderColor: tokens.colorViolet,
    backgroundColor: {
      default: tokens.colorViolet,
      ":hover": "#7c3aed",
    },
  },
  buttonPrimaryCyan: {
    borderColor: tokens.colorCyanStrong,
    backgroundColor: {
      default: tokens.colorCyanStrong,
      ":hover": "#0e7490",
    },
  },
  buttonSecondary: {
    borderColor: tokens.borderViolet,
    backgroundColor: {
      default: "rgba(255, 255, 255, 0.04)",
      ":hover": tokens.colorVioletSoft,
    },
  },
  buttonSecondaryCyan: {
    borderColor: tokens.borderCyan,
    backgroundColor: {
      default: "rgba(34, 211, 238, 0.04)",
      ":hover": "rgba(34, 211, 238, 0.12)",
    },
  },
  buttonGhost: {
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": "rgba(255, 255, 255, 0.07)",
    },
    color: tokens.colorTextSubtle,
  },
  buttonDanger: {
    borderColor: "rgba(248, 113, 113, 0.35)",
    backgroundColor: {
      default: "rgba(127, 29, 29, 0.2)",
      ":hover": "rgba(185, 28, 28, 0.34)",
    },
    color: "#fecaca",
  },
  stretch: { width: "100%" },
  surface: {
    width: "100%",
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: tokens.radiusXl,
    boxSizing: "border-box",
  },
  surfacePanel: {
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: tokens.colorSurface,
    boxShadow: tokens.shadowPanel,
  },
  surfaceSolid: {
    borderColor: tokens.borderDefault,
    backgroundColor: tokens.colorSurfaceSolid,
    boxShadow: tokens.shadowPanel,
  },
  surfaceSubtle: {
    borderColor: tokens.borderSubtle,
    backgroundColor: "rgba(255, 255, 255, 0.035)",
  },
  surfaceInset: {
    borderColor: tokens.borderSubtle,
    backgroundColor: tokens.colorSurfaceInset,
  },
  surfaceRaised: {
    borderColor: tokens.borderCyan,
    backgroundColor: tokens.colorSurfaceRaised,
    boxShadow: tokens.shadowPanel,
  },
  paddingNone: { padding: 0 },
  paddingCompact: { padding: tokens.space3 },
  paddingNormal: { padding: tokens.space4 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    width: "fit-content",
    maxWidth: "100%",
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: tokens.radiusRound,
    padding: "8px 12px",
    fontSize: "0.78rem",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  badgeNeutral: {
    borderColor: tokens.borderDefault,
    backgroundColor: "rgba(255,255,255,0.05)",
    color: tokens.colorTextSubtle,
  },
  badgeSuccess: {
    borderColor: "rgba(16, 185, 129, 0.32)",
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    color: "#a7f3d0",
  },
  badgeWarning: {
    borderColor: "rgba(245, 158, 11, 0.34)",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    color: "#fde68a",
  },
  badgeDanger: {
    borderColor: "rgba(239, 68, 68, 0.34)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    color: "#fecaca",
  },
  badgeInfo: {
    borderColor: tokens.borderCyan,
    backgroundColor: "rgba(34, 211, 238, 0.1)",
    color: "#a5f3fc",
  },
  badgeDot: {
    width: "7px",
    height: "7px",
    borderRadius: tokens.radiusRound,
    backgroundColor: "currentColor",
    boxShadow: "0 0 10px currentColor",
  },
  notice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space3,
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: tokens.radiusLg,
    padding: tokens.space3,
    fontSize: "0.86rem",
    lineHeight: 1.45,
  },
  noticeStack: {
    display: "grid",
    justifyContent: "stretch",
    alignItems: "initial",
    gap: "6px",
  },
  noticeNeutral: {
    borderColor: tokens.borderDefault,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    color: tokens.colorTextSubtle,
  },
  noticeInfo: {
    borderColor: "rgba(14, 165, 233, 0.28)",
    backgroundColor: "rgba(14, 165, 233, 0.08)",
    color: "#bae6fd",
  },
  noticeSuccess: {
    borderColor: "rgba(16, 185, 129, 0.34)",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    color: "#a7f3d0",
  },
  noticeWarning: {
    borderColor: "rgba(245, 158, 11, 0.38)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    color: "#fde68a",
  },
  noticeDanger: {
    borderColor: "rgba(239, 68, 68, 0.38)",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    color: "#fecaca",
  },
  sectionHeader: {
    display: "grid",
    gap: tokens.space1,
    width: "100%",
    marginBottom: "14px",
  },
  eyebrow: {
    color: tokens.colorViolet,
    fontSize: "0.7rem",
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  sectionTitle: {
    margin: 0,
    color: tokens.colorText,
    fontSize: "1rem",
  },
  sectionDescription: {
    margin: 0,
    color: tokens.colorTextMuted,
    fontSize: "0.9rem",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  field: {
    display: "grid",
    gap: "6px",
    color: tokens.colorTextSubtle,
    fontSize: "0.84rem",
  },
  fieldLabel: { fontWeight: 800 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: tokens.borderDefault,
      ":focus": tokens.borderViolet,
    },
    borderRadius: tokens.radiusMd,
    backgroundColor: tokens.colorSurfaceInset,
    color: tokens.colorText,
    padding: "10px 11px",
    font: "inherit",
    outline: "none",
    boxShadow: {
      default: "none",
      ":focus": tokens.focusRing,
    },
  },
  helpText: {
    color: tokens.colorTextMuted,
    fontSize: "0.76rem",
    lineHeight: 1.4,
  },
})
export { styles }
