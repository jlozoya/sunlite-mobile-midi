import assert from "node:assert/strict"
import test from "node:test"
import {
  learnSliderGestures,
  selectSliderGestures,
  selectSupportedSliderGestures,
  getUnsupportedSliderControllers,
} from "../dist/main/automation/slider-gestures.js"

const context = {
  version: 1,
  phase: "steady",
  energy: 0.6,
  bassRatio: 0.4,
  midRatio: 0.3,
  highRatio: 0.3,
  brightness: 0.3,
  flux: 0.2,
  energyTrend: 0,
  brightnessTrend: 0,
  bassChange: 0,
  pulseDensity: 0.5,
  buildStrength: 0,
  dropStrength: 0,
  historyBeats: 0.5,
  phaseProgress: 0.2,
}
function gesture(sessionId, controller = 55, values = [0, 60, 127], musical = context) {
  return learnSliderGestures(
    values.map((value, i) => ({
      id: `${sessionId}-${controller}-${i}`,
      sessionId,
      createdAt: i * 100,
      features: { rms: 0.4, bass: 0.4, mid: 0.3, high: 0.3, flux: 0.2, centroid: 0.3 },
      beatWithinBar: 1,
      bpm: 120,
      context: musical,
      command: { type: "cc", controller, value },
    })),
  )[0]
}

test("216 CC54 samples from one recording remain one source of evidence", () => {
  const learned = Array.from({ length: 8 }, (_, i) =>
    gesture(
      "only-recording",
      54,
      Array.from({ length: 27 }, (_, value) => value * 2),
    ),
  )
  assert.equal(
    learned.reduce((total, g) => total + g.points.length, 0),
    216,
  )
  assert.equal(selectSliderGestures(learned, context)[0].confidence, 1)
  assert.deepEqual(selectSupportedSliderGestures(learned, context), [])
  assert.deepEqual(getUnsupportedSliderControllers(learned), [54])
})

test("CC55 and CC56 retain automatic curves when repeated in separate recordings", () => {
  const learned = [
    gesture("a", 54),
    gesture("a", 55),
    gesture("b", 55),
    gesture("a", 56),
    gesture("b", 56),
  ]
  const selected = selectSupportedSliderGestures(learned, context)
  assert.deepEqual(
    selected.map((p) => p.gesture.controller),
    [55, 56],
  )
  assert.ok(selected.every((p) => p.confidence === 1))
  assert.deepEqual(getUnsupportedSliderControllers(learned), [54])
})

test("one-to-four-point jitter never provides support even across multiple recordings", () => {
  for (const excursion of [1, 2, 3, 4]) {
    const tiny = [
      gesture("a", 54, [8, 8 + excursion]),
      gesture("b", 54, [8, 8 + excursion]),
    ]
    assert.deepEqual(selectSupportedSliderGestures(tiny, context), [])
    assert.deepEqual(getUnsupportedSliderControllers(tiny), [54])
  }
  const minimum = [gesture("a", 54, [8, 13]), gesture("b", 54, [8, 13])]
  assert.equal(selectSupportedSliderGestures(minimum, context).length, 1)
})

test("a second recording in another phase or a distant context does not establish quorum", () => {
  const target = gesture("a")
  for (const otherContext of [
    { ...context, phase: "break" },
    { ...context, energy: 0, energyTrend: -1, brightnessTrend: -1, bassChange: -1 },
  ]) {
    const learned = [target, gesture("b", 55, [0, 60, 127], otherContext)]
    assert.deepEqual(selectSupportedSliderGestures(learned, context), [])
    assert.deepEqual(getUnsupportedSliderControllers(learned), [55])
  }
})

test("support never increases geometric confidence and duplicate gestures cannot inflate it", () => {
  const target = gesture("a")
  const supporter = gesture("b", 55, [0, 60, 127], { ...context, flux: 0.4 })
  const supported = selectSupportedSliderGestures([target, supporter], context)[0]
  assert.ok(supported.confidence > 0.9 && supported.confidence < 1)
  const duplicates = selectSupportedSliderGestures(
    [target, supporter, ...Array.from({ length: 100 }, () => target)],
    context,
  )[0]
  assert.equal(duplicates.confidence, supported.confidence)
  assert.deepEqual(
    selectSupportedSliderGestures([target, supporter], { ...context, phase: "silence" }),
    [],
  )
  assert.deepEqual(
    selectSupportedSliderGestures(
      [{ ...target, sessionId: undefined }, supporter],
      context,
    ),
    [],
  )
})
