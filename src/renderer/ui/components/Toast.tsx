import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef } from "react"

type Props = {
  message: string
  onDismiss: () => void
  durationMs?: number
}

export function Toast({ message, onDismiss, durationMs = 4000 }: Props) {
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const timer = window.setTimeout(() => onDismissRef.current(), durationMs)
    return () => window.clearTimeout(timer)
  }, [durationMs, message])

  return (
    <div {...stylex.props(styles.viewport)} aria-live="polite" aria-atomic="true">
      <div {...stylex.props(styles.toast)} role="status">
        <span {...stylex.props(styles.indicator)} aria-hidden="true" />
        <span {...stylex.props(styles.message)}>{message}</span>
        <button
          type="button"
          {...stylex.props(styles.closeButton)}
          aria-label="Cerrar notificación"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  )
}

const styles = stylex.create({
  viewport: {
    position: "fixed",
    top: {
      default: "20px",
      "@media (max-width: 760px)": "12px",
    },
    right: {
      default: "20px",
      "@media (max-width: 760px)": "12px",
    },
    zIndex: 1000,
    width: {
      default: "min(420px, calc(100vw - 40px))",
      "@media (max-width: 760px)": "calc(100vw - 24px)",
    },
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34, 211, 238, 0.42)",
    borderRadius: "14px",
    backgroundColor: "rgba(9, 20, 34, 0.97)",
    boxShadow: "0 18px 48px rgba(0, 0, 0, 0.48)",
    padding: "12px 12px 12px 14px",
    color: "#cffafe",
    fontSize: "0.86rem",
    fontWeight: 700,
    pointerEvents: "auto",
  },
  indicator: {
    width: "8px",
    height: "8px",
    flexShrink: 0,
    borderRadius: "999px",
    backgroundColor: "#22d3ee",
    boxShadow: "0 0 12px rgba(34, 211, 238, 0.8)",
  },
  message: {
    flex: 1,
    overflowWrap: "anywhere",
  },
  closeButton: {
    width: "28px",
    height: "28px",
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: "8px",
    backgroundColor: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "1.2rem",
    lineHeight: 1,
    padding: 0,
  },
})
