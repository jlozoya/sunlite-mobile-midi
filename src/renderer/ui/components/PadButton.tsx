import * as stylex from "@stylexjs/stylex"
import { Button } from "react-aria-components"
import type {
  ButtonCustomization,
  MidiPadConfig,
} from "../../../shared/controller-config.ts"
import {
  getButtonFrameStyle,
  getLedLayerStyle,
  isOffColor,
  type MidiLedColor,
  type MidiLedFeedbackBehavior,
} from "../controller/ledFeedback"
import {
  sendStandardButtonNoteOff,
  sendStandardButtonNoteOn,
} from "../controller/midiCommands"
import { useMidiButtonPress } from "../hooks/useMidiButtonPress"
import type { MidiCommand } from "../types"

export type PadButtonProps = {
  pad: MidiPadConfig
  config: ButtonCustomization | undefined
  feedbackColor: MidiLedColor | null
  feedbackBehavior: MidiLedFeedbackBehavior
  isMobileView: boolean
  isDisabled?: boolean
  sendCommand: (command: MidiCommand) => void
  onEdit: () => void
}

export function PadButton({
  pad,
  config,
  feedbackColor,
  feedbackBehavior,
  isMobileView,
  isDisabled = false,
  sendCommand,
  onEdit,
}: PadButtonProps) {
  const label = config?.label ?? pad.label
  const isLit = !isOffColor(feedbackColor)
  const pressHandlers = useMidiButtonPress({
    isMobileView,
    isDisabled,
    onPressStart: () => sendStandardButtonNoteOn(pad.note, sendCommand),
    onPressEnd: () => sendStandardButtonNoteOff(pad.note, sendCommand),
  })

  return (
    <Button
      {...stylex.props(styles.padButton, isLit && styles.padButtonLit)}
      style={getButtonFrameStyle(feedbackColor)}
      data-led-behavior={feedbackBehavior.behavior}
      {...pressHandlers}
      isDisabled={isDisabled}
      aria-label={`${label}, nota ${pad.note}, ${isLit ? "iluminado" : "apagado"}`}
      aria-description={isMobileView ? undefined : "Clic derecho para editar"}
      onContextMenu={(event) => {
        if (isMobileView) return
        event.preventDefault()
        onEdit()
      }}
    >
      <span
        {...stylex.props(styles.padLedLayer)}
        style={getLedLayerStyle(feedbackColor, feedbackBehavior)}
        aria-hidden="true"
      />
      <span {...stylex.props(styles.padLabel)}>{label}</span>
      <small {...stylex.props(styles.padMeta)}>N {pad.note}</small>
    </Button>
  )
}

const styles = stylex.create({
  padButton: {
    outline: { default: "none", ":focus-visible": "2px solid #c4b5fd" },
    outlineOffset: "2px",
    opacity: { default: 1, ":disabled": 0.5 },
    position: "relative",
    overflow: "hidden",
    width: "100%",
    boxSizing: "border-box",
    aspectRatio: { default: "auto", "@media (max-width: 760px)": "1 / 1" },
    height: { default: "clamp(44px, 5.5vh, 64px)", "@media (max-width: 760px)": "auto" },
    minWidth: 0,
    minHeight: "44px",
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
    padding: { default: "4px", "@media (max-width: 760px)": "2px" },
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
      default: "0.78rem",
      "@media (max-width: 760px)": "0.56rem",
    },
    fontWeight: 900,
    lineHeight: 1.05,
    overflow: "hidden",
    display: "-webkit-box",
    maxWidth: "100%",
    overflowWrap: "anywhere",
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
