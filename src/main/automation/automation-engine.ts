import fs from "node:fs"
import path from "node:path"
import type {
  AutomationAudioFrame,
  AutomationMidiCommand,
  AutomationMode,
  AutomationSettings,
  AutomationStatus,
  AutomationSuggestion,
  AutomationTimelineEvent,
  AutomationTrainingExample,
  DjLinkBridgeStatus,
  DjLinkDevice,
  DjLinkEvent,
} from "../../shared/automation-types.js"
import { ExamplePolicyEngine } from "./policy-engine.js"
import { AutomationSessionStore } from "./session-store.js"

const DEFAULT_SETTINGS: AutomationSettings = {
  confidenceThreshold: 0.62,
  manualOverrideMs: 8000,
  minActionIntervalMs: 900,
  repeatActionCooldownMs: 4000,
  strobeCooldownMs: 5000,
  blockedNotes: [36, 37],
  strobeNotes: [42],
  blockedControllers: [],
  preferredDeck: null,
}

const EMPTY_BRIDGE_STATUS: DjLinkBridgeStatus = {
  available: false,
  running: false,
  connected: false,
  message: "PRO DJ LINK bridge is not started",
  executablePath: null,
  lastEventAt: null,
}

type Broadcast = (payload: unknown) => void
type MidiExecutor = (command: AutomationMidiCommand) => unknown

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, numeric))
}

function midiNumbers(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback
  return [...new Set(value.map((item) => Math.round(clamp(item, 0, 127, 0))))]
}

function loadSettings(filePath: string): AutomationSettings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(filePath, "utf8")))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function normalizeSettings(value: unknown): AutomationSettings {
  const source =
    value && typeof value === "object" ? (value as Partial<AutomationSettings>) : {}
  const preferredDeck = Number(source.preferredDeck)

  return {
    confidenceThreshold: clamp(
      source.confidenceThreshold,
      0.25,
      0.98,
      DEFAULT_SETTINGS.confidenceThreshold,
    ),
    manualOverrideMs: Math.round(
      clamp(source.manualOverrideMs, 1000, 60000, DEFAULT_SETTINGS.manualOverrideMs),
    ),
    minActionIntervalMs: Math.round(
      clamp(source.minActionIntervalMs, 250, 30000, DEFAULT_SETTINGS.minActionIntervalMs),
    ),
    repeatActionCooldownMs: Math.round(
      clamp(
        source.repeatActionCooldownMs,
        500,
        120000,
        DEFAULT_SETTINGS.repeatActionCooldownMs,
      ),
    ),
    strobeCooldownMs: Math.round(
      clamp(source.strobeCooldownMs, 1000, 120000, DEFAULT_SETTINGS.strobeCooldownMs),
    ),
    blockedNotes: midiNumbers(source.blockedNotes, DEFAULT_SETTINGS.blockedNotes),
    strobeNotes: midiNumbers(source.strobeNotes, DEFAULT_SETTINGS.strobeNotes),
    blockedControllers: midiNumbers(
      source.blockedControllers,
      DEFAULT_SETTINGS.blockedControllers,
    ),
    preferredDeck:
      Number.isInteger(preferredDeck) && preferredDeck >= 1 && preferredDeck <= 6
        ? preferredDeck
        : null,
  }
}

function commandKey(command: AutomationMidiCommand): string {
  if (
    command.type === "note" ||
    command.type === "noteon" ||
    command.type === "noteoff"
  ) {
    return `${command.type}:${command.note}`
  }
  if (command.type === "cc") return `cc:${command.controller}:${command.value}`
  return `program:${command.number}`
}

function commandLabel(command: AutomationMidiCommand): string {
  if (command.type === "note" || command.type === "noteon") return `nota ${command.note}`
  if (command.type === "cc") return `CC ${command.controller} = ${command.value}`
  if (command.type === "program") return `programa ${command.number}`
  return `fin de nota ${command.note}`
}

export class AutomationEngine {
  private readonly settingsPath: string
  private readonly store: AutomationSessionStore
  private readonly policy: ExamplePolicyEngine
  private readonly broadcast: Broadcast
  private readonly executeMidi: MidiExecutor

