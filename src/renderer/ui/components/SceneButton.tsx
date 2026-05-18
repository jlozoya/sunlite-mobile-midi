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
  type ApcLedFeedbackBehavior,
  type ApcMidiLedColor,
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
  feedbackColor: ApcMidiLedColor | null
  feedbackBehavior: ApcLedFeedbackBehavior
  isMobileView: boolean
  sendCommand: (command: MidiCommand) => void
  onEdit: () => void
}

export function SceneButton({
  button,
  config,
  feedbackColor,
  feedbackBehavior,
  isMobileView,
  sendCommand,
  onEdit,
}: SceneButtonProps) {
  const isLit = !isOffColor(feedbackColor)
  const pressHandlers = useMidiButtonPress({
    isMobileView,
    onPressStart: () => sendStandardButtonNoteOn(button.note, sendCommand),
    onPressEnd: () => sendStandardButtonNoteOff(button.note, sendCommand),
  })

  return (
    <Button
      {...stylex.props(styles.sceneLaunchButton, isLit && styles.padButtonLit)}
      style={getButtonFrameStyle(feedbackColor)}
      data-led-behavior={feedbackBehavior.behavior}
      {...pressHandlers}
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
      <span {...stylex.props(styles.sceneLabel)}>{config?.label ?? button.label}</span>
      <small {...stylex.props(styles.sceneMeta)}>N {button.note}</small>
    </Button>
  )
}

const styles = stylex.create({
  sceneLaunchButton: {
    position: "relative",
    overflow: "hidden",
    minWidth: "54px",
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
    padding: "8px",
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
    position: "relative",
    zIndex: 1,
    color: "#f8fafc",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
  },
  sceneMeta: {
    position: "relative",
    zIndex: 1,
    color: "rgba(255, 255, 255, 0.92)",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
  },
})
