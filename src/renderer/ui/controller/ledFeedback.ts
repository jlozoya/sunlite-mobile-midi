import type { CSSProperties } from "react"

export type ApcLedFeedbackBehavior = {
  behavior: string
  style: CSSProperties
}

export type ApcMidiLedColor = `#${string}`

const APC_LED_BRIGHTNESS: Record<number, number> = {
  0: 0.1,
  1: 0.25,
  2: 0.5,
  3: 0.65,
  4: 0.75,
  5: 0.9,
  6: 1,
}

const APC_MINI_RGB_BY_VELOCITY: Record<number, ApcMidiLedColor> = {
  0: "#000000",
  1: "#1E1E1E",
  2: "#7F7F7F",
  3: "#FFFFFF",
  4: "#FF4C4C",
  5: "#FF0000",
  6: "#590000",
  7: "#190000",
  8: "#FFBD6C",
  9: "#FF5400",
  10: "#591D00",
  11: "#271B00",
  12: "#FFFF4C",
  13: "#FFFF00",
  14: "#595900",
  15: "#191900",
  16: "#88FF4C",
  17: "#54FF00",
  18: "#1D5900",
  19: "#142B00",
  20: "#4CFF4C",
  21: "#00FF00",
  22: "#005900",
  23: "#001900",
  24: "#4CFF5E",
  25: "#00FF19",
  26: "#00590D",
  27: "#001902",
  28: "#4CFF88",
  29: "#00FF55",
  30: "#00591D",
  31: "#001F12",
  32: "#4CFFB7",
  33: "#00FF99",
  34: "#005935",
  35: "#001912",
  36: "#4CC3FF",
  37: "#00A9FF",
  38: "#004152",
  39: "#001019",
  40: "#4C88FF",
  41: "#0055FF",
  42: "#001D59",
  43: "#000819",
  44: "#4C4CFF",
  45: "#0000FF",
  46: "#000059",
  47: "#000019",
  48: "#874CFF",
  49: "#5400FF",
  50: "#190064",
  51: "#0F0030",
  52: "#FF4CFF",
  53: "#FF00FF",
  54: "#590059",
  55: "#190019",
  56: "#FF4C87",
  57: "#FF0054",
  58: "#59001D",
  59: "#220013",
  60: "#FF1500",
  61: "#993500",
  62: "#795100",
  63: "#436400",
  64: "#033900",
  65: "#005735",
  66: "#00547F",
  67: "#0000FF",
  68: "#00454F",
  69: "#2500CC",
  70: "#7F7F7F",
  71: "#202020",
  72: "#FF0000",
  73: "#BDFF2D",
  74: "#AFE006",
  75: "#64FF09",
  76: "#108B00",
  77: "#00FF87",
  78: "#00A9FF",
  79: "#002AFF",
  80: "#3F00FF",
  81: "#7A00FF",
  82: "#B21A7D",
  83: "#402100",
  84: "#FF4A00",
  85: "#88E106",
  86: "#72FF15",
  87: "#00FF00",
  88: "#3BFF26",
  89: "#59FF71",
  90: "#38FFCC",
  91: "#5B8AFF",
  92: "#3151C6",
  93: "#877FE9",
  94: "#D31DFF",
  95: "#FF005D",
  96: "#FF7F00",
  97: "#B9B000",
  98: "#90FF00",
  99: "#835D07",
  100: "#392B00",
  101: "#144C10",
  102: "#0D5038",
  103: "#15152A",
  104: "#16205A",
  105: "#693C1C",
  106: "#A8000A",
  107: "#DE513D",
  108: "#D86A1C",
  109: "#FFE126",
  110: "#9EE12F",
  111: "#67B50F",
  112: "#1E1E30",
  113: "#DCFF6B",
  114: "#80FFBD",
  115: "#9A99FF",
  116: "#8E66FF",
  117: "#404040",
  118: "#757575",
  119: "#E0FFFF",
  120: "#A00000",
  121: "#350000",
  122: "#1AD000",
  123: "#074200",
  124: "#B9B000",
  125: "#3F3100",
  126: "#B35F00",
  127: "#4B1502",
}

const OFF_BORDER_COLOR = "rgba(255, 255, 255, 0.12)"
const OFF_BACKGROUND_COLOR = "rgba(15, 23, 42, 0)"

export function getFeedbackBehavior(channel: number | undefined): ApcLedFeedbackBehavior {
  const normalizedChannel = typeof channel === "number" ? Math.max(0, Math.min(15, Math.round(channel))) : 6
  const opacity = APC_LED_BRIGHTNESS[normalizedChannel] ?? 1

  if (normalizedChannel >= 7 && normalizedChannel <= 10) {
    const durations: Record<number, string> = {
      7: "0.22s",
      8: "0.45s",
      9: "0.9s",
      10: "1.8s",
    }

    return {
      behavior: `pulse-${normalizedChannel}`,
      style: {
        opacity,
        animation: `apc-led-pulse ${durations[normalizedChannel]} ease-in-out infinite`,
      },
    }
  }

  if (normalizedChannel >= 11 && normalizedChannel <= 15) {
    const durations: Record<number, string> = {
      11: "0.12s",
      12: "0.22s",
      13: "0.45s",
      14: "0.9s",
      15: "1.8s",
    }

    return {
      behavior: `blink-${normalizedChannel}`,
      style: {
        opacity,
        animation: `apc-led-blink ${durations[normalizedChannel]} steps(1, end) infinite`,
      },
    }
  }

  return {
    behavior: `solid-${normalizedChannel}`,
    style: { opacity },
  }
}

export function getLedLayerStyle(color: ApcMidiLedColor | null, behavior: ApcLedFeedbackBehavior): CSSProperties {
  const backgroundColor: CSSProperties["backgroundColor"] = color === null || color.toUpperCase() === "#000000" ? OFF_BACKGROUND_COLOR : color

  return {
    ...behavior.style,
    backgroundColor,
  }
}

export function getButtonFrameStyle(color: ApcMidiLedColor | null): CSSProperties {
  const borderColor: CSSProperties["borderColor"] = color === null || color.toUpperCase() === "#000000" ? OFF_BORDER_COLOR : color

  return {
    borderColor,
  }
}

export function getFeedbackColor(value: number | undefined): ApcMidiLedColor | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null

  const velocity = Math.max(0, Math.min(127, Math.round(value)))
  return APC_MINI_RGB_BY_VELOCITY[velocity] ?? null
}

export function isOffColor(color: ApcMidiLedColor | null): boolean {
  return color === null || color.toUpperCase() === "#000000"
}
