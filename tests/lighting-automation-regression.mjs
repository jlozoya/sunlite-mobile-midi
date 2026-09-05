import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { AutomationEngine } from "../dist/main/automation/automation-engine.js"
import { ExamplePolicyEngine } from "../dist/main/automation/policy-engine.js"
import { isLightingSoftware, noteRelease } from "../dist/shared/lighting-software.js"

const root = fs.mkdtempSync(path.resolve("dist/automation-regression-"))
const originalNow = Date.now
let now = originalNow()
Date.now = () => now
const engines = []
const features = {
  rms: 0.4,
  bass: 0.75,
  mid: 0.48,
  high: 0.25,
  flux: 0.18,
  centroid: 0.34,
}
const frame = () => ({ capturedAt: now, sampleRate: 48000, spectrum: [], features })
const beat = (deviceNumber, beatWithinBar = 1) => ({
  type: "beat",
  beat: {
    deviceNumber,
    name: "Test deck",
    address: "127.0.0.1",
    bpm: 128,
    beatWithinBar,
    pitchPercent: 0,
    receivedAt: now,
  },
})
const deck = (deviceNumber, overrides = {}) => ({
  type: "waveform-position",
  position: {
    deviceNumber,
    positionMs: 1000,
    pitchPercent: 0,
    isPlaying: true,
    isOnAir: true,
    isMaster: true,
    features,
    receivedAt: now,
    ...overrides,
  },
})
const makeEngine = (name, execute = () => {}, software = "sunlite") => {
  const engine = new AutomationEngine(path.join(root, name), () => {}, execute, software)
  engines.push(engine)
  return engine
}
const examples = Array.from({ length: 6 }, (_, i) => ({
  id: `example-${i}`,
  createdAt: now + i,
  features,
  beatWithinBar: 1,
  bpm: 128,
  command: { type: "noteon", note: 50, velocity: 127 },
}))
try {
  assert.equal(isLightingSoftware("freestyler"), true)
  assert.equal(isLightingSoftware("unknown"), false)
  assert.deepEqual(noteRelease("freestyler", 127), { type: "noteon", velocity: 0 })
  assert.deepEqual(noteRelease("sunlite", 64), { type: "noteoff", velocity: 64 })

  const policyPath = path.join(root, "model.json")
  const policy = new ExamplePolicyEngine(policyPath)
  assert.equal(
    policy.train([
      ...examples,
      null,
      {},
      { ...examples[0], command: { type: "noteon", note: 50, velocity: 0 } },
      { ...examples[0], features: { ...features, rms: NaN } },
      { ...examples[0], command: { type: "cc", controller: 999, value: 1 } },
    ]),
    6,
  )
  assert.equal(policy.predict(features, 1, 128).confidence, 1)
  assert.equal(new ExamplePolicyEngine(policyPath).exampleCount, 6)
  // A single close example must not earn high confidence from four distant classes.
  policy.train(
    examples.slice(0, 5).map((example, i) => ({
      ...example,
      features:
        i === 0 ? features : { rms: 1, bass: 0, mid: 1, high: 1, flux: 1, centroid: 1 },
      command: { type: "noteon", note: 50 + i, velocity: 127 },
    })),
  )
  assert.ok(policy.predict(features, 1, 128).confidence < 0.62)
  fs.writeFileSync(
    policyPath,
    JSON.stringify({ version: 1, examples: [null, {}, ...examples] }),
  )
  assert.equal(new ExamplePolicyEngine(policyPath).exampleCount, 6)

  policy.train(
    examples.map((example, i) => ({
      ...example,
      features:
        i === 0 ? features : { rms: 1, bass: 0, mid: 1, high: 1, flux: 1, centroid: 1 },
    })),
  )
  assert.ok(
    policy.predict(features, 1, 128).confidence < 0.62,
    "distant same-class examples cannot inflate support",
  )

  const training = makeEngine("shared")
  training.startSession("Training")
  for (let i = 0; i < 6; i++) {
    now += 1000
    training.handleAudioFrame(frame())
    training.handleDjLinkEvent(beat(1))
    training.recordManualCommand(examples[i].command)
  }
  training.recordManualCommand({ type: "noteon", note: 50, velocity: 0 })
  now += 5000
  training.recordManualCommand({ type: "noteon", note: 60, velocity: 127 })
  assert.equal(
    training.stopSession().modelExampleCount,
    6,
    "stale audio and release events must not train",
  )
  const executed = []
  const engine = makeEngine("shared", (command) => executed.push(command))
  engine.updateSettings({ blockedNotes: [60], minActionIntervalMs: 900 })
  engine.updateSettings({ confidenceThreshold: 0.7 })
  assert.deepEqual(
    engine.getStatus().settings.blockedNotes,
    [60],
    "partial updates preserve protections",
  )
  engine.setMode("auto")
  engine.handleDjLinkEvent(deck(1))
  engine.handleDjLinkEvent(beat(1, 2))
  assert.equal(executed.length, 0, "quantize to first beat")
  engine.handleDjLinkEvent(beat(1))
  assert.equal(executed.length, 1)
  now += 1000
  engine.handleDjLinkEvent(beat(1))
  assert.equal(executed.length, 1, "repeat cooldown")
  now += 5000
  engine.handleDjLinkEvent(beat(1))
  assert.equal(executed.length, 1, "stale waveform cannot execute")
  engine.handleDjLinkEvent(deck(1, { isPlaying: false }))
  engine.handleDjLinkEvent(beat(1))
  assert.equal(executed.length, 1, "paused deck cannot execute")
  engine.handleDjLinkEvent(deck(1))
  engine.recordManualCommand({ type: "cc", controller: 1, value: 20 })
  engine.handleDjLinkEvent(beat(1))
  assert.equal(executed.length, 1, "manual override")
  now += 9000
  engine.updateSettings({ preferredDeck: 2 })
  engine.handleDjLinkEvent(deck(1))
  engine.handleDjLinkEvent(beat(2))
  assert.equal(executed.length, 1, "never borrow another deck's features")
  engine.handleDjLinkEvent(deck(2))
  engine.handleDjLinkEvent(beat(2))
  assert.equal(executed.length, 2)

  const audioExecutions = []
  const audioEngine = makeEngine("shared", (command) => audioExecutions.push(command))
  audioEngine.updateSettings({ preferredDeck: null })
  audioEngine.setMode("auto")
  audioEngine.handleDjLinkEvent(beat(1, 2))
  audioEngine.handleAudioFrame(frame())
  audioEngine.handleDjLinkEvent(beat(1))
  assert.equal(audioExecutions.length, 1, "live mixer audio works with beat-only CDJs")
  now += 5000
  audioEngine.handleDjLinkEvent(beat(1))
  assert.equal(audioExecutions.length, 1, "stale mixer audio cannot execute")

  const contextEngine = makeEngine("context")
  contextEngine.startSession("Two decks")
  contextEngine.handleDjLinkEvent(
    deck(1, { isOnAir: false, isMaster: false, features: { ...features, rms: 0.1 } }),
  )
  contextEngine.handleDjLinkEvent(beat(1, 2))
  contextEngine.handleDjLinkEvent(deck(2))
  contextEngine.handleDjLinkEvent(beat(2, 4))
  contextEngine.handleDjLinkEvent(beat(1, 3))
  contextEngine.recordManualCommand({ type: "noteon", note: 50 })
  const session = contextEngine.stopSession().sessions[0]
  const example = contextEngine
    .readTimeline(session.id)
    .find((event) => event.example).example
  assert.equal(example.beatWithinBar, 4)
  assert.equal(example.features.rms, features.rms)

  const alternatingPath = path.join(root, "alternating", "automation")
  fs.mkdirSync(alternatingPath, { recursive: true })
  const alternateFeatures = { rms: 1, bass: 0, mid: 1, high: 1, flux: 1, centroid: 1 }
  new ExamplePolicyEngine(path.join(alternatingPath, "model.json")).train([
    ...examples,
    ...examples.map((example) => ({
      ...example,
      id: example.id + "-other",
      features: alternateFeatures,
      command: { type: "noteon", note: 51, velocity: 127 },
    })),
  ])
  const alternatingCommands = []
  const alternating = makeEngine("alternating", (command) =>
    alternatingCommands.push(command),
  )
  alternating.setMode("auto")
  alternating.handleDjLinkEvent(deck(1))
  alternating.handleDjLinkEvent(beat(1))
  now += 1000
  alternating.handleDjLinkEvent(deck(1, { features: alternateFeatures }))
  alternating.handleDjLinkEvent(beat(1))
  now += 1000
  alternating.handleDjLinkEvent(deck(1))
  alternating.handleDjLinkEvent(beat(1))
  assert.deepEqual(
    alternatingCommands.map((command) => command.note),
    [50, 51],
    "A/B/A cannot bypass A's repeat cooldown",
  )
  assert.match(alternating.getStatus().lastSuggestion.blockedReason, /repetida/)
  now += 5000
  alternating.updateSettings({ blockedNotes: [50] })
  alternating.handleDjLinkEvent(deck(1))
  alternating.handleDjLinkEvent(beat(1))
  assert.equal(alternatingCommands.length, 2)
  assert.match(alternating.getStatus().lastSuggestion.blockedReason, /protegida/)

  const failing = makeEngine("alternating", () => {
    throw new Error("Disconnected MIDI")
  })
  failing.setMode("auto")
  failing.handleDjLinkEvent(deck(1, { features: alternateFeatures }))
  failing.handleDjLinkEvent(beat(1))
  assert.equal(failing.getStatus().lastSuggestion.executed, false)
  assert.equal(failing.getStatus().lastSuggestion.blockedReason, "Disconnected MIDI")

  const free = makeEngine("freestyler", () => {}, "freestyler")
  assert.equal(free.getStatus().modelExampleCount, 0, "profiles do not share models")
  free.startSession("Feedback")
  free.recordFeedback({ type: "noteon", note: 50, velocity: 127 })
  const freeSession = free.stopSession().sessions[0]
  assert.equal(free.readTimeline(freeSession.id)[0].source, "freestyler")
  assert.equal(
    free.getStatus().modelExampleCount,
    0,
    "LED feedback is not a demonstration",
  )
  console.log("Lighting and automation regression tests passed")
} finally {
  for (const engine of engines) engine.dispose()
  Date.now = originalNow
}
