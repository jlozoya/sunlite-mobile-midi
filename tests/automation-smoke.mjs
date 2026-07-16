import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AutomationEngine } from "../dist/main/automation/automation-engine.js"
import {
  compactWaveform,
  waveformFeatures,
} from "../dist/main/automation/waveform-analysis.js"

const testRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../dist/automation-smoke-${process.pid}`,
)
fs.mkdirSync(testRoot, { recursive: true })

const broadcasts = []
const executed = []
const engine = new AutomationEngine(
  testRoot,
  (payload) => broadcasts.push(payload),
  (command) => executed.push(command),
)

engine.startSession("Smoke test")
for (let index = 0; index < 6; index += 1) {
  engine.handleAudioFrame({
    capturedAt: Date.now(),
    sampleRate: 48000,
    spectrum: Array.from({ length: 64 }, (_, band) => (band + index) / 80),
    features: {
      rms: 0.4,
      bass: 0.75,
      mid: 0.48,
      high: 0.25,
      flux: 0.18,
      centroid: 0.34,
    },
  })
  engine.handleDjLinkEvent({
    type: "beat",
    beat: {
      deviceNumber: 1,
      name: "CDJ-3000",
      address: "192.168.10.10",
      bpm: 128,
      beatWithinBar: 1,
      pitchPercent: 0,
      receivedAt: Date.now(),
    },
  })
  engine.recordManualCommand({ type: "noteon", note: 50, velocity: 127 })
}

const trained = engine.stopSession()
assert.equal(trained.modelExampleCount, 6)
assert.equal(trained.sessions.length, 1)

const inference = new AutomationEngine(
  testRoot,
  () => {},
  () => {},
)
inference.setMode("assist")
inference.handleAudioFrame({
  capturedAt: Date.now(),
  sampleRate: 48000,
  spectrum: Array.from({ length: 64 }, (_, band) => band / 80),
  features: {
    rms: 0.4,
    bass: 0.75,
    mid: 0.48,
    high: 0.25,
    flux: 0.18,
    centroid: 0.34,
  },
})
inference.handleDjLinkEvent({
  type: "beat",
  beat: {
    deviceNumber: 1,
    name: "CDJ-3000",
    address: "192.168.10.10",
    bpm: 128,
    beatWithinBar: 1,
    pitchPercent: 0,
    receivedAt: Date.now(),
  },
})

assert.equal(inference.getStatus().lastSuggestion?.command.type, "note")
assert.equal(inference.getStatus().lastSuggestion?.executed, false)
assert.match(inference.getStatus().lastSuggestion?.blockedReason ?? "", /asistido/)

const rawWaveform = Array.from({ length: 1800 }, (_, index) => ({
  height: 8 + (index % 24),
  color: [
    index % 3 === 0 ? 0.9 : 0.2,
    index % 3 === 1 ? 0.9 : 0.2,
    index % 3 === 2 ? 0.9 : 0.2,
  ],
}))
const preview = compactWaveform(rawWaveform, 120)
const deckAudioFeatures = waveformFeatures(rawWaveform, 5000)
assert.equal(preview.heights.length, 120)
assert.equal(preview.colors.length, 120)
assert.ok(deckAudioFeatures.rms > 0)
assert.ok(deckAudioFeatures.bass > 0)

const deckOnlyRoot = `${testRoot}-deck-only`
const deckOnly = new AutomationEngine(
  deckOnlyRoot,
  () => {},
  () => {},
)
deckOnly.handleDjLinkEvent({
  type: "waveform",
  waveform: {
    deviceNumber: 2,
    trackId: 99,
    title: "Network waveform test",
    durationSeconds: 120,
    ...preview,
    positionMs: 5000,
    isPlaying: true,
    isOnAir: true,
    isMaster: true,
    updatedAt: Date.now(),
  },
})
deckOnly.handleDjLinkEvent({
  type: "waveform-position",
  position: {
    deviceNumber: 2,
    positionMs: 5000,
    isPlaying: true,
    isOnAir: true,
    isMaster: true,
    features: deckAudioFeatures,
    receivedAt: Date.now(),
  },
})
assert.equal(deckOnly.getStatus().waveformConnected, true)
assert.equal(deckOnly.getStatus().audioConnected, false)

deckOnly.startSession("Deck waveform only")
for (let index = 0; index < 6; index += 1) {
  deckOnly.handleDjLinkEvent({
    type: "beat",
    beat: {
      deviceNumber: 2,
      name: "CDJ-3000",
      address: "192.168.10.20",
      bpm: 126,
      beatWithinBar: 1,
      pitchPercent: 0,
      receivedAt: Date.now(),
    },
  })
  deckOnly.recordManualCommand({ type: "noteon", note: 51, velocity: 127 })
}
assert.equal(deckOnly.stopSession().modelExampleCount, 6)

engine.startSession("Slider edit smoke")
engine.handleAudioFrame({
  capturedAt: Date.now(),
  sampleRate: 48000,
  spectrum: Array.from({ length: 64 }, (_, band) => band / 80),
  features: {
    rms: 0.35,
    bass: 0.62,
    mid: 0.44,
    high: 0.2,
    flux: 0.12,
    centroid: 0.3,
  },
})
for (const value of [12, 44, 78, 110]) {
  engine.recordManualCommand({ type: "cc", controller: 51, value })
}
const sliderSession = engine.stopSession().sessions[0]
const sliderExamples = engine
  .readTimeline(sliderSession.id)
  .filter((event) => event.kind === "example" && event.example)
const editedSlider = engine.updateTrainingExamples(sliderSession.id, [
  { id: sliderExamples[0].example.id, t: 0, value: 64 },
])
const editedPoint = editedSlider.events.find(
  (event) => event.example?.id === sliderExamples[0].example.id,
)
assert.equal(editedPoint.t, 0)
assert.equal(editedPoint.example.command.value, 64)
const resizedCurve = engine.updateTrainingExamples(sliderSession.id, [
  { id: sliderExamples[1].example.id, delete: true },
  {
    id: "created-slider-point",
    t: 0,
    value: 96,
    controller: 51,
    create: true,
  },
])
assert.equal(
  resizedCurve.events.some((event) => event.example?.id === sliderExamples[1].example.id),
  false,
)
assert.equal(
  resizedCurve.events.find((event) => event.example?.id === "created-slider-point")
    .example.command.value,
  96,
)
engine.deleteSession(sliderSession.id)

const originalSessionId = trained.sessions[0].id
const renamed = engine.renameSession(originalSessionId, "Renamed smoke session")
assert.equal(renamed.sessions[0].name, "Renamed smoke session")
const afterDelete = engine.deleteSession(originalSessionId)
assert.equal(afterDelete.sessions.length, 0)
assert.equal(afterDelete.modelExampleCount, 0)

console.log("Automation smoke test passed")
