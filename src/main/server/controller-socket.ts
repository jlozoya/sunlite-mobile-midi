import { WebSocketServer, type WebSocket } from "ws"
import type { AutomationSocketCommand } from "../../shared/automation-types.js"
import type { AutomationEngine } from "../automation/automation-engine.js"
import type {
  createMidiControllerService,
  IncomingCommand,
} from "../midi/controller-service.js"
import type { createControllerStore } from "../persistence/controller-store.js"
import type { createMidiFeedbackStore } from "../persistence/midi-feedback-store.js"
import {
  MIDI_CHANNEL_ZERO_BASED,
  MIDI_OUTPUT_NAME,
  MIDI_INPUT_NAME,
} from "../midi/settings.js"

function safeSend(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function broadcast(wss: WebSocketServer, payload: unknown) {
  for (const client of wss.clients) {
    safeSend(client, payload)
  }
}

function isAutomationSocketCommand(value: unknown): value is AutomationSocketCommand {
  if (!value || typeof value !== "object" || !("type" in value)) return false
  const type = (value as { type?: unknown }).type
  return type === "automation-audio-frame" || type === "automation-audio-disconnected"
}
export { broadcast }
export function registerControllerSocket(
  wss: WebSocketServer,
  {
    refreshMidiConnection,
    midiController,
    controllerStore,
    feedbackStore,
    getEngine,
  }: {
    refreshMidiConnection: () => unknown
    midiController: ReturnType<typeof createMidiControllerService>
    controllerStore: ReturnType<typeof createControllerStore>
    feedbackStore: ReturnType<typeof createMidiFeedbackStore>
    getEngine: () => AutomationEngine | null
  },
) {
  const { cloneMidiFeedbackState } = feedbackStore
  const { handleCommand } = midiController
  wss.on("connection", (socket) => {
    refreshMidiConnection()
    const midiConnection = midiController.getConnection()
    const { feedbackDisabledReason } = midiController.getStatus()
    safeSend(socket, {
      event: "controller-config",
      config: controllerStore.getCustomization(),
    })
    safeSend(socket, { event: "midi-feedback-state", state: cloneMidiFeedbackState() })
    const automationEngine = getEngine()
    if (automationEngine) {
      safeSend(socket, {
        event: "automation-status",
        status: automationEngine.getStatus(),
      })
    }

    setTimeout(
      () =>
        safeSend(socket, {
          event: "midi-feedback-state",
          state: cloneMidiFeedbackState(),
        }),
      350,
    )

    setTimeout(
      () =>
        safeSend(socket, {
          event: "midi-feedback-state",
          state: cloneMidiFeedbackState(),
        }),
      1200,
    )

    if (midiConnection) {
      safeSend(socket, {
        type: "server-ready",
        midiOutputName: midiConnection.outputName,
        midiInputName: feedbackDisabledReason ? null : midiConnection.inputName,
        feedbackReady: Boolean(midiConnection.input) && !feedbackDisabledReason,
        feedbackDisabledReason,
        midiChannel: MIDI_CHANNEL_ZERO_BASED + 1,
      })
    } else {
      safeSend(socket, {
        type: "setup-required",
        expectedMidiOutputName: MIDI_OUTPUT_NAME,
        expectedMidiInputName: MIDI_INPUT_NAME,
        availableMidiOutputs: midiController.getStatus().availableMidiOutputs,
        feedbackDisabledReason,
      })
    }

    socket.on("message", (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString()) as unknown

        if (isAutomationSocketCommand(payload)) {
          if (payload.type === "automation-audio-frame") {
            getEngine()?.handleAudioFrame(payload.frame)
          } else {
            getEngine()?.handleAudioDisconnected()
          }
          return
        }

        const midiPayload = payload as IncomingCommand
        const result = handleCommand(midiPayload)
        getEngine()?.recordManualCommand(midiPayload)

        safeSend(socket, { event: "command-result", command: result })
        broadcast(wss, { event: "last-command", command: result })
      } catch (error) {
        safeSend(socket, {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        })
      }
    })
  })
}
