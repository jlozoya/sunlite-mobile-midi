import easymidi from "easymidi"
import type { AutomationMidiCommand } from "../../shared/automation-types.js"
import { noteRelease, type LightingSoftware } from "../../shared/lighting-software.js"
import { findLoopMidiExecutable } from "../../router/loop-midi.js"
import type { createMidiFeedbackStore } from "../persistence/midi-feedback-store.js"
import { MIDI_CHANNEL_ZERO_BASED, MIDI_OUTPUT_NAME, MIDI_INPUT_NAME } from "./settings.js"
import { clampMidiValue } from "./values.js"

type IncomingCommand =
  | { type: "note"; note: number; velocity?: number; offDelayMs?: number }
  | { type: "noteon"; note: number; velocity?: number }
  | { type: "noteoff"; note: number; velocity?: number }
  | { type: "cc"; controller: number; value: number }
  | { type: "program"; number: number }
export type { IncomingCommand }

export function createMidiControllerService({
  broadcastToAll,
  recordFeedback,
  getLightingSoftware,
  feedbackStore,
}: {
  broadcastToAll: (payload: unknown) => void
  recordFeedback: (command: AutomationMidiCommand) => void
  getLightingSoftware: () => LightingSoftware
  feedbackStore: ReturnType<typeof createMidiFeedbackStore>
}) {
  const { cloneMidiFeedbackState, updateMidiFeedbackState } = feedbackStore
  const broadcastMidiFeedbackState = () =>
    broadcastToAll({ event: "midi-feedback-state", state: cloneMidiFeedbackState() })
  type MidiConnection = {
    outputName: string
    output: easymidi.Output
    inputName: string | null
    input: easymidi.Input | null
    midi: ReturnType<typeof createMidiSender>
  }

  type MidiPayload = Record<string, number>

  type MidiSend = (messageType: string, payload: MidiPayload) => void

  function sendMidi(output: easymidi.Output, messageType: string, payload: MidiPayload) {
    ;(output.send as unknown as MidiSend)(messageType, payload)
  }

  function midiMessageToRecord(message: unknown): Record<string, unknown> {
    return message as unknown as Record<string, unknown>
  }

  let midiConnection: MidiConnection | null = null

  let feedbackDisabledReason: string | null = null

  type MidiGuardEvent = { at: number; fingerprint: string }

  const MIDI_LOOP_GUARD_WINDOW_MS = 1000

  const MIDI_LOOP_GUARD_MAX_TOTAL_MESSAGES = 240

  const MIDI_LOOP_GUARD_MAX_REPEATED_MESSAGES = 80

  const MIDI_LOOP_GUARD_WARNING_INTERVAL_MS = 3000

  let midiGuardEvents: MidiGuardEvent[] = []

  let midiFeedbackBroadcastTimer: NodeJS.Timeout | null = null

  let lastMidiLoopGuardWarningAt = 0

  function queueMidiFeedbackStateBroadcast() {
    if (midiFeedbackBroadcastTimer) {
      clearTimeout(midiFeedbackBroadcastTimer)
    }

    midiFeedbackBroadcastTimer = setTimeout(() => {
      midiFeedbackBroadcastTimer = null
      broadcastMidiFeedbackState()
    }, 35)
  }

  function getAvailableMidiOutputs(): string[] {
    try {
      return easymidi.getOutputs()
    } catch {
      return []
    }
  }

  function getAvailableMidiInputs(): string[] {
    try {
      return easymidi.getInputs()
    } catch {
      return []
    }
  }

  function findMidiName(names: string[], targetName: string): string | null {
    const exactMatch = names.find((name) => name === targetName)
    if (exactMatch) return exactMatch

    const partialMatch = names.find((name) =>
      name.toLowerCase().includes(targetName.toLowerCase()),
    )

    return partialMatch ?? null
  }

  function findMidiOutputName(targetName: string): string | null {
    return findMidiName(getAvailableMidiOutputs(), targetName)
  }

  function findMidiInputName(targetName: string): string | null {
    return findMidiName(getAvailableMidiInputs(), targetName)
  }

  function createMidiSender(output: easymidi.Output) {
    function sendNoteOn(note: number, velocity = 127) {
      sendMidi(output, "noteon", {
        note: clampMidiValue(note),
        velocity: clampMidiValue(velocity),
        channel: MIDI_CHANNEL_ZERO_BASED,
      })
    }

    function sendNoteOff(note: number, velocity = 0) {
      const release = noteRelease(getLightingSoftware(), clampMidiValue(velocity))
      sendMidi(output, release.type, {
        note: clampMidiValue(note),
        velocity: release.velocity,
        channel: MIDI_CHANNEL_ZERO_BASED,
      })
    }

    function sendNote(note: number, velocity = 127, offDelayMs = 500) {
      sendNoteOn(note, velocity)
      const release = noteRelease(getLightingSoftware())

      setTimeout(
        () => {
          try {
            sendMidi(output, release.type, {
              note: clampMidiValue(note),
              velocity: release.velocity,
              channel: MIDI_CHANNEL_ZERO_BASED,
            })
          } catch (error) {
            console.warn("Could not release MIDI note", error)
          }
        },
        Math.max(0, Math.min(5000, Number.isFinite(offDelayMs) ? offDelayMs : 500)),
      )
    }

    function sendControlChange(controller: number, value: number) {
      sendMidi(output, "cc", {
        controller: clampMidiValue(controller),
        value: clampMidiValue(value),
        channel: MIDI_CHANNEL_ZERO_BASED,
      })
    }

    function sendProgramChange(number: number) {
      sendMidi(output, "program", {
        number: clampMidiValue(number),
        channel: MIDI_CHANNEL_ZERO_BASED,
      })
    }

    return { sendNote, sendNoteOn, sendNoteOff, sendControlChange, sendProgramChange }
  }

  function closeMidiConnection() {
    try {
      midiConnection?.input?.close()
    } catch {
      // Ignore close failures from native MIDI backends.
    }

    try {
      midiConnection?.output.close()
    } catch {
      // Ignore close failures from native MIDI backends.
    }

    midiConnection = null
  }

  function getMidiMessageFingerprint(
    kind: string,
    message: Record<string, unknown>,
  ): string {
    const channel = String(message.channel ?? "")
    const note = String(message.note ?? "")
    const velocity = String(message.velocity ?? "")
    const controller = String(message.controller ?? "")
    const value = String(message.value ?? "")

    return `${kind}:${channel}:${note}:${velocity}:${controller}:${value}`
  }

  function resetMidiLoopGuard() {
    midiGuardEvents = []
    lastMidiLoopGuardWarningAt = 0
  }

  function updateFeedbackStatus(reason: string | null) {
    feedbackDisabledReason = reason
  }

  function disableMidiFeedback(reason: string) {
    updateFeedbackStatus(reason)
    broadcastToAll({ event: "feedback-disabled", message: reason })
  }

  function shouldAcceptMidiFeedback(
    kind: string,
    message: Record<string, unknown>,
  ): boolean {
    if (feedbackDisabledReason) return false

    const now = Date.now()
    const fingerprint = getMidiMessageFingerprint(kind, message)

    midiGuardEvents = midiGuardEvents.filter(
      (event) => now - event.at <= MIDI_LOOP_GUARD_WINDOW_MS,
    )
    midiGuardEvents.push({ at: now, fingerprint })

    const repeatedCount = midiGuardEvents.filter(
      (event) => event.fingerprint === fingerprint,
    ).length
    const totalCount = midiGuardEvents.length

    if (
      repeatedCount >= MIDI_LOOP_GUARD_MAX_REPEATED_MESSAGES ||
      totalCount >= MIDI_LOOP_GUARD_MAX_TOTAL_MESSAGES
    ) {
      if (now - lastMidiLoopGuardWarningAt >= MIDI_LOOP_GUARD_WARNING_INTERVAL_MS) {
        lastMidiLoopGuardWarningAt = now
      }

      return true
    }

    return true
  }

  function refreshMidiConnection() {
    const outputName = findMidiOutputName(MIDI_OUTPUT_NAME)
    const inputNameCandidate = findMidiInputName(MIDI_INPUT_NAME)
    const availableMidiOutputs = getAvailableMidiOutputs()
    const availableMidiInputs = getAvailableMidiInputs()

    closeMidiConnection()
    resetMidiLoopGuard()
    updateFeedbackStatus(null)

    if (outputName) {
      const output = new easymidi.Output(outputName)
      let inputName =
        inputNameCandidate && inputNameCandidate !== outputName
          ? inputNameCandidate
          : null

      if (inputNameCandidate && inputNameCandidate === outputName) {
        disableMidiFeedback(
          `MIDI feedback is disabled because input and output resolve to the same port: "${outputName}". Use separate ports: "${MIDI_OUTPUT_NAME}" for App → Sunlite and "${MIDI_INPUT_NAME}" for Sunlite → App.`,
        )
        inputName = null
      }

      const input = inputName ? new easymidi.Input(inputName) : null

      if (input) {
        input.on("noteon", (message) => {
          const record = midiMessageToRecord(message)
          if (!shouldAcceptMidiFeedback("noteon", record)) return
          updateMidiFeedbackState("noteon", record)
          recordFeedback({
            type: "noteon",
            note: clampMidiValue(message.note),
            velocity: clampMidiValue(message.velocity),
          })
          broadcastToAll({ event: "midi-input", message: { kind: "noteon", ...message } })
          queueMidiFeedbackStateBroadcast()
        })

        input.on("noteoff", (message) => {
          const record = midiMessageToRecord(message)
          if (!shouldAcceptMidiFeedback("noteoff", record)) return
          updateMidiFeedbackState("noteoff", record)
          recordFeedback({
            type: "noteoff",
            note: clampMidiValue(message.note),
            velocity: clampMidiValue(message.velocity),
          })
          broadcastToAll({
            event: "midi-input",
            message: { kind: "noteoff", ...message },
          })
          queueMidiFeedbackStateBroadcast()
        })

        input.on("cc", (message) => {
          const record = midiMessageToRecord(message)
          if (!shouldAcceptMidiFeedback("cc", record)) return
          updateMidiFeedbackState("cc", record)
          recordFeedback({
            type: "cc",
            controller: clampMidiValue(message.controller),
            value: clampMidiValue(message.value),
          })
          broadcastToAll({ event: "midi-input", message: { kind: "cc", ...message } })
          queueMidiFeedbackStateBroadcast()
        })
      }

      midiConnection = {
        outputName,
        output,
        inputName,
        input,
        midi: createMidiSender(output),
      }
    }

    return getStatus(availableMidiOutputs, availableMidiInputs)
  }

  function handleCommand(payload: IncomingCommand) {
    if (!midiConnection) {
      throw new Error(
        `MIDI output "${MIDI_OUTPUT_NAME}" is not available. Install/open loopMIDI and create the port first.`,
      )
    }

    if (payload.type === "note") {
      const note = clampMidiValue(payload.note)
      const velocity = clampMidiValue(payload.velocity ?? 127)
      const delay = Number(payload.offDelayMs ?? 500)
      const offDelayMs = Math.max(0, Math.min(5000, Number.isFinite(delay) ? delay : 500))
      midiConnection.midi.sendNote(note, velocity, offDelayMs)

      return { ok: true, type: "note", note, velocity, offDelayMs }
    }

    if (payload.type === "noteon") {
      const note = clampMidiValue(payload.note)
      const velocity = clampMidiValue(payload.velocity ?? 127)
      midiConnection.midi.sendNoteOn(note, velocity)

      return { ok: true, type: "noteon", note, velocity }
    }

    if (payload.type === "noteoff") {
      const note = clampMidiValue(payload.note)
      const velocity = clampMidiValue(payload.velocity ?? 0)
      midiConnection.midi.sendNoteOff(note, velocity)

      return { ok: true, type: "noteoff", note, velocity }
    }

    if (payload.type === "cc") {
      const controller = clampMidiValue(payload.controller)
      const value = clampMidiValue(payload.value)
      midiConnection.midi.sendControlChange(controller, value)

      return { ok: true, type: "cc", controller, value }
    }

    if (payload.type === "program") {
      const number = clampMidiValue(payload.number)
      midiConnection.midi.sendProgramChange(number)

      return { ok: true, type: "program", number }
    }

    throw new Error("Unsupported MIDI command.")
  }
  function getStatus(
    availableMidiOutputs = getAvailableMidiOutputs(),
    availableMidiInputs = getAvailableMidiInputs(),
  ) {
    const loopMidiExecutablePath = findLoopMidiExecutable()
    return {
      availableMidiOutputs,
      availableMidiInputs,
      midiOutputName: midiConnection?.outputName ?? null,
      midiInputName: feedbackDisabledReason ? null : (midiConnection?.inputName ?? null),
      midiReady: Boolean(midiConnection),
      feedbackReady: Boolean(midiConnection?.input) && !feedbackDisabledReason,
      feedbackDisabledReason,
      loopMidiExecutablePath,
      loopMidiInstalled: Boolean(loopMidiExecutablePath),
    }
  }
  return {
    refreshMidiConnection,
    closeMidiConnection,
    handleCommand,
    getStatus,
    getConnection: () => midiConnection,
  }
}