  private mode: AutomationMode = "manual"
  private settings: AutomationSettings
  private bridge: DjLinkBridgeStatus = { ...EMPTY_BRIDGE_STATUS }
  private devices = new Map<number, DjLinkDevice>()
  private latestBeats = new Map<number, Extract<DjLinkEvent, { type: "beat" }>["beat"]>()
  private currentFrame: AutomationAudioFrame | null = null
  private lastAudioAt: number | null = null
  private lastRecordedAudioAt = 0
  private sessionStartedAt = 0
  private manualOverrideUntil = 0
  private lastSuggestion: AutomationSuggestion | null = null
  private lastActionAt = 0
  private lastActionKey = ""
  private lastRepeatAt = 0
  private lastStrobeAt = 0
  private lastAudioTriggerAt = 0
  private statusBroadcastTimer: NodeJS.Timeout | null = null

  constructor(userDataPath: string, broadcast: Broadcast, executeMidi: MidiExecutor) {
    const root = path.join(userDataPath, "automation")
    fs.mkdirSync(root, { recursive: true })
    this.settingsPath = path.join(root, "settings.json")
    this.settings = loadSettings(this.settingsPath)
    this.store = new AutomationSessionStore(path.join(root, "sessions"))
    this.policy = new ExamplePolicyEngine(path.join(root, "model.json"))
    this.broadcast = broadcast
    this.executeMidi = executeMidi
  }

  getStatus(): AutomationStatus {
    const now = Date.now()
    const devices = [...this.devices.values()]
      .filter((device) => now - device.lastSeenAt < 10000)
      .sort((a, b) => a.deviceNumber - b.deviceNumber)

    return {
      mode: this.mode,
      recording: Boolean(this.store.getActive()),
      activeSession: this.store.getActive(),
      sessions: this.store.list(),
      modelExampleCount: this.policy.exampleCount,
      audioConnected: this.lastAudioAt !== null && now - this.lastAudioAt < 2500,
      lastAudioAt: this.lastAudioAt,
      devices,
      latestBeats: Object.fromEntries(this.latestBeats),
      bridge: { ...this.bridge, connected: devices.length > 0 },
      settings: { ...this.settings },
      lastSuggestion: this.lastSuggestion,
      manualOverrideUntil:
        this.manualOverrideUntil > now ? this.manualOverrideUntil : null,
    }
  }

  setMode(mode: unknown): AutomationStatus {
    if (mode !== "manual" && mode !== "assist" && mode !== "auto") {
      throw new Error("Invalid automation mode")
    }
    this.mode = mode
    if (mode === "manual") this.lastSuggestion = null
    this.queueStatusBroadcast()
    return this.getStatus()
  }

