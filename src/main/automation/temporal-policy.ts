import type {
  AutomationIdleContext,
  AutomationTrainingExample,
  MusicalContext,
  ModelValidation,
  AutomationNoteGroup,
} from "../../shared/automation-types.js"
import { isMusicalContext } from "../../shared/musical-context.js"
import type { PolicyPrediction } from "./policy-engine.js"
import {
  groupNoteExamples,
  actionGroupKey,
} from "../../shared/automation-action-groups.js"
import { validateSliderGestures } from "./slider-validation.js"
import { MIN_TRAINING_EXAMPLES } from "../../shared/automation-learning.js"

import { temporalDistance } from "./musical-distance.js"
export { temporalDistance } from "./musical-distance.js"

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

export function predictTemporalActions(
  examples: AutomationTrainingExample[],
  context: MusicalContext,
  beat: number,
  bpm: number,
  idle: AutomationIdleContext[] = [],
  noteGroups?: AutomationNoteGroup[],
): PolicyPrediction[] {
  return [...groupNoteExamples(examples, noteGroups).values()].flatMap((group) => {
    const prediction = predictTemporal(group, context, beat, bpm, idle)
    return prediction ? [prediction] : []
  })
}

/** Leave entire recording sessions out: adjacent frames from one song cannot leak into its test fold. */
export function validateTemporalModel(
  examples: AutomationTrainingExample[],
  idle: AutomationIdleContext[],
  noteGroups?: AutomationNoteGroup[],
  confidenceThreshold = 0.62,
  controllerIntervalMs = 100,
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
    idleTested = 0,
    idleFired = 0
  const heldOut = sessions.slice(-5)
  for (const sessionId of heldOut) {
    const training = temporal.filter((example) => example.sessionId !== sessionId)
    const foldReady = training.length >= MIN_TRAINING_EXAMPLES
    const held = temporal.filter((example) => example.sessionId === sessionId)
    const sampledNotes = [...groupNoteExamples(held, noteGroups).values()].flatMap(
      (group) => {
        const stride = Math.max(1, Math.ceil(group.length / 30))
        return group.filter((_, index) => index % stride === 0)
      },
    )
    for (const example of sampledNotes) {
      tested++
      const predictions = foldReady
        ? predictTemporalActions(
            training,
            example.context!,
            example.beatWithinBar,
            example.bpm,
            idle.filter((item) => item.sessionId !== sessionId),
            noteGroups,
          )
        : []
      const prediction = predictions.find(
        (prediction) =>
          actionGroupKey(prediction.command, noteGroups) ===
          actionGroupKey(example.command, noteGroups),
      )
      notes++
      if (!prediction || prediction.confidence < confidenceThreshold) continue
      predicted++
      if (key(example) === key({ ...example, command: prediction.command })) correct++
    }
    const heldIdle = idle.filter((item) => item.sessionId === sessionId)
    const idleStride = Math.max(1, Math.ceil(heldIdle.length / 20))
    for (const item of heldIdle.filter((_, index) => index % idleStride === 0)) {
      idleTested++
      const predictions = foldReady
        ? predictTemporalActions(
            training,
            item.context,
            0,
            0,
            idle.filter((entry) => entry.sessionId !== sessionId),
            noteGroups,
          )
        : []
      if (predictions.some((prediction) => prediction.confidence >= confidenceThreshold))
        idleFired++
    }
  }
  const curves = validateSliderGestures(examples, {
    confidenceThreshold,
    controllerIntervalMs,
  })
  return {
    heldOutSessions: heldOut.length,
    testedExamples: tested,
    coverage: tested ? predicted / tested : 0,
    noteAccuracy: notes ? correct / notes : null,
    controllerMeanError: curves?.meanValueError ?? null,
    idleTested,
    idleFalsePositiveRate: idleTested ? idleFired / idleTested : null,
    sliderGestures: curves,
  }
}
