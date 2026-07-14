import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AutomationEngine } from "../dist/main/automation/automation-engine.js"

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

console.log("Automation smoke test passed")
