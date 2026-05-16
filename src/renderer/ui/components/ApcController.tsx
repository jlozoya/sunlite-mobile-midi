import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { FADERS, PAD_GRID, SCENE_BUTTONS, type ControllerCustomization } from "../../../shared/controller-config.ts"
import { getFeedbackBehavior, getFeedbackColor } from "../controller/ledFeedback"
import { styles } from "../styles"
import type { EditableControl, MidiCommand } from "../types"
import { ControllerConfigModal } from "./ControllerConfigModal"
import { FaderStrip } from "./FaderStrip"
import { PadButton } from "./PadButton"
import { SceneButton } from "./SceneButton"

export type ApcControllerProps = {
  padStates: Record<number, { velocity: number; behaviorChannel: number }>
  ccValues: Record<number, number>
  lastCommand: string
  customization: ControllerCustomization
  onSaveCustomization: (customization: ControllerCustomization) => Promise<void>
  isMobileView: boolean
  feedbackReady: boolean
  feedbackWarning: string | null
  midiChannel: number
  sendCommand: (command: MidiCommand) => void
}

export function ApcController({ padStates, ccValues, lastCommand, customization, onSaveCustomization, isMobileView, feedbackReady, feedbackWarning, midiChannel, sendCommand }: ApcControllerProps) {
  const [editingControl, setEditingControl] = useState<EditableControl | null>(null)

  return (
    <section {...stylex.props(styles.apcPanel)}>
      {feedbackWarning ? <p {...stylex.props(styles.warningText)}>{feedbackWarning}</p> : null}

      <div {...stylex.props(styles.apcSurface)}>
        <div {...stylex.props(styles.padMatrix)}>
          {PAD_GRID.map((pad) => {
            const config = customization.pads[String(pad.note)]
            const feedbackState = padStates[pad.note]
            const feedbackColor = getFeedbackColor(feedbackState?.velocity)
            const feedbackBehavior = getFeedbackBehavior(feedbackState?.behaviorChannel)

            return (
              <PadButton
                key={pad.id}
                pad={pad}
                config={config}
                feedbackColor={feedbackColor}
                feedbackBehavior={feedbackBehavior}
                isMobileView={isMobileView}
                sendCommand={sendCommand}
                onEdit={() => setEditingControl({ kind: "pad", id: pad.id, note: pad.note })}
              />
            )
          })}
        </div>

        <div {...stylex.props(styles.sceneColumn)}>
          {SCENE_BUTTONS.map((button) => {
            const config = customization.sceneButtons[String(button.note)]
            const feedbackState = padStates[button.note]
            const feedbackColor = getFeedbackColor(feedbackState?.velocity)
            const feedbackBehavior = getFeedbackBehavior(feedbackState?.behaviorChannel)

            return (
              <SceneButton
                key={button.id}
                button={button}
                config={config}
                feedbackColor={feedbackColor}
                feedbackBehavior={feedbackBehavior}
                isMobileView={isMobileView}
                sendCommand={sendCommand}
                onEdit={() => setEditingControl({ kind: "scene", id: button.id, note: button.note })}
              />
            )
          })}
        </div>

        <div {...stylex.props(styles.faderBank)}>
          {FADERS.map((fader) => (
            <FaderStrip
              key={fader.id}
              fader={fader}
              config={customization.faders[String(fader.controller)]}
              feedbackValue={ccValues[fader.controller]}
              sendCommand={sendCommand}
              isMobileView={isMobileView}
              onEdit={() => setEditingControl({ kind: "fader", id: fader.id, controller: fader.controller })}
            />
          ))}
        </div>
      </div>

      {!isMobileView && editingControl ? (
        <ControllerConfigModal
          control={editingControl}
          customization={customization}
          midiChannel={midiChannel}
          onClose={() => setEditingControl(null)}
          onSave={(nextCustomization) => {
            void onSaveCustomization(nextCustomization)
            setEditingControl(null)
          }}
        />
      ) : null}

      <div {...stylex.props(styles.lastCommandBar)}>
        <strong>Last command</strong>
        <span>{lastCommand}</span>
      </div>
    </section>
  )
}
