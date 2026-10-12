import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { AnimatedDisclosure } from "./AnimatedDisclosure"

export function MobileControllerGroup({
  label,
  mobile,
  children,
}: {
  label: string
  mobile: boolean
  children: ReactNode
}) {
  if (!mobile) return children
  return (
    <AnimatedDisclosure
      summary={label}
      containerProps={stylex.props(styles.group)}
      buttonProps={stylex.props(styles.trigger)}
    >
      <div {...stylex.props(styles.content)}>{children}</div>
    </AnimatedDisclosure>
  )
}

const styles = stylex.create({
  group: {
    minWidth: 0,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "rgba(255,255,255,0.08)",
    marginTop: "4px",
  },
  trigger: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    minHeight: "44px",
    padding: "8px 4px",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "#a5f3fc",
    fontSize: "0.8rem",
    fontWeight: 700,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": "2px solid #67e8f9" },
    outlineOffset: "-2px",
    borderRadius: "6px",
  },
  content: { display: "grid", gap: "4px", paddingBottom: "4px" },
})
