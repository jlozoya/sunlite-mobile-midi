import test from "node:test"
import assert from "node:assert/strict"
import { validateSliderGestures } from "../dist/main/automation/slider-validation.js"

const context = {
  version: 1,
  phase: "build",
  energy: 0.5,
  bassRatio: 0.5,
  midRatio: 0.3,
  highRatio: 0.2,
  brightness: 0.2,
  flux: 0.1,
  energyTrend: 0.3,
  brightnessTrend: 0.1,
  bassChange: 0.1,
  pulseDensity: 0.2,
  buildStrength: 0.6,
  dropStrength: 0,
  historyBeats: 0.5,
  phaseProgress: 0.3,
}
const features = { rms: 0.5, bass: 0.6, mid: 0.3, high: 0.2, flux: 0.1, centroid: 0.3 }

function movement(sessionId, start, times, values, options = {}) {
  return times.map((time, index) => ({
    id: `${sessionId}-${start}-${index}`,
    sessionId,
    createdAt: start + time,
    context: options.context ?? context,
    features,
    beatWithinBar: 1,
    bpm: 120,
    command: { type: "cc", controller: options.controller ?? 55, value: values[index] },
  }))
}

function curve(sessionId, start, duration, options = {}) {
  const points = duration / 100
  const times = Array.from({ length: points + 1 }, (_, index) => index * 100)
  return movement(
    sessionId,
    start,
    times,
    times.map((_, index) =>
      Math.round(options.reverse ? 127 * (1 - index / points) : (127 * index) / points),
    ),
    options,
  )
}

function notes(sessionId, count) {
  return Array.from({ length: count }, (_, index) => ({
    ...curve(sessionId, 0, 100)[0],
    id: `${sessionId}-note-${index}`,
    command: { type: "noteon", note: 56, velocity: 127 },
  }))
}

test("whole-curve validation needs independent supported sessions and measures MIDI sample-and-hold output", () => {
  const first = curve("first", 0, 1000)
  assert.equal(validateSliderGestures(first), null)
  const examples = [
    ...first,
    ...curve("second", 10000, 1000),
    ...curve("third", 20000, 1000),
  ]
  const result = validateSliderGestures(examples)
  assert.equal(result.heldOutSessions, 3)
  assert.equal(result.testedGestures, 3)
  assert.equal(result.predictedGestures, 3)
  assert.equal(result.coverage, 1)
  assert.ok(Math.abs(result.meanValueError - 6350 / 1100) < 0.0001)
  assert.equal(result.meanDurationErrorMs, 0)
  assert.ok(
    validateSliderGestures(examples, { controllerIntervalMs: 50 }).meanValueError <
      result.meanValueError,
  )
})

test("two dense sessions do not validate against a single remaining demonstration session", () => {
  const result = validateSliderGestures([
    ...curve("first", 0, 1000),
    ...curve("second", 10000, 1000),
  ])
  assert.equal(result.testedGestures, 2)
  assert.equal(result.predictedGestures, 0)
  assert.equal(result.coverage, 0)
  assert.equal(result.meanValueError, null)
})

test("slower supported curves keep their original clock and report duration and value error", () => {
  const result = validateSliderGestures(
    [
      ...curve("slow-a", 0, 2000),
      ...curve("slow-b", 10000, 2000),
      ...curve("reference-fast", 20000, 1000),
    ],
    { maxHeldOutSessions: 1 },
  )
  assert.equal(result.coverage, 1)
  assert.equal(result.meanDurationErrorMs, 1000)
  assert.ok(result.meanValueError > 30, `absolute-time error ${result.meanValueError}`)
})

test("opposite complete movements cannot cancel their value error", () => {
  const result = validateSliderGestures(
    [
      ...curve("down-a", 0, 1000, { reverse: true }),
      ...curve("down-b", 10000, 1000, { reverse: true }),
      ...curve("reference-up", 20000, 1000),
    ],
    { maxHeldOutSessions: 1 },
  )
  assert.equal(result.coverage, 1)
  assert.equal(result.meanDurationErrorMs, 0)
  assert.ok(result.meanValueError > 60)
})

test("a controller present in only its held-out session cannot validate against itself or another controller", () => {
  const result = validateSliderGestures(
    [
      ...curve("train-a", 0, 1000, { controller: 56 }),
      ...curve("train-b", 10000, 1000, { controller: 56 }),
      ...curve("reference", 20000, 1000),
    ],
    { maxHeldOutSessions: 1 },
  )
  assert.equal(result.testedGestures, 1)
  assert.equal(result.predictedGestures, 0)
  assert.equal(result.meanValueError, null)
  assert.equal(result.meanDurationErrorMs, null)
})

test("unfamiliar musical phases stay below the same confidence gate used for playback", () => {
  const examples = [
    ...curve("train-a", 0, 1000),
    ...curve("train-b", 10000, 1000),
    ...curve("reference", 20000, 1000, { context: { ...context, phase: "break" } }),
  ]
  assert.equal(validateSliderGestures(examples, { maxHeldOutSessions: 1 }).coverage, 0)
  assert.equal(
    validateSliderGestures(examples, { maxHeldOutSessions: 1, confidenceThreshold: 0.4 })
      .coverage,
    1,
  )
})

