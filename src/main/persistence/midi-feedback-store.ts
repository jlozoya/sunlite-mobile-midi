import fs from "node:fs"
import path from "node:path"
import type { MidiPadFeedback, MidiFeedbackState } from "../../shared/midi-feedback.js"
import { clampMidiValue } from "../midi/values.js"

export function createMidiFeedbackStore(lightingProfilePath: () => string) {
  let midiFeedbackState: MidiFeedbackState = { padStates: {}, ccValues: {} }

  function cloneMidiFeedbackState(): MidiFeedbackState {
    return {
      padStates: Object.fromEntries(
        Object.entries(midiFeedbackState.padStates).map(([note, state]) => [
          note,
          { ...state },
        ]),
      ),
      ccValues: { ...midiFeedbackState.ccValues },
    }
  }

  function getMidiFeedbackStatePath(): string {
    return path.join(lightingProfilePath(), "midi-feedback-state.json")
  }

  function normalizeStoredMidiFeedbackState(value: unknown): MidiFeedbackState {
    if (!value || typeof value !== "object") {
      return { padStates: {}, ccValues: {} }
    }

    const source = value as Partial<MidiFeedbackState> & {
      padVelocities?: Record<string, unknown>
    }

    function normalizeMidiNumberRecord(record: unknown): Record<number, number> {
      if (!record || typeof record !== "object") {
        return {}
      }

      const normalized: Record<number, number> = {}

      for (const [key, rawValue] of Object.entries(record as Record<string, unknown>)) {
        const midiKey = clampMidiValue(key)
        const midiValue = clampMidiValue(rawValue)
        normalized[midiKey] = midiValue
      }

      return normalized
    }

    function normalizePadStates(record: unknown): Record<number, MidiPadFeedback> {
      if (!record || typeof record !== "object") {
        return {}
      }

      const normalized: Record<number, MidiPadFeedback> = {}

      for (const [key, rawValue] of Object.entries(record as Record<string, unknown>)) {
        const note = clampMidiValue(key)

        if (rawValue && typeof rawValue === "object") {
          const item = rawValue as Partial<MidiPadFeedback>
          const velocity = clampMidiValue(item.velocity)

          if (velocity > 0) {
            normalized[note] = {
              velocity,
              behaviorChannel: clampMidiLedBehaviorChannel(item.behaviorChannel),
            }
          }

          continue
        }

        const legacyVelocity = clampMidiValue(rawValue)
        if (legacyVelocity > 0) {
          normalized[note] = { velocity: legacyVelocity, behaviorChannel: 6 }
        }
      }

      return normalized
    }

    const padStates = normalizePadStates(source.padStates ?? source.padVelocities)

    return {
      padStates,
      ccValues: normalizeMidiNumberRecord(source.ccValues),
    }
  }

  function clampMidiLedBehaviorChannel(value: unknown): number {
    const numericValue = Number(value)

    if (Number.isNaN(numericValue)) {
      return 6
    }

    return Math.max(0, Math.min(15, Math.round(numericValue)))
  }

  function loadMidiFeedbackState(): MidiFeedbackState {
    const statePath = getMidiFeedbackStatePath()

    try {
      if (!fs.existsSync(statePath)) {
        midiFeedbackState = { padStates: {}, ccValues: {} }
        return cloneMidiFeedbackState()
      }

      const raw = fs.readFileSync(statePath, "utf8")
      midiFeedbackState = normalizeStoredMidiFeedbackState(JSON.parse(raw))
      return cloneMidiFeedbackState()
    } catch {
      midiFeedbackState = { padStates: {}, ccValues: {} }
      return cloneMidiFeedbackState()
    }
  }

  function saveMidiFeedbackState() {
    const statePath = getMidiFeedbackStatePath()

    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true })
      fs.writeFileSync(
        statePath,
        JSON.stringify(cloneMidiFeedbackState(), null, 2),
        "utf8",
      )
    } catch {
      // Ignore persistence failures; live MIDI feedback should continue working.
    }
  }

  function updateMidiFeedbackState(
    kind: "noteon" | "noteoff" | "cc",
    message: Record<string, unknown>,
  ): MidiFeedbackState {
    if (kind === "noteon") {
      const note = clampMidiValue(message.note)
      const velocity = clampMidiValue(message.velocity)
      const behaviorChannel = clampMidiLedBehaviorChannel(message.channel)

      if (velocity <= 0) {
        const nextPadStates = { ...midiFeedbackState.padStates }
        delete nextPadStates[note]
        midiFeedbackState = { ...midiFeedbackState, padStates: nextPadStates }
        saveMidiFeedbackState()
        return cloneMidiFeedbackState()
      }

      midiFeedbackState = {
        ...midiFeedbackState,
        padStates: {
          ...midiFeedbackState.padStates,
          [note]: { velocity, behaviorChannel },
        },
      }
      saveMidiFeedbackState()
      return cloneMidiFeedbackState()
    }

    if (kind === "noteoff") {
      const note = clampMidiValue(message.note)
      const nextPadStates = { ...midiFeedbackState.padStates }
      delete nextPadStates[note]
      midiFeedbackState = { ...midiFeedbackState, padStates: nextPadStates }
      saveMidiFeedbackState()
      return cloneMidiFeedbackState()
    }

    const controller = clampMidiValue(message.controller)
    const value = clampMidiValue(message.value)
    midiFeedbackState = {
      ...midiFeedbackState,
      ccValues: { ...midiFeedbackState.ccValues, [controller]: value },
    }
    saveMidiFeedbackState()
    return cloneMidiFeedbackState()
  }
  return {
    cloneMidiFeedbackState,
    loadMidiFeedbackState,
    saveMidiFeedbackState,
    updateMidiFeedbackState,
    clear: () => {
      midiFeedbackState = { padStates: {}, ccValues: {} }
    },
  }
}
