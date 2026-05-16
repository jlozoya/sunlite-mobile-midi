import * as stylex from "@stylexjs/stylex"
import { Button } from "react-aria-components"
import type { ButtonCustomization, MidiPadConfig, PadColor } from "../../../shared/controller-config.ts"
import { getButtonFrameStyle, getLedLayerStyle, type ApcLedFeedbackBehavior } from "../controller/ledFeedback"
import { sendStandardButtonNoteOff, sendStandardButtonNoteOn } from "../controller/midiCommands"
import { useMidiButtonPress } from "../hooks/useMidiButtonPress"
import type { MidiCommand } from "../types"

export type PadButtonProps = {
  pad: MidiPadConfig
  config: ButtonCustomization | undefined
  feedbackColor: PadColor | null
  feedbackBehavior: ApcLedFeedbackBehavior
  isMobileView: boolean
  sendCommand: (command: MidiCommand) => void
  onEdit: () => void
}

export function PadButton({ pad, config, feedbackColor, feedbackBehavior, isMobileView, sendCommand, onEdit }: PadButtonProps) {
  const label = config?.label ?? pad.label
  const color = feedbackColor ?? "off"
  const isLit = color !== "off"
  const pressHandlers = useMidiButtonPress({
    isMobileView,
    onPressStart: () => sendStandardButtonNoteOn(pad.note, sendCommand),
    onPressEnd: () => sendStandardButtonNoteOff(pad.note, sendCommand),
  })

  return (
    <Button
      {...stylex.props(styles.padButton, isLit && styles.padButtonLit)}
      style={getButtonFrameStyle(color)}
      data-led-behavior={feedbackBehavior.behavior}
      {...pressHandlers}
      onContextMenu={(event) => {
        if (isMobileView) return
        event.preventDefault()
        onEdit()
      }}
    >
      <span {...stylex.props(styles.padLedLayer)} style={getLedLayerStyle(color, feedbackBehavior)} aria-hidden="true" />
      <span {...stylex.props(styles.padLabel)}>{label}</span>
      <small {...stylex.props(styles.padMeta)}>N {pad.note}</small>
    </Button>
  )
}

const styles = stylex.create({
padButton: {
    position: "relative",
    overflow: "hidden",
    aspectRatio: "1 / 1",
    minWidth: "36px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: {
      default: "12px",
      "@media (max-width: 760px)": "8px",
    },
    backgroundColor: "#1f2937",
    color: "#f8fafc",
    cursor: "pointer",
    display: "grid",
    alignContent: "center",
    justifyItems: "center",
    gap: "3px",
    padding: "4px",
    textAlign: "center",
    touchAction: "manipulation",
    userSelect: "none",
  },
padButtonLit: {
    boxShadow: "0 0 22px rgba(255, 255, 255, 0.18)",
  },
padLedLayer: {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    pointerEvents: "none",
    zIndex: 0,
  },
padLabel: {
    position: "relative",
    zIndex: 1,
    color: "#f8fafc",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
    fontSize: {
      default: "0.7rem",
      "@media (max-width: 760px)": "0.56rem",
    },
    fontWeight: 900,
    lineHeight: 1.05,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
padMeta: {
    position: "relative",
    zIndex: 1,
    color: "rgba(255, 255, 255, 0.92)",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
    fontSize: {
      default: "0.62rem",
      "@media (max-width: 760px)": "0.5rem",
    },
  },
})
