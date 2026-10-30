import fs from "node:fs"
import type {
  AudioFeatures,
  AutomationMidiCommand,
  AutomationTrainingExample,
  AutomationIdleContext,
  AutomationModelInfo,
  MusicalContext,
  AutomationNoteGroup,
  AutomationSettings,
} from "../../shared/automation-types.js"
import { MIN_TRAINING_EXAMPLES } from "../../shared/automation-learning.js"
import { isMusicalContext } from "../../shared/musical-context.js"
import { predictTemporal, validateTemporalModel } from "./temporal-policy.js"
import { selectTrainingExamples } from "./training-selection.js"
import {
  learnSliderGestures,
  selectSupportedSliderGestures,
  getUnsupportedSliderControllers,
  analyzeSliderGestures,
} from "./slider-gestures.js"
import {
  groupNoteExamples,
  normalizeNoteGroups,
} from "../../shared/automation-action-groups.js"

type StoredModel = {
  version: 1 | 2
  trainedAt: string
  examples: AutomationTrainingExample[]
  idle?: AutomationIdleContext[]
  info?: AutomationModelInfo
}

export type PolicyPrediction = {
  command: AutomationMidiCommand
  confidence: number
  neighborCount: number
  distance: number
  beatWithinBar?: number
  temporal?: boolean
}

function isMidiValue(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127
  )
}

function isValidExample(value: unknown): value is AutomationTrainingExample {
  if (!value || typeof value !== "object") return false
  const example = value as AutomationTrainingExample
  const features = example.features
  if (
    !features ||
    ![
      features.rms,
      features.bass,
      features.mid,
      features.high,
      features.flux,
      features.centroid,
    ].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  )
    return false
  if (
    !Number.isFinite(example.createdAt) ||
    typeof example.id !== "string" ||
    !Number.isInteger(example.beatWithinBar) ||
    example.beatWithinBar < 0 ||
    example.beatWithinBar > 4 ||
    !Number.isFinite(example.bpm) ||
    example.bpm < 0 ||
    example.bpm > 400
  )
    return false
  const command = example.command
  if (!command || typeof command !== "object") return false
  if (command.type === "cc")
    return isMidiValue(command.controller) && isMidiValue(command.value)
  if (command.type === "program") return isMidiValue(command.number)
  if (command.type === "note" || command.type === "noteon") {
    return (
      isMidiValue(command.note) &&
      (command.velocity === undefined ||
        (isMidiValue(command.velocity) && command.velocity > 0)) &&
      (command.type !== "note" ||
        command.offDelayMs === undefined ||
        (Number.isFinite(command.offDelayMs) &&
          command.offDelayMs >= 0 &&
          command.offDelayMs <= 5000))
    )
  }
  return false
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function featureVector(
  features: AudioFeatures,
  beatWithinBar: number,
  bpm: number,
): number[] {
  return [
    clamp01(features.rms),
    clamp01(features.bass),
    clamp01(features.mid),
    clamp01(features.high),
    clamp01(features.flux),
    clamp01(features.centroid),
    clamp01((bpm - 60) / 160),
    beatWithinBar === 1 ? 1 : 0,
    beatWithinBar === 2 ? 1 : 0,
    beatWithinBar === 3 ? 1 : 0,
    beatWithinBar === 4 ? 1 : 0,
  ]
}

function distance(a: number[], b: number[]): number {
  let sum = 0
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const delta = a[index] - b[index]
    sum += delta * delta
  }
  return Math.sqrt(sum / Math.max(1, length))
}

function commandKey(command: AutomationMidiCommand): string {
  if (command.type === "note" || command.type === "noteon") {
    return `note:${command.note}`
  }
  if (command.type === "cc") {
    return `cc:${command.controller}:${Math.round(command.value / 16)}`
  }
  if (command.type === "program") return `program:${command.number}`
  return `ignored:${command.type}`
}

function normalizeAutomaticCommand(
  command: AutomationMidiCommand,
): AutomationMidiCommand | null {
  if (command.type === "noteoff") return null
  if (command.type === "noteon") {
    return {
      type: "note",
      note: command.note,
      velocity: command.velocity ?? 127,
      offDelayMs: 250,
    }
  }
  return { ...command }
}

export class ExamplePolicyEngine {
  private readonly modelPath: string
  private examples: AutomationTrainingExample[] = []
  private sliderGestures = learnSliderGestures([])
  private noteGroups: AutomationNoteGroup[]
  private confidenceThreshold: number
  private controllerIntervalMs: number
  private idle: AutomationIdleContext[] = []
  private info: AutomationModelInfo = {
    temporalExampleCount: 0,
    sessionCount: 0,
    validation: null,
  }

