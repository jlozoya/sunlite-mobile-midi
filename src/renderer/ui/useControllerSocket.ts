import { useCallback, useEffect, useRef, useState } from "react"
import {
  DEFAULT_CONTROLLER_CUSTOMIZATION,
  type ControllerCustomization,
} from "../../shared/controller-config"
import type {
  MidiFeedbackState,
  MidiInputMessage,
  MidiPadFeedback,
  SocketMessage,
} from "./types"
import type { AutomationSocketCommand } from "../../shared/automation-types"
import { websocketUrlForPage } from "../../shared/websocket-url"
import { createReconnectingSocket } from "./socket-connection"

type ConnectionState = "connecting" | "online" | "offline" | "error"

type MidiCommand =
  | { type: "note"; note: number; velocity?: number; offDelayMs?: number }
  | { type: "noteon"; note: number; velocity?: number }
  | { type: "noteoff"; note: number; velocity?: number }
  | { type: "cc"; controller: number; value: number }
  | { type: "program"; number: number }

function normalizeMidiFeedbackState(
  state:
    | MidiFeedbackState
    | { padVelocities?: Record<number, number>; ccValues?: Record<number, number> },
): MidiFeedbackState {
  const source = state as MidiFeedbackState & { padVelocities?: Record<number, number> }

  const padStatesFromState = Object.fromEntries(
    Object.entries(source.padStates ?? {}).map(([key, value]) => [
      Number(key),
      {
        velocity: Number(value.velocity),
        behaviorChannel: normalizeMidiBehaviorChannel(value.behaviorChannel),
      },
    ]),
  ) as Record<number, MidiPadFeedback>

  const legacyPadStates = Object.fromEntries(
    Object.entries(source.padVelocities ?? {}).map(([key, value]) => [
      Number(key),
      { velocity: Number(value), behaviorChannel: 6 },
    ]),
  ) as Record<number, MidiPadFeedback>

  return {
    padStates: Object.keys(padStatesFromState).length
      ? padStatesFromState
      : legacyPadStates,
    ccValues: Object.fromEntries(
      Object.entries(source.ccValues ?? {}).map(([key, value]) => [
        Number(key),
        Number(value),
      ]),
    ),
  }
}

function normalizeMidiBehaviorChannel(value: unknown): number {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 6
  return Math.max(0, Math.min(15, Math.round(numeric)))
}

