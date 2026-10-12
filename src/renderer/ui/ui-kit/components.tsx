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
import { styles } from "./components.styles"

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
