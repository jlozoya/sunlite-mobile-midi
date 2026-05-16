import type { ControllerCustomization } from "../../shared/controller-config"

export type NetworkUrlCandidate = {
  interfaceName: string
  address: string
  url: string
  priority: number
  note: string
}

export type ServerStatus = {
  port: number
  localUrl: string
  lanUrls: string[]
  networkUrlCandidates: NetworkUrlCandidate[]
  preferredLanUrl: string
  qrDataUrl: string
  midiOutputName: string | null
  midiInputName: string | null
  expectedMidiOutputName: string
  expectedMidiInputName: string
  midiReady: boolean
  feedbackReady: boolean
  feedbackDisabledReason: string | null
  midiChannel: number
  availableMidiOutputs: string[]
  availableMidiInputs: string[]
  loopMidiInstallerAvailable: boolean
  loopMidiExecutablePath: string | null
  loopMidiInstalled: boolean
}

export type MidiInputMessage =
  | { kind: "noteon"; note: number; velocity: number; channel: number }
  | { kind: "noteoff"; note: number; velocity: number; channel: number }
  | { kind: "cc"; controller: number; value: number; channel: number }

export type MidiPadFeedback = {
  velocity: number
  behaviorChannel: number
}

export type MidiFeedbackState = {
  padStates: Record<number, MidiPadFeedback>
  ccValues: Record<number, number>
}

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
