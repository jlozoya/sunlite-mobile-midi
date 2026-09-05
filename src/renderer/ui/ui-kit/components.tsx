import * as stylex from "@stylexjs/stylex"
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import {
  Button as AriaButton,
  Input,
  Label,
  TextField,
  type ButtonProps as AriaButtonProps,
  type InputProps,
  type TextFieldProps,
} from "react-aria-components"
import { tokens } from "./tokens.stylex"

export type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ActionButtonTone = "violet" | "cyan"

export type ActionButtonProps = Omit<AriaButtonProps, "className" | "style"> & {
  variant?: ActionButtonVariant
  tone?: ActionButtonTone
  size?: "small" | "medium"
  stretch?: boolean
  className?: string
  style?: CSSProperties
}

export function ActionButton({
  variant = "primary",
  tone = "violet",
  size = "medium",
  stretch = false,
  className,
  style,
  ...props
}: ActionButtonProps) {
  const kitProps = stylex.props(
    styles.button,
    size === "small" ? styles.buttonSmall : styles.buttonMedium,
    variant === "primary" &&
      (tone === "cyan" ? styles.buttonPrimaryCyan : styles.buttonPrimaryViolet),
    variant === "secondary" && styles.buttonSecondary,
    variant === "secondary" && tone === "cyan" && styles.buttonSecondaryCyan,
    variant === "ghost" && styles.buttonGhost,
    variant === "danger" && styles.buttonDanger,
    stretch && styles.stretch,
  )

  return (
    <AriaButton
      {...props}
      {...kitProps}
      className={[kitProps.className, className].filter(Boolean).join(" ")}
      style={{ ...kitProps.style, ...style }}
    />
  )
}

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div"
  variant?: "panel" | "solid" | "subtle" | "inset" | "raised"
  padding?: "none" | "compact" | "normal" | "custom"
}

export function Surface({
  as: Component = "section",
  variant = "panel",
  padding = "normal",
  className,
  style,
  ...props
}: SurfaceProps) {
  const kitProps = stylex.props(
    styles.surface,
    variant === "panel" && styles.surfacePanel,
    variant === "solid" && styles.surfaceSolid,
    variant === "subtle" && styles.surfaceSubtle,
    variant === "inset" && styles.surfaceInset,
    variant === "raised" && styles.surfaceRaised,
    padding === "none" && styles.paddingNone,
    padding === "compact" && styles.paddingCompact,
    padding === "normal" && styles.paddingNormal,
  )

  return (
    <Component
      {...props}
      {...kitProps}
      className={[kitProps.className, className].filter(Boolean).join(" ")}
      style={{ ...kitProps.style, ...style }}
    />
  )
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info"

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone
  dot?: boolean
}

export function StatusBadge({
  tone = "neutral",
  dot = false,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      {...stylex.props(
        styles.badge,
        tone === "neutral" && styles.badgeNeutral,
        tone === "success" && styles.badgeSuccess,
        tone === "warning" && styles.badgeWarning,
        tone === "danger" && styles.badgeDanger,
        tone === "info" && styles.badgeInfo,
      )}
    >
      {dot ? <span aria-hidden="true" {...stylex.props(styles.badgeDot)} /> : null}
      {children}
    </span>
  )
}

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "info" | "success" | "warning" | "danger"
  layout?: "row" | "stack"
}

export function Notice({
  tone = "neutral",
  layout = "row",
  className,
  style,
  ...props
}: NoticeProps) {
  const kitProps = stylex.props(
    styles.notice,
    layout === "stack" && styles.noticeStack,
    tone === "neutral" && styles.noticeNeutral,
    tone === "info" && styles.noticeInfo,
    tone === "success" && styles.noticeSuccess,
    tone === "warning" && styles.noticeWarning,
    tone === "danger" && styles.noticeDanger,
  )

  return (
    <div
      {...props}
      {...kitProps}
      className={[kitProps.className, className].filter(Boolean).join(" ")}
      style={{ ...kitProps.style, ...style }}
    />
  )
}

export type SectionHeaderProps = {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  level?: 1 | 2 | 3
}

export function SectionHeader({
  title,
  description,
  eyebrow,
  level = 2,
}: SectionHeaderProps) {
  const Heading = level === 1 ? "h1" : level === 3 ? "h3" : "h2"

  return (
    <div {...stylex.props(styles.sectionHeader)}>
      {eyebrow ? <span {...stylex.props(styles.eyebrow)}>{eyebrow}</span> : null}
      <Heading {...stylex.props(styles.sectionTitle)}>{title}</Heading>
      {description ? (
        <p {...stylex.props(styles.sectionDescription)}>{description}</p>
      ) : null}
    </div>
  )
}

export type TextInputFieldProps = Omit<TextFieldProps, "children"> & {
  label: ReactNode
  inputProps?: InputProps
  helpText?: ReactNode
}

export function TextInputField({
  label,
  inputProps,
  helpText,
  ...props
}: TextInputFieldProps) {
  return (
    <TextField {...props} {...stylex.props(styles.field)}>
      <Label {...stylex.props(styles.fieldLabel)}>{label}</Label>
      <Input {...inputProps} {...stylex.props(styles.input)} />
      {helpText ? <span {...stylex.props(styles.helpText)}>{helpText}</span> : null}
    </TextField>
  )
}

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