test("held-out session budget selects the latest recordings instead of depending on file enumeration", () => {
  const result = validateSliderGestures(
    [
      ...curve("newest", 20000, 1000, { controller: 56 }),
      ...curve("oldest", 0, 1000),
      ...curve("middle", 10000, 1000),
    ],
    { maxHeldOutSessions: 1 },
  )
  assert.equal(result.heldOutSessions, 1)
  assert.equal(result.testedGestures, 1)
  assert.equal(result.coverage, 0)
})

test("validation evaluates the full movement when its first musical context follows a silent prefix", () => {
  const examples = [
    ...curve("first", 0, 1000),
    ...curve("second", 10000, 1000),
    ...curve("third", 20000, 1000),
  ].map((example) => ({
    ...example,
    context:
      Number(example.id.split("-").at(-1)) < 3
        ? { ...context, phase: "silence", energy: 0 }
        : context,
  }))
  const result = validateSliderGestures(examples)
  assert.equal(result.testedGestures, 3)
  assert.equal(result.coverage, 1)
  assert.ok(Math.abs(result.meanValueError - 6350 / 1100) < 0.0001)
  assert.equal(result.meanDurationErrorMs, 0)
})

test("fold readiness counts notes as temporal evidence without replacing the minimum two curve sessions", () => {
  const examples = [
    ...curve("first", 0, 100),
    ...curve("second", 10000, 100),
    ...curve("third", 20000, 100),
  ]
  assert.equal(
    validateSliderGestures(examples).predictedGestures,
    0,
    "each fold has only four temporal examples",
  )
  const result = validateSliderGestures([
    ...examples,
    ...notes("first", 1),
    ...notes("second", 1),
    ...notes("third", 1),
  ])
  assert.equal(result.predictedGestures, 3)
})

test("a fast supported reversal between MIDI ticks is counted as a missed peak and delayed final tick", () => {
  const fast = (sessionId, start) => movement(sessionId, start, [0, 30, 60], [0, 127, 0])
  const result = validateSliderGestures([
    ...fast("first", 0),
    ...fast("second", 10000),
    ...fast("third", 20000),
  ])
  assert.equal(result.coverage, 1)
  assert.equal(result.meanDurationErrorMs, 40)
  assert.equal(result.meanValueError, 19.05)
})

test("per-session curve budget samples controllers and later movements rather than just the first controller", () => {
  const many = (session, bothControllers = true) =>
    Array.from({ length: 40 }, (_, index) =>
      curve(session, index * 1000, 200, {
        controller: bothControllers ? 55 + (index % 2) : 55,
      }),
    ).flat()
  const result = validateSliderGestures([
    ...many("first"),
    ...many("second", false),
    ...many("third", false),
  ])
  assert.equal(result.testedGestures, 90)
  assert.equal(
    result.predictedGestures,
    75,
    "15 sampled first-session curves lack controller56 in the other sessions",
  )
  assert.equal(result.coverage, 75 / 90)
})

test("hardware messages sharing a timestamp are jumps rather than a ramp over the preceding interval", () => {
  const result = validateSliderGestures(
    [
      ...movement("train-a", 0, [0, 500, 500, 1000], [5, 5, 5, 0]),
      ...movement("train-b", 10000, [0, 500, 500, 1000], [5, 5, 5, 0]),
      ...movement("reference", 20000, [0, 500, 500, 1000], [0, 0, 127, 127]),
    ],
    { maxHeldOutSessions: 1 },
  )
  assert.equal(result.coverage, 1)
  assert.ok(Math.abs(result.meanValueError - 77200 / 1100) < 0.0001)
})

test("the final CC has an observation interval so an endpoint-only error remains visible", () => {
  const times = [0, 500, 500, 500, 1000, 1000]
  const result = validateSliderGestures(
    [
      ...movement("train-a", 0, times, [0, 0, 5, 0, 0, 0]),
      ...movement("train-b", 10000, times, [0, 0, 5, 0, 0, 0]),
      ...movement("reference", 20000, times, [0, 0, 0, 0, 0, 127]),
    ],
    { maxHeldOutSessions: 1 },
  )
  assert.equal(result.coverage, 1)
  assert.equal(result.meanDurationErrorMs, 0)
  assert.ok(result.meanValueError > 11 && result.meanValueError < 12)
})

test("216 controller54 points in one session cannot borrow support from other controllers", () => {
  const times = Array.from({ length: 216 }, (_, index) => index * 4)
  const result = validateSliderGestures(
    [
      ...curve("other-a", 0, 1000),
      ...curve("other-b", 10000, 1000),
      ...curve("other-c", 20000, 1000),
      ...movement(
        "reference54",
        30000,
        times,
        times.map((_, index) => Math.round((127 * index) / 215)),
        { controller: 54 },
      ),
    ],
    { maxHeldOutSessions: 1 },
  )
  assert.equal(result.testedGestures, 1)
  assert.equal(result.predictedGestures, 0)
})

test("legacy isolated CC values are not reported as tested continuous curves", () => {
  const isolated = (session) =>
    curve(session, 0, 1000).map((example, index) => ({
      ...example,
      createdAt: index * 1000,
    }))
  const result = validateSliderGestures([
    ...isolated("first"),
    ...isolated("second"),
    ...isolated("third"),
  ])
  assert.equal(result.testedGestures, 0)
  assert.equal(result.meanValueError, null)
})
