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

console.log("Automation smoke test passed")
