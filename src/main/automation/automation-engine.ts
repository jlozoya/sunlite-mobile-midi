import fs from "node:fs"
import path from "node:path"
import type {
  AudioFeatures,
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
  DjLinkWaveform,
} from "../../shared/automation-types.js"
import type { LightingSoftware } from "../../shared/lighting-software.js"
import { ExamplePolicyEngine, type PolicyPrediction } from "./policy-engine.js"
import { AutomationSessionStore } from "./session-store.js"
import type { TrainingExampleEdit } from "./session-store.js"
import { loadSettings, normalizeSettings } from "./settings.js"
import { normalizeAudioFrame } from "./audio-frame.js"
import { CONTEXT_RECORD_INTERVAL_MS } from "../../shared/automation-learning.js"
import { AutomationInputContext } from "./input-context.js"
import { AutomationSafety } from "./automation-safety.js"
import { activeDeck, contextBeat } from "./deck-context.js"

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
  private waveforms = new Map<number, DjLinkWaveform>()
  private deckFeatures = new Map<
    number,
    {
      features: AudioFeatures
      receivedAt: number
      isPlaying: boolean
      isOnAir: boolean
      isMaster: boolean
    }
  >()
  private currentFrame: AutomationAudioFrame | null = null
  private lastAudioAt: number | null = null
  private lastRecordedAudioAt = 0
  private sessionStartedAt = 0
  private manualOverrideUntil = 0
  private lastSuggestion: AutomationSuggestion | null = null
  private readonly inputContext = new AutomationInputContext()
  private readonly safety = new AutomationSafety()
  private lastControllerPredictionAt = 0
  private lastDeckRecordedAt = new Map<number, number>()
  private lastAudioTriggerAt = 0
  private statusBroadcastTimer: NodeJS.Timeout | null = null

  constructor(
    userDataPath: string,
    broadcast: Broadcast,
    executeMidi: MidiExecutor,
    private readonly software: LightingSoftware = "sunlite",
  ) {
    const root = path.join(userDataPath, "automation")
    fs.mkdirSync(root, { recursive: true })
    this.settingsPath = path.join(root, "settings.json")
    this.settings = loadSettings(this.settingsPath)
    this.store = new AutomationSessionStore(path.join(root, "sessions"))
    this.policy = new ExamplePolicyEngine(path.join(root, "model.json"))
    this.broadcast = broadcast
    this.executeMidi = executeMidi
  }

  dispose(): void {
    this.mode = "manual"
    if (this.statusBroadcastTimer) clearTimeout(this.statusBroadcastTimer)
    this.statusBroadcastTimer = null
  }

  getStatus(): AutomationStatus {
    const now = Date.now()
    const devices = [...this.devices.values()]
      .filter((device) => now - device.lastSeenAt < 10000)
      .sort((a, b) => a.deviceNumber - b.deviceNumber)
    const waveformConnected = [...this.deckFeatures.values()].some(
      (entry) => entry.isPlaying && now - entry.receivedAt < 2500,
    )

    return {
      mode: this.mode,
      recording: Boolean(this.store.getActive()),
      activeSession: this.store.getActive(),
      sessions: this.store.list(),
      modelExampleCount: this.policy.exampleCount,
      audioConnected: this.lastAudioAt !== null && now - this.lastAudioAt < 2500,
      waveformConnected,
      lastAudioAt: this.lastAudioAt,
      devices,
      latestBeats: Object.fromEntries(this.latestBeats),
      waveforms: Object.fromEntries(this.waveforms),
      bridge: { ...this.bridge, connected: devices.length > 0 },
      settings: { ...this.settings },
      lastSuggestion: this.lastSuggestion,
      manualOverrideUntil:
        this.manualOverrideUntil > now ? this.manualOverrideUntil : null,
      modelInfo: this.policy.modelInfo,
      musicalContext: this.inputContext.get(this.inputSource(), now),
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
    this.settings = normalizeSettings({
      ...this.settings,
      ...(value && typeof value === "object" ? value : {}),
    })
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
    const dataset = this.store.readTrainingDataset()
    this.policy.train(dataset.examples, dataset.idle)
    this.queueStatusBroadcast()
    return this.getStatus()
  }

  readTimeline(id: string): AutomationTimelineEvent[] {
    return this.store.readTimeline(id)
  }

  renameSession(id: string, name: unknown): AutomationStatus {
    this.store.rename(id, name)
    this.queueStatusBroadcast()
    return this.getStatus()
  }

  deleteSession(id: string): AutomationStatus {
    this.store.delete(id)
    return this.train()
  }

  updateTrainingExamples(
    sessionId: string,
    edits: TrainingExampleEdit[],
  ): { status: AutomationStatus; events: AutomationTimelineEvent[] } {
    const events = this.store.updateTrainingExamples(sessionId, edits)
    const status = this.train()
    return { status, events }
  }

  excludeTrainingExample(id: string): AutomationStatus {
    this.store.excludeTrainingExample(id)
    return this.train()
  }

  handleAudioFrame(frame: AutomationAudioFrame): void {
    const now = Date.now()
    const normalized = normalizeAudioFrame(frame, now)

    this.currentFrame = normalized
    this.lastAudioAt = now
    const contextBeat = this.getContextBeat()
    const musical = this.inputContext.audio(
      normalized.features,
      now,
      contextBeat?.bpm ?? 0,
    )

    if (
      this.store.getActive() &&
      now - this.lastRecordedAudioAt >= CONTEXT_RECORD_INTERVAL_MS
    ) {
      this.lastRecordedAudioAt = now
      this.appendTimeline({
        kind: "audio",
        frame: normalized,
        context: musical.context ?? undefined,
        inputSource: "audio",
      })
    }

    const hasRecentDeckBeat = Boolean(contextBeat && now - contextBeat.receivedAt < 2200)
    if (this.policy.temporalReady && !this.getActiveDeck())
      this.predictControllers(contextBeat?.bpm || this.inputContext.audioBpm)
    if (
      !hasRecentDeckBeat &&
      normalized.features.rms > (this.policy.temporalReady ? 0.01 : 0.025) &&
      (this.policy.temporalReady
        ? musical.rhythm.pulse || musical.context?.phase === "drop"
        : normalized.features.flux > 0.055) &&
      now - this.lastAudioTriggerAt > Math.max(100, this.settings.minActionIntervalMs)
    ) {
      this.lastAudioTriggerAt = now
      this.maybePredict(0, this.inputContext.audioBpm, "audio")
    }

    this.queueStatusBroadcast()
  }

  handleAudioDisconnected(): void {
    this.lastAudioAt = null
    this.currentFrame = null
    this.inputContext.clearAudio()
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

    if (event.type === "waveform") {
      if (
        this.waveforms.get(event.waveform.deviceNumber)?.trackId !==
        event.waveform.trackId
      )
        this.inputContext.clearDeck(event.waveform.deviceNumber)
      this.waveforms.set(event.waveform.deviceNumber, event.waveform)
    }

    if (event.type === "waveform-position") {
      this.deckFeatures.set(event.position.deviceNumber, {
        features: event.position.features,
        receivedAt: event.position.receivedAt,
        isPlaying: event.position.isPlaying,
        isOnAir: event.position.isOnAir,
        isMaster: event.position.isMaster,
      })
      const device = event.position.deviceNumber
      const bpm = this.latestBeats.get(device)?.bpm ?? 120
      const context = event.position.isPlaying
        ? this.inputContext.deck(
            device,
            event.position.features,
            now,
            bpm,
            event.position.positionMs,
          )
        : null
      if (!event.position.isPlaying) this.inputContext.clearDeck(device)
      if (this.getActiveDeck() === device) {
        if (
          this.store.getActive() &&
          now - (this.lastDeckRecordedAt.get(device) ?? 0) >= CONTEXT_RECORD_INTERVAL_MS
        ) {
          this.lastDeckRecordedAt.set(device, now)
          this.appendTimeline({
            kind: "context",
            features: event.position.features,
            context: context ?? undefined,
            inputSource: `deck:${device}`,
          })
        }
        this.predictControllers(bpm)
      }
      const waveform = this.waveforms.get(event.position.deviceNumber)
      if (waveform) {
        this.waveforms.set(event.position.deviceNumber, {
          ...waveform,
          positionMs: event.position.positionMs,
          pitchPercent: event.position.pitchPercent,
          isPlaying: event.position.isPlaying,
          isOnAir: event.position.isOnAir,
          isMaster: event.position.isMaster,
          updatedAt: event.position.receivedAt,
        })
      }
    }

    if (event.type === "waveform-unloaded") {
      this.waveforms.delete(event.deviceNumber)
      this.deckFeatures.delete(event.deviceNumber)
      this.inputContext.clearDeck(event.deviceNumber)
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
    this.safety.manual(command, now)

    if (this.store.getActive()) {
      this.appendTimeline({ kind: "midi", command, source: "manual" })

      if (
        command.type !== "noteoff" &&
        !(command.type === "noteon" && command.velocity === 0)
      ) {
        const latestBeat = this.getContextBeat()
        const features =
          this.getDeckFeatures(this.getActiveDeck()) ?? this.getAudioFeatures()
        if (!features) {
          this.queueStatusBroadcast()
          return
        }
        const example: AutomationTrainingExample = {
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: now,
          features: { ...features },
          beatWithinBar: latestBeat?.beatWithinBar ?? 0,
          bpm: latestBeat?.bpm ?? 0,
          command: { ...command },
          context: this.inputContext.get(this.inputSource(), now) ?? undefined,
        }
        this.appendTimeline({
          kind: "example",
          features: example.features,
          beatWithinBar: example.beatWithinBar,
          bpm: example.bpm,
          command: example.command,
          example,
          inputSource: this.inputSource(),
        })
      }
    }

    this.queueStatusBroadcast()
  }

  recordFeedback(command: AutomationMidiCommand): void {
    if (!this.store.getActive()) return
    this.appendTimeline({ kind: "feedback", command, source: this.software })
  }

  private getActiveDeck(): number | undefined {
    return activeDeck(this.deckFeatures, this.settings.preferredDeck, Date.now())
  }

  private getAudioFeatures(): AudioFeatures | null {
    return this.lastAudioAt !== null && Date.now() - this.lastAudioAt < 2500
      ? (this.currentFrame?.features ?? null)
      : null
  }

  private getContextBeat() {
    return contextBeat(
      this.deckFeatures,
      this.latestBeats,
      this.waveforms,
      this.settings.preferredDeck,
      Date.now(),
    )
  }

  private maybePredict(
    beatWithinBar: number,
    bpm: number,
    trigger: "audio" | "pro-dj-link",
    deviceNumber?: number,
  ): void {
    if (this.mode === "manual") return
    if (!this.policy.temporalReady && trigger === "pro-dj-link" && beatWithinBar !== 1)
      return
    if (trigger === "pro-dj-link" && deviceNumber && deviceNumber > 6) return
    if (
      trigger === "pro-dj-link" &&
      this.settings.preferredDeck &&
      deviceNumber !== this.settings.preferredDeck
    ) {
      return
    }

    if (trigger === "pro-dj-link" && this.getContextBeat()?.deviceNumber !== deviceNumber)
      return
    const features =
      trigger === "pro-dj-link"
        ? (this.getDeckFeatures(deviceNumber) ?? this.getAudioFeatures())
        : this.getAudioFeatures()
    if (!features) return

    const prediction = this.policy.predict(
      features,
      beatWithinBar,
      bpm,
      this.inputContext.get(this.inputSource(), Date.now()),
    )
    if (!prediction) return
    if (
      prediction.temporal &&
      trigger === "pro-dj-link" &&
      prediction.beatWithinBar &&
      beatWithinBar !== prediction.beatWithinBar
    )
      return
    this.applyPrediction(prediction, trigger)
  }

  private inputSource() {
    const deck = this.getActiveDeck()
    return deck === undefined ? "audio" : `deck:${deck}`
  }

  private predictControllers(bpm: number) {
    const now = Date.now()
    if (
      this.mode === "manual" ||
      now - this.lastControllerPredictionAt <
        (this.settings.minControllerIntervalMs ?? 100)
    )
      return
    this.lastControllerPredictionAt = now
    for (const prediction of this.policy.predictControllers(
      this.inputContext.get(this.inputSource(), now),
      bpm,
    )) {
      const command = this.safety.smooth(prediction.command, now)
      this.applyPrediction({ ...prediction, command }, "fader")
    }
  }

  private applyPrediction(prediction: PolicyPrediction, trigger: string) {
    const now = Date.now()
    let blockedReason = this.safety.block(prediction.command, now, this.settings)
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
        this.safety.executed(prediction.command, now, this.settings)
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
      reason: `${commandLabel(prediction.command)} · ${prediction.neighborCount} ejemplos ${prediction.temporal ? "de contexto musical" : "similares"} · ${trigger}`,
      createdAt: now,
      executed,
      blockedReason,
    }
    this.lastSuggestion = suggestion
    this.broadcast({ event: "automation-suggestion", suggestion })
    this.queueStatusBroadcast()
  }

  private getDeckFeatures(deviceNumber?: number): AudioFeatures | null {
    if (deviceNumber === undefined) return null
    const entry = this.deckFeatures.get(deviceNumber)
    return entry?.isPlaying && Date.now() - entry.receivedAt < 2500
      ? entry.features
      : null
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
