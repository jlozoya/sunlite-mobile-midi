import * as stylex from "@stylexjs/stylex"
import { Button } from "react-aria-components"
import type { ButtonCustomization, MidiSceneButtonConfig, PadColor } from "../../../shared/controller-config.ts"
import { getButtonFrameStyle, getLedLayerStyle, type ApcLedFeedbackBehavior } from "../controller/ledFeedback"
import { sendStandardButtonNoteOff, sendStandardButtonNoteOn } from "../controller/midiCommands"
import { useMidiButtonPress } from "../hooks/useMidiButtonPress"
import { styles } from "../styles"
import type { MidiCommand } from "../types"

export type SceneButtonProps = {
  button: MidiSceneButtonConfig
  config: ButtonCustomization | undefined
  feedbackColor: PadColor | null
  feedbackBehavior: ApcLedFeedbackBehavior
  isMobileView: boolean
  sendCommand: (command: MidiCommand) => void
  onEdit: () => void
}

export function SceneButton({ button, config, feedbackColor, feedbackBehavior, isMobileView, sendCommand, onEdit }: SceneButtonProps) {
  const color = feedbackColor ?? "off"
  const isLit = color !== "off"
  const pressHandlers = useMidiButtonPress({
    isMobileView,
    onPressStart: () => sendStandardButtonNoteOn(button.note, sendCommand),
    onPressEnd: () => sendStandardButtonNoteOff(button.note, sendCommand),
  })

  return (
    <Button
      {...stylex.props(styles.sceneLaunchButton, isLit && styles.padButtonLit)}
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
      <span {...stylex.props(styles.sceneLabel)}>{config?.label ?? button.label}</span>
      <small {...stylex.props(styles.sceneMeta)}>N {button.note}</small>
    </Button>
  )
}