  updateSettings(value: unknown): AutomationStatus {
    this.settings = normalizeSettings(value)
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), "utf8")
    this.queueStatusBroadcast()
    return this.getStatus()
  }

  startSession(name: unknown): AutomationStatus {
    const session = this.store.start(name)
    this.sessionStartedAt = new Date(session.startedAt).getTime()
    this.queueStatusBroadcast()
    return this.getStatus()
  }

  stopSession(): AutomationStatus {
    this.store.stop()
    this.sessionStartedAt = 0
    this.train()
    this.queueStatusBroadcast()
    return this.getStatus()
  }

  train(): AutomationStatus {
    this.policy.train(this.store.readTrainingExamples())
    this.queueStatusBroadcast()
    return this.getStatus()
  }

  readTimeline(id: string): AutomationTimelineEvent[] {
    return this.store.readTimeline(id)
  }

  excludeTrainingExample(id: string): AutomationStatus {
    this.store.excludeTrainingExample(id)
    return this.train()
  }

  handleAudioFrame(frame: AutomationAudioFrame): void {
    const now = Date.now()
    const normalized: AutomationAudioFrame = {
      capturedAt: clamp(frame.capturedAt, now - 10000, now + 1000, now),
      sampleRate: clamp(frame.sampleRate, 8000, 192000, 48000),
      features: {
        rms: clamp(frame.features?.rms, 0, 1, 0),
        bass: clamp(frame.features?.bass, 0, 1, 0),
        mid: clamp(frame.features?.mid, 0, 1, 0),
        high: clamp(frame.features?.high, 0, 1, 0),
        flux: clamp(frame.features?.flux, 0, 1, 0),
        centroid: clamp(frame.features?.centroid, 0, 1, 0),
      },
      spectrum: Array.isArray(frame.spectrum)
        ? frame.spectrum.slice(0, 96).map((value) => clamp(value, 0, 1, 0))
        : [],
    }

    this.currentFrame = normalized
    this.lastAudioAt = now

    if (this.store.getActive() && now - this.lastRecordedAudioAt >= 180) {
      this.lastRecordedAudioAt = now
      this.appendTimeline({ kind: "audio", frame: normalized })
    }

    const hasRecentDeckBeat = [...this.latestBeats.values()].some(
      (beat) => now - beat.receivedAt < 2200,
    )
    if (
      !hasRecentDeckBeat &&
      normalized.features.rms > 0.025 &&
      normalized.features.flux > 0.055 &&
      now - this.lastAudioTriggerAt > Math.max(650, this.settings.minActionIntervalMs)
    ) {
      this.lastAudioTriggerAt = now
      this.maybePredict(0, 0, "audio")
    }

    this.queueStatusBroadcast()
  }

  handleAudioDisconnected(): void {
    this.lastAudioAt = null
    this.currentFrame = null
    this.queueStatusBroadcast()
  }

  handleDjLinkEvent(event: DjLinkEvent): void {
    const now = Date.now()
    this.bridge = {
      ...this.bridge,
      running: event.type !== "error",
      message:
        event.type === "ready" || event.type === "warning" || event.type === "error"
          ? event.message
          : this.bridge.message,
      lastEventAt: now,
    }

    if (event.type === "device") {
      this.devices.set(event.device.deviceNumber, { ...event.device, lastSeenAt: now })
    }

    if (event.type === "beat") {
      this.latestBeats.set(event.beat.deviceNumber, event.beat)
      const existing = this.devices.get(event.beat.deviceNumber)
      this.devices.set(event.beat.deviceNumber, {
        deviceNumber: event.beat.deviceNumber,
        name: event.beat.name || existing?.name || `Player ${event.beat.deviceNumber}`,
        address: event.beat.address,
        model: existing?.model,
        lastSeenAt: now,
      })
      if (this.store.getActive()) this.appendTimeline({ kind: "beat", beat: event.beat })
      this.maybePredict(
        event.beat.beatWithinBar,
        event.beat.bpm,
        "pro-dj-link",
        event.beat.deviceNumber,
      )
    }

    if (event.type === "position" && this.store.getActive()) {
      this.appendTimeline({ kind: "position", position: event.position })
    }

    this.broadcast({ event: "automation-dj-link", payload: event })
    this.queueStatusBroadcast()
  }

  setBridgeStatus(status: DjLinkBridgeStatus): void {
    this.bridge = { ...status }
    this.queueStatusBroadcast()
  }

  recordManualCommand(command: AutomationMidiCommand): void {
    const now = Date.now()
    this.manualOverrideUntil = now + this.settings.manualOverrideMs

    if (this.store.getActive()) {
      this.appendTimeline({ kind: "midi", command, source: "manual" })

      if (this.currentFrame && command.type !== "noteoff") {
        const latestBeat = this.getContextBeat()
        const example: AutomationTrainingExample = {
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: now,
          features: { ...this.currentFrame.features },
          beatWithinBar: latestBeat?.beatWithinBar ?? 0,
          bpm: latestBeat?.bpm ?? 0,
          command: { ...command },
        }
        this.appendTimeline({
          kind: "example",
          features: example.features,
          beatWithinBar: example.beatWithinBar,
          bpm: example.bpm,
          command: example.command,
          example,
        })
      }
    }

    this.queueStatusBroadcast()
  }

  recordFeedback(command: AutomationMidiCommand): void {
    if (!this.store.getActive()) return
    this.appendTimeline({ kind: "feedback", command, source: "sunlite" })
  }

  private getContextBeat() {
    const now = Date.now()
    const preferred = this.settings.preferredDeck
    if (preferred) {
      const beat = this.latestBeats.get(preferred)
      if (beat && now - beat.receivedAt < 4000) return beat
    }
    return [...this.latestBeats.values()]
      .filter((beat) => now - beat.receivedAt < 4000)
      .sort((a, b) => b.receivedAt - a.receivedAt)[0]
  }

  private maybePredict(
    beatWithinBar: number,
    bpm: number,
    trigger: "audio" | "pro-dj-link",
    deviceNumber?: number,
  ): void {
    if (this.mode === "manual" || !this.currentFrame) return
    if (trigger === "pro-dj-link" && beatWithinBar !== 1) return
    if (trigger === "pro-dj-link" && deviceNumber && deviceNumber > 6) return
    if (
      trigger === "pro-dj-link" &&
      this.settings.preferredDeck &&
      deviceNumber !== this.settings.preferredDeck
    ) {
      return
    }

    const prediction = this.policy.predict(this.currentFrame.features, beatWithinBar, bpm)
    if (!prediction) return

    const now = Date.now()
    let blockedReason = this.getSafetyBlock(prediction.command, now)
    if (prediction.confidence < this.settings.confidenceThreshold) {
      blockedReason = `confianza ${Math.round(prediction.confidence * 100)}% menor al umbral`
    }
    if (now < this.manualOverrideUntil) blockedReason = "control manual activo"
    if (this.mode === "assist")
      blockedReason = "modo asistido: requiere confirmación manual"

    let executed = false
    if (!blockedReason && this.mode === "auto") {
      try {
        this.executeMidi(prediction.command)
        executed = true
        const key = commandKey(prediction.command)
        this.lastActionAt = now
        this.lastRepeatAt = now
        this.lastActionKey = key
        if (
          (prediction.command.type === "note" || prediction.command.type === "noteon") &&
          this.settings.strobeNotes.includes(prediction.command.note)
        ) {
          this.lastStrobeAt = now
        }
        if (this.store.getActive()) {
          this.appendTimeline({
            kind: "midi",
            command: prediction.command,
            source: "automatic",
          })
        }
      } catch (error) {
        blockedReason = error instanceof Error ? error.message : "no se pudo enviar MIDI"
      }
    }

    const suggestion: AutomationSuggestion = {
      command: prediction.command,
      confidence: prediction.confidence,
      reason: `${commandLabel(prediction.command)} · ${prediction.neighborCount} ejemplos similares · ${trigger}`,
      createdAt: now,
      executed,
      blockedReason,
    }
    this.lastSuggestion = suggestion
    this.broadcast({ event: "automation-suggestion", suggestion })
    this.queueStatusBroadcast()
  }

  private getSafetyBlock(command: AutomationMidiCommand, now: number): string | null {
    if (now - this.lastActionAt < this.settings.minActionIntervalMs) {
      return "intervalo mínimo entre acciones"
    }

    const key = commandKey(command)
    if (
      key === this.lastActionKey &&
      now - this.lastRepeatAt < this.settings.repeatActionCooldownMs
    ) {
      return "acción repetida demasiado pronto"
    }

    if (command.type === "note" || command.type === "noteon") {
      if (this.settings.blockedNotes.includes(command.note)) return "nota protegida"
      if (
        this.settings.strobeNotes.includes(command.note) &&
        now - this.lastStrobeAt < this.settings.strobeCooldownMs
      ) {
        return "strobe en cooldown"
      }
    }

    if (
      command.type === "cc" &&
      this.settings.blockedControllers.includes(command.controller)
    ) {
      return "control continuo protegido"
    }

    return null
  }

  private appendTimeline(event: Omit<AutomationTimelineEvent, "t" | "at">): void {
    this.store.append({
      ...event,
      t: Math.max(0, Date.now() - this.sessionStartedAt),
      at: new Date().toISOString(),
    })
  }

  private queueStatusBroadcast(): void {
    if (this.statusBroadcastTimer) return
    this.statusBroadcastTimer = setTimeout(() => {
      this.statusBroadcastTimer = null
      this.broadcast({ event: "automation-status", status: this.getStatus() })
    }, 180)
  }
}
