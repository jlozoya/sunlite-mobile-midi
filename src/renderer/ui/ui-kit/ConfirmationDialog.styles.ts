import * as stylex from "@stylexjs/stylex"
import { tokens } from "./tokens.stylex"

export const styles = stylex.create({
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space4,
    boxSizing: "border-box",
    backgroundColor: tokens.colorOverlay,
    backdropFilter: "blur(6px)",
    overflowY: "auto",
  },
  modal: {
    width: "min(100%, 460px)",
    maxHeight: "100%",
    overflowY: "auto",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: tokens.borderStrong,
    borderRadius: tokens.radiusXl,
    backgroundColor: tokens.colorSurfaceSolid,
    color: tokens.colorText,
    boxShadow: tokens.shadowDialog,
  },
  dialog: { outline: "none" },
  content: {
    display: "grid",
    gap: tokens.space4,
    padding: tokens.space5,
  },
  title: { margin: 0, fontSize: "1.1rem", fontWeight: 800 },
  description: {
    color: tokens.colorTextSubtle,
    fontSize: "0.86rem",
    lineHeight: 1.6,
    overflowWrap: "anywhere",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: tokens.space2,
    paddingTop: tokens.space1,
  },
})
