export type AutomationMode = "manual" | "assist" | "auto"

export type AutomationMidiCommand =
  | { type: "note"; note: number; velocity?: number; offDelayMs?: number }
  | { type: "noteon"; note: number; velocity?: number }
  | { type: "noteoff"; note: number; velocity?: number }
  | { type: "cc"; controller: number; value: number }
  | { type: "program"; number: number }

export type AudioFeatures = {
  rms: number
  bass: number
  mid: number
  high: number
  flux: number
  centroid: number
}

export type AutomationAudioFrame = {
  capturedAt: number
  sampleRate: number
  features: AudioFeatures
  spectrum: number[]
}

export type DjLinkDevice = {
  deviceNumber: number
  name: string
  address: string
  model?: string
  lastSeenAt: number
}

export type DjLinkBeat = {
  deviceNumber: number
  name: string
  address: string
  bpm: number
  beatWithinBar: number
  pitchPercent: number
  receivedAt: number
}

export type DjLinkPosition = {
  deviceNumber: number
  name: string
  address: string
  bpm: number
  positionMs: number
  trackLengthSeconds: number
  pitchPercent: number
  receivedAt: number
}

export type DjLinkEvent =
  | { type: "ready"; message: string }
  | { type: "device"; device: DjLinkDevice }
  | { type: "beat"; beat: DjLinkBeat }
  | { type: "position"; position: DjLinkPosition }
  | { type: "warning" | "error"; message: string }

export type DjLinkBridgeStatus = {
  available: boolean
  running: boolean
  connected: boolean
  message: string
  executablePath: string | null
  lastEventAt: number | null
}

export type AutomationSettings = {
  confidenceThreshold: number
  manualOverrideMs: number
  minActionIntervalMs: number
  repeatActionCooldownMs: number
  strobeCooldownMs: number
  blockedNotes: number[]
  strobeNotes: number[]
  blockedControllers: number[]
  preferredDeck: number | null
}

export type AutomationSuggestion = {
  command: AutomationMidiCommand
  confidence: number
  reason: string
  createdAt: number
  executed: boolean
  blockedReason: string | null
}

export type AutomationSessionSummary = {
  id: string
  name: string
  startedAt: string
  endedAt: string | null
  durationMs: number
  audioFrameCount: number
  midiEventCount: number
  trainingExampleCount: number
}

export type AutomationStatus = {
  mode: AutomationMode
  recording: boolean
  activeSession: AutomationSessionSummary | null
  sessions: AutomationSessionSummary[]
  modelExampleCount: number
  audioConnected: boolean
  lastAudioAt: number | null
  devices: DjLinkDevice[]
  latestBeats: Record<number, DjLinkBeat>
  bridge: DjLinkBridgeStatus
  settings: AutomationSettings
  lastSuggestion: AutomationSuggestion | null
  manualOverrideUntil: number | null
}

export type AutomationTimelineEvent = {
  t: number
  at: string
  kind: "audio" | "midi" | "feedback" | "beat" | "position" | "example"
  source?: "manual" | "automatic" | "sunlite"
  frame?: AutomationAudioFrame
  command?: AutomationMidiCommand
  beat?: DjLinkBeat
  position?: DjLinkPosition
  features?: AudioFeatures
  beatWithinBar?: number
  bpm?: number
  example?: AutomationTrainingExample
}

export type AutomationTrainingExample = {
  id: string
  createdAt: number
  features: AudioFeatures
  beatWithinBar: number
  bpm: number
  command: AutomationMidiCommand
}

export type AutomationSocketCommand =
  | { type: "automation-audio-frame"; frame: AutomationAudioFrame }
  | { type: "automation-audio-disconnected" }

export type AutomationSocketEvent =
  | { event: "automation-status"; status: AutomationStatus }
  | { event: "automation-suggestion"; suggestion: AutomationSuggestion }
  | { event: "automation-dj-link"; payload: DjLinkEvent }
