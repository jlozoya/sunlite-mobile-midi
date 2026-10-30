import assert from "node:assert/strict"
import test from "node:test"
import { validateTemporalModel } from "../dist/main/automation/temporal-policy.js"
import { MIN_TRAINING_EXAMPLES } from "../dist/shared/automation-learning.js"

const context = {
  version: 1,
  phase: "steady",
  energy: 0.5,
  bassRatio: 0.5,
  midRatio: 0.3,
  highRatio: 0.2,
  brightness: 0.2,
  flux: 0.1,
  energyTrend: 0,
  brightnessTrend: 0,
  bassChange: 0,
  pulseDensity: 0.5,
  buildStrength: 0,
  dropStrength: 0,
  historyBeats: 0.5,
  phaseProgress: 0.5,
}

function recordings(examplesPerSession) {
  return ["song-a", "song-b"].flatMap((sessionId) =>
    Array.from({ length: examplesPerSession }, (_, index) => ({
      id: `${sessionId}-${index}`,
      sessionId,
      createdAt: index * 1000,
      context,
      features: { rms: 0.5, bass: 0.5, mid: 0.3, high: 0.2, flux: 0.1, centroid: 0.2 },
      beatWithinBar: 1,
      bpm: 120,
      command: { type: "note", note: 56, velocity: 127 },
    })),
  )
}

test("note validation cannot report coverage from a held-out training fold smaller than runtime minimum", () => {
  const validation = validateTemporalModel(
    recordings(MIN_TRAINING_EXAMPLES - 1),
    [],
    undefined,
    0.62,
  )
  assert.equal(validation.testedExamples, (MIN_TRAINING_EXAMPLES - 1) * 2)
  assert.equal(validation.coverage, 0)
  assert.equal(validation.noteAccuracy, 0)
})

test("note validation permits prediction when each held-out fold reaches the runtime minimum", () => {
  const validation = validateTemporalModel(
    recordings(MIN_TRAINING_EXAMPLES),
    [],
    undefined,
    0.62,
  )
  assert.equal(validation.testedExamples, MIN_TRAINING_EXAMPLES * 2)
  assert.equal(validation.coverage, 1)
  assert.equal(validation.noteAccuracy, 1)
})

test("undersized held-out models cannot produce idle false positives", () => {
  const idle = ["song-a", "song-b"].map((sessionId) => ({ sessionId, context }))
  const validation = validateTemporalModel(
    recordings(MIN_TRAINING_EXAMPLES - 1),
    idle,
    undefined,
    0.25,
  )
  assert.equal(validation.idleTested, 2)
  assert.equal(validation.idleFalsePositiveRate, 0)
  assert.equal(validation.coverage, 0)
})
