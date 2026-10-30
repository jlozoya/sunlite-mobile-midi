import assert from "node:assert/strict"
import test from "node:test"
import { SliderPlayback } from "../dist/main/automation/slider-playback.js"
import { selectSliderGestures } from "../dist/main/automation/slider-gestures.js"
import { normalizeSettings } from "../dist/main/automation/settings.js"

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
const curve = {
  id: "recording:curve",
  sessionId: "recording",
  controller: 54,
  context,
  points: [
    { t: 0, value: 0 },
    { t: 100, value: 127 },
    { t: 200, value: 0 },
  ],
}
const policy = {
  predictSliderGestures: (current) => selectSliderGestures([curve], current),
}
const settings = normalizeSettings({})

test("a MIDI transport failure retries after cooldown in the same context and latches after recovery", () => {
  const playback = new SliderPlayback()
  let attempts = 0,
    available = false
  const tick = (now) =>
    playback.tick(now, "deck:1", context, "auto", settings, 0, policy, () => {
      attempts++
      return available
    })
  tick(10000)
  assert.equal(attempts, 1)
  assert.equal(playback.size, 0)
  available = true
  tick(13999)
  assert.equal(attempts, 1)
  for (const now of [14000, 14100, 14200]) tick(now)
  assert.equal(attempts, 4)
  tick(30000)
  assert.equal(attempts, 4, "successful playback must not restart in a stable context")
})

function exercise() {
  const playback = new SliderPlayback(),
    emitted = []
  const tick = (
    now,
    current = context,
    source = "deck:1",
    mode = "auto",
    manualUntil = 0,
  ) =>
    playback.tick(
      now,
      source,
      current,
      mode,
      settings,
      manualUntil,
      policy,
      (prediction) => emitted.push({ now, value: prediction.command.value }),
    )
  return { playback, emitted, tick }
}

test("a stable musical context runs a curve once even after many cooldowns", () => {
  const { emitted, tick } = exercise()
  for (let t = 100000; t <= 160000; t += 100) tick(t)
  assert.deepEqual(
    emitted.map((event) => event.value),
    [0, 127, 0],
  )
})

test("leaving and returning to the trigger context rearms after the controller cooldown", () => {
  const { emitted, tick } = exercise()
  for (const t of [100000, 100100, 100200]) tick(t)
  tick(100300, { ...context, phase: "break" })
  tick(100400)
  assert.equal(emitted.length, 3, "rearming still respects the completed curve cooldown")
  for (const t of [104200, 104300, 104400]) tick(t)
  assert.deepEqual(
    emitted.map((event) => event.value),
    [0, 127, 0, 0, 127, 0],
  )
})

test("source changes and explicit resets rearm, while clearing a manual interruption does not", () => {
  const { playback, emitted, tick } = exercise()
  for (const t of [100000, 100100, 100200]) tick(t)
  playback.clear()
  tick(110000)
  assert.equal(emitted.length, 3)
  tick(110100, context, "deck:2")
  assert.equal(emitted.length, 4)
  playback.reset()
  tick(110200, context, "deck:2")
  assert.equal(emitted.length, 5)
})

test("silence and missing-context observations rearm without producing a new movement", () => {
  for (const absentContext of [null, { ...context, phase: "silence" }]) {
    const { playback, emitted, tick } = exercise()
    for (const t of [100000, 100100, 100200]) tick(t)
    playback.observeContext("deck:1", absentContext, settings.confidenceThreshold)
    assert.equal(emitted.length, 3)
    tick(105000)
    assert.equal(emitted.length, 4)
  }
})

test("manual mode, an active manual override and protected CC do not start a curve", () => {
  const { playback, emitted, tick } = exercise()
  tick(100000, context, "deck:1", "manual")
  tick(100100, context, "deck:1", "auto", 108000)
  assert.equal(emitted.length, 0)
  playback.tick(
    100200,
    "deck:1",
    context,
    "auto",
    { ...settings, blockedControllers: [54] },
    0,
    policy,
    (prediction) => emitted.push(prediction),
  )
  assert.equal(emitted.length, 0)
})
