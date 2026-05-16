import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { FADERS, PAD_GRID, SCENE_BUTTONS, type ControllerCustomization } from "../../../shared/controller-config.ts"
import { getFeedbackBehavior, getFeedbackColor } from "../controller/ledFeedback"
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

const styles = stylex.create({
apcPanel: {
    width: "100%",
    minWidth: 0,
    marginTop: "16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: "26px",
    backgroundColor: "#111827",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.34)",
    padding: {
      default: "clamp(10px, 1.2vw, 18px)",
      "@media (max-width: 760px)": "8px",
    },
    boxSizing: "border-box",
    overflow: "hidden",
  },
warningText: {
    margin: "12px 0 0",
    borderRadius: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(245, 158, 11, 0.38)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    color: "#fde68a",
    padding: "10px 12px",
    fontSize: "0.86rem",
    lineHeight: 1.45,
  },
apcSurface: {
    width: "100%",
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 900px)": "minmax(352px, 1fr) clamp(72px, 6.4vw, 112px)",
    },
    gap: {
      default: "clamp(6px, 0.9vw, 14px)",
      "@media (max-width: 760px)": "6px",
    },
    borderRadius: "22px",
    backgroundColor: "#050814",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflowX: "auto",
    overscrollBehaviorX: "contain",
    padding: {
      default: "clamp(8px, 1vw, 14px)",
      "@media (max-width: 760px)": "6px",
    },
    boxSizing: "border-box",
  },
padMatrix: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(8, minmax(44px, 1fr))",
      "@media (max-width: 760px)": "repeat(8, minmax(36px, 1fr))",
    },
    gap: {
      default: "clamp(4px, 0.6vw, 8px)",
      "@media (max-width: 760px)": "4px",
    },
  },
sceneColumn: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(4, minmax(54px, 1fr))",
      "@media (min-width: 900px)": "1fr",
    },
    gap: {
      default: "clamp(4px, 0.6vw, 8px)",
      "@media (max-width: 760px)": "4px",
    },
  },
faderBank: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(9, minmax(44px, 1fr))",
      "@media (max-width: 760px)": "repeat(9, minmax(36px, 1fr))",
    },
    gap: {
      default: "10px",
      "@media (max-width: 760px)": "4px",
    },
    width: "100%",
    minWidth: 0,
    overflowX: "visible",
    overscrollBehaviorX: "contain",
    marginTop: "10px",
  },
lastCommandBar: {
    display: "grid",
    gap: "4px",
    marginTop: "12px",
    borderRadius: "14px",
    backgroundColor: "rgba(8, 10, 18, 0.7)",
    padding: "10px 12px",
    color: "#cbd5e1",
    fontSize: "0.82rem",
    overflowWrap: "anywhere",
  },
})