export function useControllerSocket() {
  const socketRef = useRef<WebSocket | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")
  const [lastCommand, setLastCommand] = useState("None")
  const [serverMidiLabel, setServerMidiLabel] = useState<string | null>(null)
  const [padStates, setPadStates] = useState<Record<number, MidiPadFeedback>>({})
  const [ccValues, setCcValues] = useState<Record<number, number>>({})
  const [controllerCustomization, setControllerCustomization] =
    useState<ControllerCustomization>(DEFAULT_CONTROLLER_CUSTOMIZATION)

  const applyFeedbackState = useCallback(
    (
      state:
        | MidiFeedbackState
        | { padVelocities?: Record<number, number>; ccValues?: Record<number, number> },
    ) => {
      const nextState = normalizeMidiFeedbackState(state)
      setPadStates(nextState.padStates)
      setCcValues(nextState.ccValues)
    },
    [],
  )

  const clearNoteFeedback = useCallback((note: number) => {
    setPadStates((current) => {
      if (!(note in current)) return current

      const next = { ...current }
      delete next[note]
      return next
    })
  }, [])

  const setPersistentNoteFeedback = useCallback(
    (note: number, velocity: number, behaviorChannel: number) => {
      if (velocity <= 0) {
        clearNoteFeedback(note)
        return
      }

      setPadStates((current) => ({
        ...current,
        [note]: {
          velocity,
          behaviorChannel: normalizeMidiBehaviorChannel(behaviorChannel),
        },
      }))
    },
    [clearNoteFeedback],
  )

  const handleMidiInput = useCallback(
    (message: MidiInputMessage) => {
      console.info("[MIDI OUT -> UI]", message)

      if (message.kind === "noteon") {
        setPersistentNoteFeedback(message.note, message.velocity, message.channel)
        setLastCommand(`MIDI IN note ${message.note} velocity ${message.velocity}`)
        return
      }

      if (message.kind === "noteoff") {
        clearNoteFeedback(message.note)
        setLastCommand(`MIDI IN note ${message.note} off`)
        return
      }

      if (message.kind === "cc") {
        setCcValues((current) => ({ ...current, [message.controller]: message.value }))
        setLastCommand(`MIDI IN CC ${message.controller} value ${message.value}`)
      }
    },
    [clearNoteFeedback, setPersistentNoteFeedback],
  )

  useEffect(() => {
    const disconnect = createReconnectingSocket(
      websocketUrlForPage(window.location.href),
      {
        onConnect(socket) {
          socketRef.current = socket
          setConnectionState("connecting")
        },
        onOpen() {
          setConnectionState("online")
        },
        onClose() {
          socketRef.current = null
          setConnectionState("offline")
        },
        onError() {
          setConnectionState("error")
        },
        onMessage(event) {
          try {
            const payload = JSON.parse(event.data) as SocketMessage

            if ("type" in payload && payload.type === "server-ready") {
              setConnectionState("online")
              const feedbackLabel = payload.feedbackDisabledReason
                ? `Feedback disabled: ${payload.feedbackDisabledReason}`
                : `MIDI IN: ${payload.midiInputName ?? "No feedback input"}`
              setServerMidiLabel(
                `MIDI OUT: ${payload.midiOutputName} · ${feedbackLabel} · Ch ${payload.midiChannel}`,
              )
              setLastCommand(
                payload.feedbackDisabledReason
                  ? `Warning: ${payload.feedbackDisabledReason}`
                  : `Ready: ${payload.midiOutputName}`,
              )
              return
            }

            if ("type" in payload && payload.type === "setup-required") {
              setConnectionState("online")
              setServerMidiLabel(`Setup required: ${payload.expectedMidiOutputName}`)
              setLastCommand(`Missing MIDI output: ${payload.expectedMidiOutputName}`)
              return
            }

            if ("event" in payload && payload.event === "midi-feedback-state") {
              // Snapshots and live feedback share one ordered stream, so an older HTTP
              // response cannot overwrite the latest LED or fader state.
              applyFeedbackState(payload.state)
              return
            }

            if ("event" in payload && payload.event === "midi-input") {
              handleMidiInput(payload.message)
              return
            }

            if ("event" in payload && payload.event === "feedback-disabled") {
              setLastCommand(`Feedback disabled: ${payload.message}`)
              return
            }

            if ("event" in payload && payload.event === "controller-config") {
              setControllerCustomization(payload.config)
              return
            }

            if ("event" in payload && payload.event === "command-result") {
              setLastCommand(JSON.stringify(payload.command))
              return
            }

            if ("event" in payload && payload.event === "last-command") {
              setLastCommand(JSON.stringify(payload.command))
              return
            }

            if ("type" in payload && payload.type === "error") {
              setLastCommand(`Error: ${payload.message}`)
            }
          } catch {
            setLastCommand(String(event.data))
          }
        },
      },
    )
    return () => {
      socketRef.current = null
      disconnect()
    }
  }, [applyFeedbackState, handleMidiInput])

  const sendCommand = useCallback((command: MidiCommand) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setLastCommand("Socket is not connected")
      return
    }

    socket.send(JSON.stringify(command))
  }, [])

  const sendAutomationCommand = useCallback((command: AutomationSocketCommand) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(command))
    return true
  }, [])

  return {
    connectionState,
    lastCommand,
    serverMidiLabel,
    padStates,
    ccValues,
    controllerCustomization,
    setControllerCustomization,
    sendCommand,
    sendAutomationCommand,
  }
}
