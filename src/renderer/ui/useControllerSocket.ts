import { useCallback, useEffect, useRef, useState } from "react"
import { DEFAULT_CONTROLLER_CUSTOMIZATION, type ControllerCustomization } from "../../shared/controller-config"
import type { MidiInputMessage, SocketMessage } from "./types"

type ConnectionState = "connecting" | "online" | "offline" | "error"

type MidiCommand =
  | { type: "note"; note: number; velocity?: number; offDelayMs?: number }
  | { type: "noteon"; note: number; velocity?: number }
  | { type: "noteoff"; note: number; velocity?: number }
  | { type: "cc"; controller: number; value: number }
  | { type: "program"; number: number }

export function useControllerSocket() {
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")
  const [lastCommand, setLastCommand] = useState("None")
  const [serverMidiLabel, setServerMidiLabel] = useState<string | null>(null)
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({})
  const [ccValues, setCcValues] = useState<Record<number, number>>({})
  const [controllerCustomization, setControllerCustomization] = useState<ControllerCustomization>(DEFAULT_CONTROLLER_CUSTOMIZATION)

  const clearNoteFeedback = useCallback((note: number) => {
    setPadVelocities((current) => {
      if (!(note in current)) return current

      const next = { ...current }
      delete next[note]
      return next
    })
  }, [])

  const setPersistentNoteFeedback = useCallback((note: number, velocity: number) => {
    if (velocity <= 0) {
      clearNoteFeedback(note)
      return
    }

    setPadVelocities((current) => ({ ...current, [note]: velocity }))
  }, [clearNoteFeedback])

  const handleMidiInput = useCallback((message: MidiInputMessage) => {
    if (message.kind === "noteon") {
      setPersistentNoteFeedback(message.note, message.velocity)
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
  }, [clearNoteFeedback, setPersistentNoteFeedback])

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    const url = `${protocol}://${window.location.host}`
    const socket = new WebSocket(url)

    socketRef.current = socket
    setConnectionState("connecting")

    socket.addEventListener("open", () => {
      setConnectionState("online")
    })

    socket.addEventListener("close", () => {
      setConnectionState("offline")

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }

      reconnectTimerRef.current = window.setTimeout(connect, 1000)
    })

    socket.addEventListener("error", () => {
      setConnectionState("error")
    })

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data) as SocketMessage

        if ("type" in payload && payload.type === "server-ready") {
          setConnectionState("online")
          const feedbackLabel = payload.feedbackDisabledReason
            ? `Feedback disabled: ${payload.feedbackDisabledReason}`
            : `${payload.midiInputName ?? "No feedback input"} ← Sunlite`
          setServerMidiLabel(`${payload.midiOutputName} → Sunlite · ${feedbackLabel} · Ch ${payload.midiChannel}`)
          setLastCommand(payload.feedbackDisabledReason ? `Warning: ${payload.feedbackDisabledReason}` : `Ready: ${payload.midiOutputName}`)
          return
        }

        if ("type" in payload && payload.type === "setup-required") {
          setConnectionState("online")
          setServerMidiLabel(`Setup required: ${payload.expectedMidiOutputName}`)
          setLastCommand(`Missing MIDI output: ${payload.expectedMidiOutputName}`)
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
    })
  }, [handleMidiInput])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }

      socketRef.current?.close()
    }
  }, [connect])

  const sendCommand = useCallback((command: MidiCommand) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setLastCommand("Socket is not connected")
      return
    }

    socket.send(JSON.stringify(command))
  }, [])

  return {
    connectionState,
    lastCommand,
    serverMidiLabel,
    padVelocities,
    ccValues,
    controllerCustomization,
    setControllerCustomization,
    sendCommand,
  }
}
