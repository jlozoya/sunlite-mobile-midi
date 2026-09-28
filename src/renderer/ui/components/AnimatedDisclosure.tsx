import * as stylex from "@stylexjs/stylex"
import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react"

const duration = 240

export function AnimatedCollapse({
  open,
  children,
  id,
  unmountOnExit = false,
}: {
  open: boolean
  children: ReactNode
  id?: string
  unmountOnExit?: boolean
}) {
  const [present, setPresent] = useState(open || !unmountOnExit)
  const [expanded, setExpanded] = useState(open)

  useEffect(() => {
    if (!unmountOnExit) return
    if (open) {
      setPresent(true)
      let nextFrame = 0
      const frame = window.requestAnimationFrame(() => {
        nextFrame = window.requestAnimationFrame(() => setExpanded(true))
      })
      return () => {
        window.cancelAnimationFrame(frame)
        window.cancelAnimationFrame(nextFrame)
      }
    }
    setExpanded(false)
    const timer = window.setTimeout(() => setPresent(false), duration)
    return () => window.clearTimeout(timer)
  }, [open, unmountOnExit])

  const visible = unmountOnExit ? expanded : open
  return (
    <div
      id={id}
      aria-hidden={!visible}
      inert={!visible}
      {...stylex.props(styles.collapse, !visible && styles.collapsed)}
    >
      <div {...stylex.props(styles.inner)}>{present ? children : null}</div>
    </div>
  )
}

export function AnimatedDisclosure({
  summary,
  children,
  containerProps,
  buttonProps,
  indicatorPosition = "end",
  unmountOnExit = false,
}: {
  summary: ReactNode
  children: ReactNode
  containerProps?: HTMLAttributes<HTMLDivElement>
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>
  indicatorPosition?: "start" | "end"
  unmountOnExit?: boolean
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const indicator = (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...stylex.props(
        styles.chevron,
        indicatorPosition === "start" && styles.chevronLeading,
        open && styles.chevronOpen,
      )}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
  return (
    <div {...containerProps}>
      <button
        type="button"
        {...buttonProps}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
      >
        {indicatorPosition === "start" ? indicator : null}
        <span
          {...stylex.props(
            styles.summaryText,
            indicatorPosition === "end" && styles.summaryTextGrow,
          )}
        >
          {summary}
        </span>
        {indicatorPosition === "end" ? indicator : null}
      </button>
      <AnimatedCollapse open={open} id={contentId} unmountOnExit={unmountOnExit}>
        {children}
      </AnimatedCollapse>
    </div>
  )
}

const styles = stylex.create({
  collapse: {
    display: "grid",
    gridTemplateRows: "1fr",
    opacity: 1,
    transitionProperty: "grid-template-rows, opacity",
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: "ease",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  collapsed: { gridTemplateRows: "0fr", opacity: 0 },
  inner: { minHeight: 0, overflow: "hidden" },
  summaryText: { minWidth: 0, textAlign: "left" },
  summaryTextGrow: { flex: 1 },
  chevron: {
    flexShrink: 0,
    marginLeft: "8px",
    transform: "rotate(0deg)",
    transitionProperty: "transform",
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: "ease",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  chevronLeading: { marginLeft: 0, marginRight: "7px" },
  chevronOpen: { transform: "rotate(180deg)" },
})
