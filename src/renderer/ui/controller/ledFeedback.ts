import type { CSSProperties } from "react"
import type { PadColor } from "../../../shared/controller-config.ts"

export type ApcLedFeedbackBehavior = {
  behavior: string
  style: CSSProperties
}

const APC_LED_BRIGHTNESS: Record<number, number> = {
  0: 0.1,
  1: 0.25,
  2: 0.5,
  3: 0.65,
  4: 0.75,
  5: 0.9,
  6: 1,
}

const LED_BACKGROUND_COLORS: Record<PadColor, string> = {
  off: "rgba(15, 23, 42, 0)",
  red: "rgba(239, 68, 68, 0.82)",
  amber: "rgba(245, 158, 11, 0.82)",
  yellow: "rgba(234, 179, 8, 0.86)",
  green: "rgba(16, 185, 129, 0.82)",
  cyan: "rgba(6, 182, 212, 0.82)",
  blue: "rgba(59, 130, 246, 0.82)",
  purple: "rgba(139, 92, 246, 0.82)",
  white: "rgba(248, 250, 252, 0.9)",
}

const LED_BORDER_COLORS: Record<PadColor, string> = {
  off: "rgba(255, 255, 255, 0.12)",
  red: "rgba(248, 113, 113, 0.78)",
  amber: "rgba(251, 191, 36, 0.78)",
  yellow: "rgba(250, 204, 21, 0.78)",
  green: "rgba(52, 211, 153, 0.78)",
  cyan: "rgba(34, 211, 238, 0.78)",
  blue: "rgba(96, 165, 250, 0.78)",
  purple: "rgba(167, 139, 250, 0.78)",
  white: "rgba(255, 255, 255, 0.95)",
}

export function getFeedbackBehavior(channel: number | undefined): ApcLedFeedbackBehavior {
  const normalizedChannel = typeof channel === "number" ? Math.max(0, Math.min(15, Math.round(channel))) : 6
  const opacity = APC_LED_BRIGHTNESS[normalizedChannel] ?? 1

  if (normalizedChannel >= 7 && normalizedChannel <= 10) {
    const durations: Record<number, string> = { 7: "0.22s", 8: "0.45s", 9: "0.9s", 10: "1.8s" }
    return {
      behavior: `pulse-${normalizedChannel}`,
      style: { opacity, animation: `apc-led-pulse ${durations[normalizedChannel]} ease-in-out infinite` },
    }
  }

  if (normalizedChannel >= 11 && normalizedChannel <= 15) {
    const durations: Record<number, string> = { 11: "0.12s", 12: "0.22s", 13: "0.45s", 14: "0.9s", 15: "1.8s" }
    return {
      behavior: `blink-${normalizedChannel}`,
      style: { opacity, animation: `apc-led-blink ${durations[normalizedChannel]} steps(1, end) infinite` },
    }
  }

  return { behavior: `solid-${normalizedChannel}`, style: { opacity } }
}

export function getLedLayerStyle(color: PadColor, behavior: ApcLedFeedbackBehavior): CSSProperties {
  return {
    ...behavior.style,
    backgroundColor: LED_BACKGROUND_COLORS[color],
  }
}

export function getButtonFrameStyle(color: PadColor): CSSProperties {
  return {
    borderColor: LED_BORDER_COLORS[color],
  }
}

export function getFeedbackColor(value: number | undefined): PadColor | null {
  if (typeof value !== "number" || value <= 0) return null

  if (value <= 5) return "green"
  if (value <= 13) return "red"
  if (value <= 21) return "amber"
  if (value <= 29) return "yellow"
  if (value <= 45) return "blue"
  if (value <= 61) return "purple"
  if (value <= 90) return "cyan"
  return "white"
}