  constructor(
    modelPath: string,
    settings?: Pick<
      AutomationSettings,
      "noteGroups" | "confidenceThreshold" | "minControllerIntervalMs"
    >,
  ) {
    this.modelPath = modelPath
    this.noteGroups = normalizeNoteGroups(settings?.noteGroups)
    this.confidenceThreshold = settings?.confidenceThreshold ?? 0.62
    this.controllerIntervalMs = settings?.minControllerIntervalMs ?? 100
    this.load()
  }

  setDecisionSettings(settings: AutomationSettings) {
    const groups = normalizeNoteGroups(settings.noteGroups)
    if (
      JSON.stringify(groups) === JSON.stringify(this.noteGroups) &&
      settings.confidenceThreshold === this.confidenceThreshold &&
      (settings.minControllerIntervalMs ?? 100) === this.controllerIntervalMs
    )
      return
    this.noteGroups = groups
    this.confidenceThreshold = settings.confidenceThreshold
    this.controllerIntervalMs = settings.minControllerIntervalMs ?? 100
    this.info.validation = this.validate(this.examples, this.idle)
  }

  private validate(examples: AutomationTrainingExample[], idle: AutomationIdleContext[]) {
    return validateTemporalModel(
      examples,
      idle,
      this.noteGroups,
      this.confidenceThreshold,
      this.controllerIntervalMs,
    )
  }

  get exampleCount(): number {
    return this.examples.length
  }

  get modelInfo() {
    return this.info
  }
  get temporalReady() {
    return this.info.temporalExampleCount >= MIN_TRAINING_EXAMPLES
  }

  train(
    examples: AutomationTrainingExample[],
    idle: AutomationIdleContext[] = [],
  ): number {
    const validExamples = selectTrainingExamples(examples.filter(isValidExample))
    const validIdle = idle
      .filter(
        (item) => isMusicalContext(item.context) && typeof item.sessionId === "string",
      )
      .slice(-2000)
    const learned = analyzeSliderGestures(validExamples)
    const info: AutomationModelInfo = {
      temporalExampleCount: validExamples.filter((example) =>
        isMusicalContext(example.context),
      ).length,
      sessionCount: new Set(
        validExamples
          .filter((example) => example.sessionId)
          .map((example) => example.sessionId),
      ).size,
      validation: this.validate(validExamples, validIdle),
      sliderGestureCount: learned.gestures.length,
      rejectedSliderGestureCount: learned.rejectedNoMusicalContext,
      controllersAwaitingSupport: this.waitingControllers(
        validExamples,
        learned.gestures,
      ),
    }

    const model: StoredModel = {
      version: 2,
      trainedAt: new Date().toISOString(),
      examples: validExamples,
      idle: validIdle,
      info,
    }
    const temporaryPath = this.modelPath + ".tmp"
    fs.writeFileSync(temporaryPath, JSON.stringify(model), "utf8")
    fs.renameSync(temporaryPath, this.modelPath)
    this.examples = validExamples
    this.idle = validIdle
    this.info = info
    this.cacheGestures()
    return this.examples.length
  }

  predict(
    features: AudioFeatures,
    beatWithinBar: number,
    bpm: number,
    context?: MusicalContext | null,
  ): PolicyPrediction | null {
    return this.predictExamples(this.examples, features, beatWithinBar, bpm, context)
  }

  predictActions(
    features: AudioFeatures,
    beat: number,
    bpm: number,
    context?: MusicalContext | null,
  ) {
    if (this.examples.length < MIN_TRAINING_EXAMPLES) return []
    const groups = groupNoteExamples(this.examples, this.noteGroups)
    // Keep scalar CC playback for older feature-only recordings, which have no
    // temporal context from which a complete curve could be selected.
    if (!this.temporalReady) {
      for (const example of this.examples) {
        if (example.command.type !== "cc") continue
        const key = `cc:${example.command.controller}`
        const group = groups.get(key) ?? []
        group.push(example)
        groups.set(key, group)
      }
    }
    return [...groups.values()].flatMap((examples) => {
      const prediction = this.predictExamples(examples, features, beat, bpm, context)
      return prediction ? [prediction] : []
    })
  }

