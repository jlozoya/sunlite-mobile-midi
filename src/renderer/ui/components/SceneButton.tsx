import * as stylex from "@stylexjs/stylex"
import { Button } from "react-aria-components"
import type {
  ButtonCustomization,
  MidiSceneButtonConfig,
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

export type SceneButtonProps = {
  button: MidiSceneButtonConfig
  config: ButtonCustomization | undefined
  feedbackColor: MidiLedColor | null
  feedbackBehavior: MidiLedFeedbackBehavior
  isMobileView: boolean
  isDisabled?: boolean
  sendCommand: (command: MidiCommand) => void
  onEdit: () => void
}

export function SceneButton({
  button,
  config,
  feedbackColor,
  feedbackBehavior,
  isMobileView,
  isDisabled = false,
  sendCommand,
  onEdit,
}: SceneButtonProps) {
  const label = config?.label ?? button.label
  const isLit = !isOffColor(feedbackColor)
  const pressHandlers = useMidiButtonPress({
    isMobileView,
    isDisabled,
    onPressStart: () => sendStandardButtonNoteOn(button.note, sendCommand),
    onPressEnd: () => sendStandardButtonNoteOff(button.note, sendCommand),
  })

  return (
    <Button
      {...stylex.props(styles.sceneLaunchButton, isLit && styles.padButtonLit)}
      style={getButtonFrameStyle(feedbackColor)}
      data-led-behavior={feedbackBehavior.behavior}
      {...pressHandlers}
      isDisabled={isDisabled}
      aria-label={`${label}, nota ${button.note}, ${isLit ? "iluminado" : "apagado"}`}
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
      <span {...stylex.props(styles.sceneLabel)}>{label}</span>
      <small {...stylex.props(styles.sceneMeta)}>N {button.note}</small>
    </Button>
  )
}

const styles = stylex.create({
  sceneLaunchButton: {
    outline: { default: "none", ":focus-visible": "2px solid #c4b5fd" },
    outlineOffset: "2px",
    opacity: { default: 1, ":disabled": 0.5 },
    position: "relative",
    overflow: "hidden",
    minWidth: 0,
    minHeight: {
      default: "54px",
      "@media (min-width: 900px)": "44px",
    },
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(14, 165, 233, 0.42)",
    borderRadius: "12px",
    backgroundColor: "rgba(14, 165, 233, 0.14)",
    color: "#f8fafc",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    gap: "2px",
    fontWeight: 900,
    padding: { default: "8px", "@media (max-width: 760px)": "6px 3px" },
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
  sceneLabel: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: { default: "0.8rem", "@media (max-width: 760px)": "0.68rem" },
    position: "relative",
    zIndex: 1,
    color: "#f8fafc",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
  },
  sceneMeta: {
    fontSize: "0.62rem",
    position: "relative",
    zIndex: 1,
    color: "rgba(255, 255, 255, 0.92)",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
  },
})
