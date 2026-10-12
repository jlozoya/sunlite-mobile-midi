import * as stylex from "@stylexjs/stylex"
import { tokens } from "../ui-kit/tokens.stylex"
export const styles = stylex.create({
  settings: { display: "grid", gap: "20px" },
  grid: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1fr) minmax(0,1fr)",
      "@media (max-width: 1000px)": "minmax(0,1fr)",
    },
    gap: "20px",
    alignItems: "start",
  },
  qrWrap: {
    width: "min(100%, 230px)",
    margin: "16px auto",
    padding: "12px",
    boxSizing: "border-box",
    backgroundColor: "#fff",
    borderRadius: "18px",
  },
  qrImage: { display: "block", width: "100%", height: "auto" },
  shareLink: { display: "grid", gap: "10px" },
  label: { fontSize: "0.78rem", fontWeight: 800, color: tokens.colorTextSubtle },
  urlBox: {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${tokens.borderViolet}`,
    borderRadius: tokens.radiusMd,
    backgroundColor: tokens.colorSurfaceInset,
    padding: "12px",
    color: tokens.colorTextSubtle,
    fontFamily: "Consolas, monospace",
    fontSize: "0.86rem",
    textAlign: "center",
    ":focus-visible": { outline: `2px solid ${tokens.colorViolet}` },
  },
  detail: { color: tokens.colorTextMuted, fontSize: "0.86rem", lineHeight: 1.5 },
  networkList: {
    display: "grid",
    gap: "6px",
    marginTop: "12px",
    color: tokens.colorTextMuted,
    fontSize: "0.76rem",
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
})
