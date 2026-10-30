import type { AutomationTrainingExample } from "../../shared/automation-types.js"
import { MIN_TRAINING_EXAMPLES } from "../../shared/automation-learning.js"
import { isMusicalContext } from "../../shared/musical-context.js"
import {
  learnSliderGestures,
  selectSupportedSliderGestures,
  sliderGestureValue,
  type LearnedSliderGesture,
} from "./slider-gestures.js"

export type SliderGestureValidation = {
  heldOutSessions: number
  testedGestures: number
  predictedGestures: number
  coverage: number
  meanValueError: number | null
  meanDurationErrorMs: number | null
}

/** The ideal reference has left/right limits at repeated hardware timestamps. */
function referenceValue(gesture: LearnedSliderGesture, time: number, leftLimit = false) {
  const points = gesture.points
  let left = 0,
    right = points.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (leftLimit ? points[middle].t < time : points[middle].t <= time) left = middle + 1
    else right = middle
  }
  if (right === points.length) return points.at(-1)!.value
  if (right === 0) return points[0].value
  if (leftLimit && points[right].t === time) return points[right].value
  const a = points[right - 1],
    b = points[right]
  return a.value + ((b.value - a.value) * (time - a.t)) / (b.t - a.t)
}

/** Compare the ideal reference with MIDI values emitted at the real polling interval. */
function curveError(
  expected: LearnedSliderGesture,
  actual: LearnedSliderGesture,
  interval: number,
) {
  const expectedDuration = expected.points.at(-1)!.t
  const actualDuration = Math.ceil(actual.points.at(-1)!.t / interval) * interval
  // Observe the last CC for at least one interval, including an endpoint-only jump.
  const duration = Math.max(expectedDuration, actualDuration) + interval
  const times = [
    ...new Set([
      0,
      duration,
      ...expected.points.map((point) => point.t),
      ...Array.from(
        { length: actualDuration / interval + 1 },
        (_, index) => index * interval,
      ),
    ]),
  ].sort((a, b) => a - b)
  let area = 0
  let previous = times[0]
  for (const time of times.slice(1)) {
    // Actual output holds its most recently emitted CC value between ticks.
    const emitted = sliderGestureValue(
      actual,
      Math.min(actualDuration, Math.floor(previous / interval) * interval),
    )
    const previousError = referenceValue(expected, previous) - emitted
    const error = referenceValue(expected, time, true) - emitted
    const width = time - previous
    // Piecewise-linear curves may cross inside an interval. Integrating the two
    // triangles avoids cancelling a positive error with a negative one.
    area +=
      previousError * error < 0
        ? (width * (previousError ** 2 + error ** 2)) /
          (2 * (Math.abs(previousError) + Math.abs(error)))
        : (width * (Math.abs(previousError) + Math.abs(error))) / 2
    previous = time
  }
  return {
    value: duration > 0 ? area / duration : 0,
    duration: Math.abs(expectedDuration - actualDuration),
  }
}

/** Bound validation work while keeping controllers and different parts of a session. */
function sampleGestures(
  gestures: LearnedSliderGesture[],
  examples: AutomationTrainingExample[],
) {
  const limit = 30
  if (gestures.length <= limit) return gestures
  const createdAt = new Map(
    examples.map((example) => [`${example.sessionId}:${example.id}`, example.createdAt]),
  )
  const byController = new Map<number, LearnedSliderGesture[]>()
  for (const gesture of gestures) {
    const group = byController.get(gesture.controller) ?? []
    group.push(gesture)
    byController.set(gesture.controller, group)
  }
  let groups = [...byController.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) =>
      group.sort((a, b) => (createdAt.get(a.id) ?? 0) - (createdAt.get(b.id) ?? 0)),
    )
  if (groups.length > limit)
    groups = Array.from(
      { length: limit },
      (_, index) => groups[Math.floor(((index + 0.5) * groups.length) / limit)],
    )
  const quotas = groups.map(() => 0)
  let remaining = limit
  while (remaining > 0) {
    for (let index = 0; index < groups.length && remaining > 0; index++) {
      if (quotas[index] >= groups[index].length) continue
      quotas[index]++
      remaining--
    }
  }
  return groups.flatMap((group, index) =>
    Array.from(
      { length: quotas[index] },
      (_, point) => group[Math.floor(((point + 0.5) * group.length) / quotas[index])],
    ),
  )
}

/** Select and replay whole curves with each reference recording excluded from training. */
export function validateSliderGestures(
  examples: AutomationTrainingExample[],
  options: {
    confidenceThreshold?: number
    maxHeldOutSessions?: number
    controllerIntervalMs?: number
  } = {},
): SliderGestureValidation | null {
  const confidenceThreshold = options.confidenceThreshold ?? 0.62
  const maxHeldOutSessions = options.maxHeldOutSessions ?? 5
  const requestedInterval = options.controllerIntervalMs ?? 100
  const interval =
    Number.isFinite(requestedInterval) && requestedInterval > 0 ? requestedInterval : 100
  const sessionExamples = new Map<string, AutomationTrainingExample[]>()
  for (const example of examples) {
    if (!example.sessionId || example.command.type !== "cc") continue
    const group = sessionExamples.get(example.sessionId) ?? []
    group.push(example)
    sessionExamples.set(example.sessionId, group)
  }
  if (sessionExamples.size < 2) return null
  const heldOut = [...sessionExamples.entries()]
    .sort(
      (a, b) =>
        Math.max(...a[1].map((e) => e.createdAt)) -
        Math.max(...b[1].map((e) => e.createdAt)),
    )
    .slice(-Math.max(1, maxHeldOutSessions))
  let testedGestures = 0
  let predictedGestures = 0
  let valueError = 0
  let durationError = 0
  for (const [sessionId, held] of heldOut) {
    const trainingExamples = examples.filter(
      (example) => example.sessionId && example.sessionId !== sessionId,
    )
    const temporalReady =
      trainingExamples.filter((example) => isMusicalContext(example.context)).length >=
      MIN_TRAINING_EXAMPLES
    const training = temporalReady ? learnSliderGestures(trainingExamples) : []
    for (const reference of sampleGestures(learnSliderGestures(held), held)) {
      testedGestures++
      const selected = selectSupportedSliderGestures(training, reference.context).find(
        (candidate) => candidate.gesture.controller === reference.controller,
      )
      if (!selected || selected.confidence < confidenceThreshold) continue
      predictedGestures++
      const error = curveError(reference, selected.gesture, interval)
      valueError += error.value
      durationError += error.duration
    }
  }
  return {
    heldOutSessions: heldOut.length,
    testedGestures,
    predictedGestures,
    coverage: testedGestures ? predictedGestures / testedGestures : 0,
    meanValueError: predictedGestures ? valueError / predictedGestures : null,
    meanDurationErrorMs: predictedGestures ? durationError / predictedGestures : null,
  }
}
