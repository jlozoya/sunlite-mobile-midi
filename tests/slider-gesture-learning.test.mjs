import assert from "node:assert/strict"
import test from "node:test"
import {
  analyzeSliderGestures,
  learnSliderGestures,
  selectSliderGestures,
  sliderGestureValue,
} from "../dist/main/automation/slider-gestures.js"

const music = {
  version: 1,
  phase: "build",
  energy: 0.7,
  bassRatio: 0.4,
  midRatio: 0.3,
  highRatio: 0.3,
  brightness: 0.3,
  flux: 0.25,
  energyTrend: 0.3,
  brightnessTrend: 0.1,
  bassChange: 0,
  pulseDensity: 0.5,
  buildStrength: 0.6,
  dropStrength: 0,
  historyBeats: 0.5,
  phaseProgress: 0.1,
}
const silence = { ...music, phase: "silence", energy: 0 }

function example(t, value, context, overrides = {}) {
  return {
    id: `cc-${t}`,
    sessionId: "recording",
    createdAt: t,
    features: { rms: 0.4, bass: 0.4, mid: 0.3, high: 0.3, flux: 0.2, centroid: 0.3 },
    beatWithinBar: 1,
    bpm: 120,
    command: { type: "cc", controller: 55, value },
    context,
    ...overrides,
  }
}

test("a gesture beginning in silence matches music without losing its prefix, reversal or duration", () => {
  const points = [
    example(1000, 0, silence),
    example(1200, 50, silence),
    example(1400, 127, music),
    example(1600, 30, music),
    example(1800, 0, music),
  ]
  const learned = analyzeSliderGestures(points)
  assert.equal(learned.rejectedNoMusicalContext, 0)
  assert.equal(learned.gestures.length, 1)
  const gesture = learned.gestures[0]
  assert.deepEqual(gesture.context, music)
  assert.deepEqual(gesture.points, [
    { t: 0, value: 0 },
    { t: 200, value: 50 },
    { t: 400, value: 127 },
    { t: 600, value: 30 },
    { t: 800, value: 0 },
  ])
  assert.equal(selectSliderGestures(learned.gestures, music)[0].confidence, 1)
  assert.equal(sliderGestureValue(gesture, 400), 127)
  assert.equal(sliderGestureValue(gesture, 800), 0)
  assert.deepEqual(selectSliderGestures(learned.gestures, silence), [])
})

test("tracker warm-up without a context keeps the full curve when later points have useful context", () => {
  const gestures = learnSliderGestures([
    example(1000, 5, undefined),
    example(1200, 60, { phase: "build" }),
    example(1400, 127, music),
  ])
  assert.equal(gestures.length, 1)
  assert.deepEqual(gestures[0].context, music)
  assert.deepEqual(gestures[0].points, [
    { t: 0, value: 5 },
    { t: 200, value: 60 },
    { t: 400, value: 127 },
  ])
})

test("all-silence or context-free curves are explicitly rejected and cannot become low-confidence suggestions", () => {
  const learned = analyzeSliderGestures([
    example(0, 10, silence),
    example(200, 127, silence),
    example(1200, 20, undefined),
    example(1400, 80, undefined),
  ])
  assert.equal(learned.rejectedNoMusicalContext, 2)
  assert.deepEqual(learned.gestures, [])
  assert.deepEqual(selectSliderGestures(learned.gestures, music), [])
  assert.deepEqual(
    selectSliderGestures(
      [
        {
          id: "old-unusable",
          controller: 55,
          context: silence,
          points: [
            { t: 0, value: 0 },
            { t: 200, value: 127 },
          ],
        },
      ],
      music,
    ),
    [],
  )
})

test("a later usable gesture never supplies context across a pause, controller or recording boundary", () => {
  const learned = analyzeSliderGestures([
    example(0, 0, silence),
    example(200, 127, silence),
    example(1000, 10, music),
    example(1200, 100, music),
    example(0, 20, undefined, { sessionId: "other-recording" }),
    example(200, 80, undefined, { sessionId: "other-recording" }),
    example(0, 30, silence, { command: { type: "cc", controller: 56, value: 30 } }),
    example(200, 70, silence, { command: { type: "cc", controller: 56, value: 70 } }),
  ])
  assert.equal(learned.rejectedNoMusicalContext, 3)
  assert.equal(learned.gestures.length, 1)
  assert.equal(learned.gestures[0].controller, 55)
  assert.equal(learned.gestures[0].points.at(-1).t, 200)
})

test("interpolation uses the last hardware value at a repeated timestamp and keeps endpoints", () => {
  const gesture = {
    id: "dense",
    controller: 55,
    context: music,
    points: [
      { t: 0, value: 0 },
      { t: 100, value: 40 },
      { t: 100, value: 80 },
      { t: 200, value: 100 },
    ],
  }
  assert.equal(sliderGestureValue(gesture, -20), 0)
  assert.equal(sliderGestureValue(gesture, 50), 20)
  assert.equal(sliderGestureValue(gesture, 100), 80)
  assert.equal(sliderGestureValue(gesture, 150), 90)
  assert.equal(sliderGestureValue(gesture, 400), 100)
})
