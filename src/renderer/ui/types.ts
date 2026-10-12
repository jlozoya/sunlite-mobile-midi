import type { ControllerCustomization } from "../../shared/controller-config"
import type {
  AutomationSocketEvent,
  AutomationStatus,
} from "../../shared/automation-types"
import type { MidiFeedbackState } from "../../shared/midi-feedback"

export type MidiInputMessage =
  | { kind: "noteon"; note: number; velocity: number; channel: number }
  | { kind: "noteoff"; note: number; velocity: number; channel: number }
  | { kind: "cc"; controller: number; value: number; channel: number }

export type SocketMessage =
  | {
      type: "server-ready"
      midiOutputName: string
      midiInputName: string | null
      feedbackReady: boolean
      feedbackDisabledReason?: string | null
      midiChannel: number
    }
  | {
      type: "setup-required"
      expectedMidiOutputName: string
      expectedMidiInputName: string
      availableMidiOutputs: string[]
      feedbackDisabledReason?: string | null
    }
  | {
      event: "command-result"
      command: unknown
    }
  | {
      event: "last-command"
      command: unknown
    }
  | {
      event: "midi-input"
      message: MidiInputMessage
    }
  | {
      event: "midi-feedback-state"
      state: MidiFeedbackState
    }
  | {
      event: "feedback-disabled"
      message: string
    }
  | {
      event: "controller-config"
      config: ControllerCustomization
    }
  | {
      type: "error"
      message: string
    }
  | AutomationSocketEvent

export type { AutomationStatus }

export type MidiCommand =
  | { type: "note"; note: number; velocity?: number; offDelayMs?: number }
  | { type: "noteon"; note: number; velocity?: number }
  | { type: "noteoff"; note: number; velocity?: number }
  | { type: "cc"; controller: number; value: number }
  | { type: "program"; number: number }

export type EditableControl =
  | { kind: "pad"; id: string; note: number }
  | { kind: "scene"; id: string; note: number }
  | { kind: "fader"; id: string; controller: number }

export type { NetworkUrlCandidate, ServerStatus } from "../../shared/server-status"

export type { MidiPadFeedback, MidiFeedbackState } from "../../shared/midi-feedback"