  private predictExamples(
    examples: AutomationTrainingExample[],
    features: AudioFeatures,
    beatWithinBar: number,
    bpm: number,
    context?: MusicalContext | null,
  ): PolicyPrediction | null {
    if (this.examples.length < MIN_TRAINING_EXAMPLES) return null
    if (this.temporalReady)
      return context
        ? predictTemporal(examples, context, beatWithinBar, bpm, this.idle)
        : null

    const target = featureVector(features, beatWithinBar, bpm)
    const neighbors = examples
      .map((example) => ({
        example,
        distance: distance(
          target,
          featureVector(example.features, example.beatWithinBar, example.bpm),
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.min(9, examples.length))

    const votes = new Map<
      string,
      {
        score: number
        command: AutomationMidiCommand
        distances: number[]
        count: number
      }
    >()
    let totalScore = 0

    for (const neighbor of neighbors) {
      const command = normalizeAutomaticCommand(neighbor.example.command)
      if (!command) continue
      const score = 1 / Math.max(0.04, neighbor.distance)
      const key = commandKey(command)
      const current = votes.get(key)

      votes.set(key, {
        score: (current?.score ?? 0) + score,
        command: current?.command ?? command,
        distances: [...(current?.distances ?? []), neighbor.distance],
        count: (current?.count ?? 0) + 1,
      })
      totalScore += score
    }

    const winner = [...votes.values()].sort((a, b) => b.score - a.score)[0]
    if (!winner || totalScore <= 0) return null

    const agreement = winner.score / totalScore
    const supportingDistances = winner.distances.slice(0, 3)
    const supportDistance =
      supportingDistances.reduce((sum, value) => sum + value, 0) /
      supportingDistances.length
    const similarity = clamp01(1 - supportDistance / 0.7)
    const coverage = clamp01(winner.count / 3)
    const support = agreement * coverage

    return {
      command: winner.command,
      // Agreement cannot make an unfamiliar context safe by itself. Requiring
      // similarity keeps unanimous but out-of-distribution neighbors below the
      // automatic execution threshold.
      confidence: clamp01(support * similarity),
      neighborCount: winner.count,
      distance: supportDistance,
    }
  }

  predictControllers(context: MusicalContext | null, bpm: number): PolicyPrediction[] {
    if (!this.temporalReady || !context) return []
    // A rejected all-silence gesture must not reappear through the scalar fallback.
    const candidates = this.examples.filter(
      (example) =>
        isMusicalContext(example.context) && example.context.phase !== "silence",
    )
    const controllers = new Set(
      candidates
        .filter((example) => example.command.type === "cc")
        .map((example) =>
          example.command.type === "cc" ? example.command.controller : -1,
        ),
    )
    return [...controllers].flatMap((controller) => {
      const sessions = new Set(
        candidates
          .filter(
            (example) =>
              example.command.type === "cc" &&
              example.command.controller === controller &&
              example.sessionId,
          )
          .map((example) => example.sessionId),
      )
      if (sessions.size < 2) return []
      const prediction = predictTemporal(candidates, context, 0, bpm, [], controller)
      return prediction ? [prediction] : []
    })
  }

  predictSliderGestures(context: MusicalContext | null) {
    return this.temporalReady && context
      ? selectSupportedSliderGestures(this.sliderGestures, context)
      : []
  }

  hasSliderGesture(controller: number) {
    return this.sliderGestures.some((gesture) => gesture.controller === controller)
  }

  private cacheGestures(): void {
    this.sliderGestures = learnSliderGestures(this.examples)
  }

  private waitingControllers(
    examples: AutomationTrainingExample[],
    gestures = learnSliderGestures(examples),
  ) {
    const unsupported = new Set(getUnsupportedSliderControllers(gestures))
    const supported = new Set(
      gestures
        .map((gesture) => gesture.controller)
        .filter((controller) => !unsupported.has(controller)),
    )
    const controllers = new Set(
      examples.flatMap((example) =>
        example.command.type === "cc" ? [example.command.controller] : [],
      ),
    )
    return [...controllers].filter((controller) => !supported.has(controller))
  }

  private load(): void {
    try {
      const stored = JSON.parse(fs.readFileSync(this.modelPath, "utf8")) as StoredModel
      if (
        (stored.version === 1 || stored.version === 2) &&
        Array.isArray(stored.examples)
      ) {
        this.examples = stored.examples.filter(isValidExample).slice(-8000)
        this.cacheGestures()
        this.idle = (stored.idle ?? []).filter((item) => isMusicalContext(item.context))
        this.info = {
          temporalExampleCount: this.examples.filter((example) =>
            isMusicalContext(example.context),
          ).length,
          sessionCount: new Set(
            this.examples
              .filter((example) => example.sessionId)
              .map((example) => example.sessionId),
          ).size,
          validation: this.validate(this.examples, this.idle),
          sliderGestureCount: this.sliderGestures.length,
          rejectedSliderGestureCount: analyzeSliderGestures(this.examples)
            .rejectedNoMusicalContext,
          controllersAwaitingSupport: this.waitingControllers(
            this.examples,
            this.sliderGestures,
          ),
        }
      }
    } catch {
      this.examples = []
    }
  }
}
