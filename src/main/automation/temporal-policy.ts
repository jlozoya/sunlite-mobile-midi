import type {
  AutomationIdleContext,
  AutomationTrainingExample,
  MusicalContext,
  ModelValidation,
} from "../../shared/automation-types.js"
import { isMusicalContext } from "../../shared/musical-context.js"
import type { PolicyPrediction } from "./policy-engine.js"

const contextFields: Array<[keyof MusicalContext, number]> = [
  ["energy", 2],
  ["bassRatio", 1],
  ["midRatio", 0.5],
  ["highRatio", 1],
  ["flux", 0.5],
  ["energyTrend", 3],
  ["brightnessTrend", 1.5],
  ["bassChange", 2],
  ["pulseDensity", 1],
  ["buildStrength", 2],
  ["dropStrength", 2],
  ["phaseProgress", 2],
]

export function temporalDistance(a: MusicalContext, b: MusicalContext): number {
  let sum = 0,
    weights = 0
  for (const [field, weight] of contextFields) {
    sum += Math.pow(Number(a[field]) - Number(b[field]), 2) * weight
    weights += weight
  }
  return Math.sqrt(sum / weights) + (a.phase === b.phase ? 0 : 0.35)
}

function key(example: AutomationTrainingExample) {
  const command = example.command
  return command.type === "cc"
    ? `cc:${command.controller}`
    : command.type === "program"
      ? `program:${command.number}`
      : command.type === "noteoff"
        ? "release"
        : `note:${command.note}`
}

export function predictTemporal(
  examples: AutomationTrainingExample[],
  context: MusicalContext,
  beat: number,
  bpm: number,
  idle: AutomationIdleContext[] = [],
  controller: number | null = null,
): PolicyPrediction | null {
  if (context.phase === "silence") return null
  const candidates = examples.filter(
    (example) =>
      isMusicalContext(example.context) &&
      (controller === null
        ? example.command.type !== "cc"
        : example.command.type === "cc" && example.command.controller === controller),
  )
  if (candidates.length < 3) return null
  const ranked = candidates
    .map((example) => ({
      example,
      distance:
        temporalDistance(context, example.context!) +
        (controller === null &&
        beat > 0 &&
        example.beatWithinBar > 0 &&
        beat !== example.beatWithinBar
          ? 0.3
          : 0) +
        (bpm > 0 && example.bpm > 0
          ? Math.min(0.1, Math.abs(Math.log(bpm / example.bpm)) * 0.08)
          : 0),
    }))
    .sort((a, b) => a.distance - b.distance)
  const bySession = new Map<string, number>()
  const neighbors = ranked
    .filter((item) => {
      const session = item.example.sessionId ?? "legacy"
      const count = bySession.get(session) ?? 0
      bySession.set(session, count + 1)
      return count < 3
    })
    .slice(0, 9)
  if (!neighbors.length) return null
  if (
    controller === null &&
    idle.some(
      (item) => temporalDistance(context, item.context) + 0.03 < neighbors[0].distance,
    )
  )
    return null
  const groups = new Map<string, typeof neighbors>()
  for (const item of neighbors) {
    const group = key(item.example)
    groups.set(group, [...(groups.get(group) ?? []), item])
  }
  const score = (items: typeof neighbors) =>
    items.reduce((total, item) => total + 1 / Math.max(0.025, item.distance), 0)
  const winner = [...groups.values()].sort((a, b) => score(b) - score(a))[0]
  const supporting = winner.slice(0, 3)
  const averageDistance =
    supporting.reduce((total, item) => total + item.distance, 0) / supporting.length
  const agreement = score(winner) / score(neighbors)
  const confidence = Math.max(
    0,
    agreement * Math.min(1, winner.length / 3) * (1 - averageDistance / 0.65),
  )
  const exemplar = winner[0].example
  let command = { ...exemplar.command }
  if (command.type === "noteon")
    command = {
      type: "note",
      note: command.note,
      velocity: command.velocity ?? 127,
      offDelayMs: 250,
    }
  if (command.type === "cc") {
    const close = winner.filter((item) => item.distance <= winner[0].distance + 0.12)
    const totalWeight = score(close)
    command.value = Math.max(
      0,
      Math.min(
        127,
        Math.round(
          close.reduce((total, item) => {
            const value =
              item.example.command.type === "cc" ? item.example.command.value : 0
            return total + value / Math.max(0.025, item.distance)
          }, 0) / totalWeight,
        ),
      ),
    )
  }
  return {
    command,
    confidence,
    neighborCount: winner.length,
    distance: averageDistance,
    beatWithinBar: exemplar.beatWithinBar,
    temporal: true,
  }
}

/** Leave entire recording sessions out: adjacent frames from one song cannot leak into its test fold. */
export function validateTemporalModel(
  examples: AutomationTrainingExample[],
  idle: AutomationIdleContext[],
): ModelValidation | null {
  const temporal = examples.filter(
    (example) => isMusicalContext(example.context) && example.sessionId,
  )
  const sessions = [...new Set(temporal.map((example) => example.sessionId!))]
  if (sessions.length < 2) return null
  let tested = 0,
    predicted = 0,
    notes = 0,
    correct = 0,
    controllers = 0,
    controllerError = 0,
    idleTested = 0,
    idleFired = 0
  const heldOut = sessions.slice(-5)
  for (const sessionId of heldOut) {
    const training = temporal.filter((example) => example.sessionId !== sessionId)
    const held = temporal.filter((example) => example.sessionId === sessionId)
    const stride = Math.max(1, Math.ceil(held.length / 30))
    for (const example of held.filter((_, index) => index % stride === 0)) {
      tested++
      const controller = example.command.type === "cc" ? example.command.controller : null
      const prediction = predictTemporal(
        training,
        example.context!,
        example.beatWithinBar,
        example.bpm,
        idle.filter((item) => item.sessionId !== sessionId),
        controller,
      )
      if (example.command.type !== "cc") notes++
      if (!prediction || prediction.confidence < 0.62) continue
      predicted++
      if (example.command.type === "cc" && prediction.command.type === "cc") {
        controllers++
        controllerError += Math.abs(example.command.value - prediction.command.value)
      } else if (key(example) === key({ ...example, command: prediction.command }))
        correct++
    }
    const heldIdle = idle.filter((item) => item.sessionId === sessionId)
    const idleStride = Math.max(1, Math.ceil(heldIdle.length / 20))
    for (const item of heldIdle.filter((_, index) => index % idleStride === 0)) {
      idleTested++
      const prediction = predictTemporal(
        training,
        item.context,
        0,
        0,
        idle.filter((entry) => entry.sessionId !== sessionId),
      )
      if (prediction && prediction.confidence >= 0.62) idleFired++
    }
  }
  return {
    heldOutSessions: heldOut.length,
    testedExamples: tested,
    coverage: tested ? predicted / tested : 0,
    noteAccuracy: notes ? correct / notes : null,
    controllerMeanError: controllers ? controllerError / controllers : null,
    idleTested,
    idleFalsePositiveRate: idleTested ? idleFired / idleTested : null,
  }
}
