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

export type MusicalPhase = "silence" | "steady" | "build" | "drop" | "break"
export type MusicalContext = {
  version: 1
  phase: MusicalPhase
  energy: number
  bassRatio: number
  midRatio: number
  highRatio: number
  brightness: number
  flux: number
  energyTrend: number
  brightnessTrend: number
  bassChange: number
  pulseDensity: number
  buildStrength: number
  dropStrength: number
  historyBeats: number
  phaseProgress: number
}

export type ModelValidation = {
  heldOutSessions: number
  testedExamples: number
  coverage: number
  noteAccuracy: number | null
  controllerMeanError: number | null
  idleTested: number
  idleFalsePositiveRate: number | null
  sliderGestures?: {
    heldOutSessions: number
    testedGestures: number
    predictedGestures: number
    coverage: number
    meanValueError: number | null
    meanDurationErrorMs: number | null
  } | null
}

export type AutomationModelInfo = {
  temporalExampleCount: number
  sessionCount: number
  validation: ModelValidation | null
  sliderGestureCount?: number
  supportedSequenceCount?: number
  rejectedSliderGestureCount?: number
  controllersAwaitingSupport?: number[]
}
export type AutomationIdleContext = { context: MusicalContext; sessionId: string }

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

export type DjLinkWaveform = {
  deviceNumber: number
  trackId: number
  title: string
  durationSeconds: number
  heights: number[]
  colors: Array<[number, number, number]>
  positionMs: number
  pitchPercent: number
  isPlaying: boolean
  isOnAir: boolean
  isMaster: boolean
  updatedAt: number
}

export type DjLinkWaveformPosition = {
  deviceNumber: number
  positionMs: number
  pitchPercent: number
  isPlaying: boolean
  isOnAir: boolean
  isMaster: boolean
  features: AudioFeatures
  receivedAt: number
}

export type DjLinkEvent =
  | { type: "ready"; message: string }
  | { type: "device"; device: DjLinkDevice }
  | { type: "beat"; beat: DjLinkBeat }
  | { type: "position"; position: DjLinkPosition }
  | { type: "waveform"; waveform: DjLinkWaveform }
  | { type: "waveform-position"; position: DjLinkWaveformPosition }
  | { type: "waveform-unloaded"; deviceNumber: number }
  | { type: "warning" | "error"; message: string }

export type DjLinkBridgeStatus = {
  available: boolean
  running: boolean
  connected: boolean
  message: string
  executablePath: string | null
  lastEventAt: number | null
}

export type AutomationNoteGroup = { id: string; name: string; notes: number[] }

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
  minControllerIntervalMs?: number
  noteGroups?: AutomationNoteGroup[]
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
  waveformConnected: boolean
  analysisInput?: {
    source: string
    features: AudioFeatures
    receivedAt: number
  } | null
  lastAudioAt: number | null
  devices: DjLinkDevice[]
  latestBeats: Record<number, DjLinkBeat>
  waveforms: Record<number, DjLinkWaveform>
  bridge: DjLinkBridgeStatus
  settings: AutomationSettings
  lastSuggestion: AutomationSuggestion | null
  manualOverrideUntil: number | null
  modelInfo?: AutomationModelInfo
  musicalContext?: MusicalContext | null
}

export type AutomationTimelineEvent = {
  t: number
  at: string
  kind: "audio" | "midi" | "feedback" | "beat" | "position" | "example" | "context"
  context?: MusicalContext
  inputSource?: string
  source?: "manual" | "automatic" | "sunlite" | "freestyler"
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
  inputSource?: string
  id: string
  createdAt: number
  features: AudioFeatures
  beatWithinBar: number
  bpm: number
  command: AutomationMidiCommand
  context?: MusicalContext
  sessionId?: string
}

export type AutomationSocketCommand =
  | { type: "automation-audio-frame"; frame: AutomationAudioFrame }
  | { type: "automation-audio-disconnected" }

export type AutomationSocketEvent =
  | { event: "automation-status"; status: AutomationStatus }
  | { event: "automation-suggestion"; suggestion: AutomationSuggestion }
  | { event: "automation-dj-link"; payload: DjLinkEvent }
