import fs from "node:fs"
import type {
  AudioFeatures,
  AutomationMidiCommand,
  AutomationTrainingExample,
} from "../../shared/automation-types.js"

type StoredModel = {
  version: 1
  trainedAt: string
  examples: AutomationTrainingExample[]
}

export type PolicyPrediction = {
  command: AutomationMidiCommand
  confidence: number
  neighborCount: number
  distance: number
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
  private vectors: number[][] = []

  constructor(modelPath: string) {
    this.modelPath = modelPath
    this.load()
  }

  get exampleCount(): number {
    return this.examples.length
  }

  train(examples: AutomationTrainingExample[]): number {
    const validExamples = examples.filter(isValidExample).slice(-8000)

    const model: StoredModel = {
      version: 1,
      trainedAt: new Date().toISOString(),
      examples: validExamples,
    }
    const temporaryPath = this.modelPath + ".tmp"
    fs.writeFileSync(temporaryPath, JSON.stringify(model), "utf8")
    fs.renameSync(temporaryPath, this.modelPath)
    this.examples = validExamples
    this.cacheVectors()
    return this.examples.length
  }

  predict(
    features: AudioFeatures,
    beatWithinBar: number,
    bpm: number,
  ): PolicyPrediction | null {
    if (this.examples.length < 5) return null

    const target = featureVector(features, beatWithinBar, bpm)
    const neighbors = this.examples
      .map((example, index) => ({
        example,
        distance: distance(target, this.vectors[index]),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.min(9, this.examples.length))

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

  private cacheVectors(): void {
    this.vectors = this.examples.map((example) =>
      featureVector(example.features, example.beatWithinBar, example.bpm),
    )
  }

  private load(): void {
    try {
      const stored = JSON.parse(fs.readFileSync(this.modelPath, "utf8")) as StoredModel
      if (stored.version === 1 && Array.isArray(stored.examples)) {
        this.examples = stored.examples.filter(isValidExample).slice(-8000)
        this.cacheVectors()
      }
    } catch {
      this.examples = []
    }
  }
}
