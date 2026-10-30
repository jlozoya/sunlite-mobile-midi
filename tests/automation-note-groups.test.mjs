import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  normalizeNoteGroups,
  actionGroupKey,
} from "../dist/shared/automation-action-groups.js"
import { normalizeSettings, loadSettings } from "../dist/main/automation/settings.js"
import { ExamplePolicyEngine } from "../dist/main/automation/policy-engine.js"
import { AutomationEngine } from "../dist/main/automation/automation-engine.js"
import { AutomationSafety } from "../dist/main/automation/automation-safety.js"

const context = {
  version: 1,
  phase: "build",
  energy: 0.6,
  bassRatio: 0.5,
  midRatio: 0.3,
  highRatio: 0.2,
  brightness: 0.2,
  flux: 0.1,
  energyTrend: 0.2,
  brightnessTrend: 0,
  bassChange: 0.1,
  pulseDensity: 0.5,
  buildStrength: 0.6,
  dropStrength: 0,
  historyBeats: 0.8,
  phaseProgress: 0.3,
}
const features = { rms: 0.5, bass: 0.6, mid: 0.4, high: 0.3, flux: 0.1, centroid: 0.3 }
const examples = [0, 1, 2].flatMap((session) =>
  [0, 1, 2].flatMap((repeat) =>
    [56, 24, 27].map((note) => ({
      id: `${session}-${repeat}-${note}`,
      sessionId: `session-${session}`,
      createdAt: session * 10000 + repeat * 1000,
      features,
      context,
      bpm: 120,
      beatWithinBar: 1,
      command: { type: "noteon", note, velocity: 127 },
    })),
  ),
)
function root(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sunlite-note-groups-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test("scene, laser and lighting colors retain independent confidence and validation across sessions", (t) => {
  const file = path.join(root(t), "model.json")
  const model = new ExamplePolicyEngine(file)
  model.train(examples)
  const predictions = model.predictActions(features, 1, 120, context)
  assert.deepEqual(
    predictions.map((p) => p.command.note),
    [56, 24, 27],
  )
  assert.ok(predictions.every((p) => p.confidence === 1))
  assert.equal(model.modelInfo.validation.noteAccuracy, 1)
  const saved = JSON.parse(fs.readFileSync(file, "utf8"))
  saved.info.validation.noteAccuracy = 0
  fs.writeFileSync(file, JSON.stringify(saved))
  const restored = new ExamplePolicyEngine(file)
  assert.equal(
    restored.modelInfo.validation.noteAccuracy,
    1,
    "old scalar validation is recalculated on load",
  )
  restored.setDecisionSettings({ ...normalizeSettings({}), noteGroups: [] })
  assert.equal(restored.predictActions(features, 1, 120, context).length, 1)
  assert.ok(restored.predictActions(features, 1, 120, context)[0].confidence < 0.62)
  assert.equal(restored.modelInfo.validation.noteAccuracy, 0)
  assert.deepEqual(
    model.predictActions(features, 1, 120, { ...context, phase: "silence" }),
    [],
  )
})

test("group intervals preserve protected notes, shared strobe cooldown and independent CC", () => {
  const settings = normalizeSettings({ blockedNotes: [36], strobeNotes: [7, 6] })
  const safety = new AutomationSafety()
  for (const note of [56, 24, 27]) {
    const command = { type: "note", note }
    assert.equal(safety.block(command, 10000, settings), null)
    safety.executed(command, 10000, settings)
  }
  assert.equal(
    safety.block({ type: "note", note: 57 }, 10100, settings),
    "intervalo mínimo entre acciones",
  )
  assert.equal(
    safety.block({ type: "note", note: 36 }, 12000, settings),
    "nota protegida",
  )
  assert.equal(
    safety.block({ type: "cc", controller: 56, value: 127 }, 10000, settings),
    null,
  )
  assert.notEqual(
    actionGroupKey({ type: "cc", controller: 56, value: 0 }),
    actionGroupKey({ type: "note", note: 56 }),
  )
  settings.noteGroups = [
    { id: "a", name: "A", notes: [7] },
    { id: "b", name: "B", notes: [6] },
  ]
  safety.executed({ type: "note", note: 7 }, 12000, settings)
  assert.equal(
    safety.block({ type: "note", note: 6 }, 13000, settings),
    "strobe en cooldown",
  )
})

test("group normalization supports old settings and one owner per MIDI note", (t) => {
  assert.equal(loadSettings(path.join(root(t), "missing.json")).noteGroups.length, 4)
  const groups = normalizeNoteGroups([
    { id: "first", name: "First", notes: [56, 56, -1, 128, 1.5, "24"] },
    { id: "second", name: "Second", notes: [56, 24] },
    { id: "first", name: "Duplicate", notes: [27] },
  ])
  assert.deepEqual(
    groups.map((g) => g.notes),
    [[56], [24]],
  )
  assert.equal(actionGroupKey({ type: "note", note: 100 }, groups), "notes:other")
  assert.deepEqual(normalizeNoteGroups([]), [])
})

test("legacy scalar CC remains usable while all-silence gestures stay rejected at any threshold", (t) => {
  const directory = root(t)
  const legacy = new ExamplePolicyEngine(path.join(directory, "legacy.json"))
  const cc = Array.from({ length: 6 }, (_, i) => ({
    ...examples[0],
    id: `cc-${i}`,
    createdAt: i * 100,
    command: { type: "cc", controller: 55, value: 100 },
    context: undefined,
  }))
  legacy.train(cc)
  assert.equal(legacy.predictActions(features, 1, 120)[0].command.type, "cc")
  const silent = new ExamplePolicyEngine(path.join(directory, "silent.json"))
  silent.train(cc.map((e) => ({ ...e, context: { ...context, phase: "silence" } })))
  assert.equal(silent.modelInfo.sliderGestureCount, 0)
  assert.equal(silent.modelInfo.rejectedSliderGestureCount, 1)
  assert.deepEqual(silent.predictSliderGestures(context), [])
  assert.deepEqual(silent.predictControllers(context, 120), [])
})

test("CDJ beat executes independent groups together and honors settings changed after startup", (t) => {
  const directory = root(t),
    data = path.join(directory, "automation")
  fs.mkdirSync(data)
  new ExamplePolicyEngine(path.join(data, "model.json")).train(examples)
  const commands = [],
    engine = new AutomationEngine(
      directory,
      () => {},
      (command) => commands.push(command),
    )
  t.after(() => engine.dispose())
  engine.inputContext.get = () => context
  engine.setMode("auto")
  engine.handleDjLinkEvent({
    type: "waveform-position",
    position: {
      deviceNumber: 1,
      positionMs: 10000,
      pitchPercent: 0,
      isPlaying: true,
      isOnAir: true,
      isMaster: true,
      features,
      receivedAt: Date.now(),
    },
  })
  const beat = {
    deviceNumber: 1,
    name: "CDJ",
    address: "127.0.0.1",
    bpm: 120,
    beatWithinBar: 1,
    pitchPercent: 0,
    receivedAt: Date.now(),
  }
  engine.handleDjLinkEvent({ type: "beat", beat })
  assert.deepEqual(
    commands.map((c) => c.note),
    [56, 24, 27],
  )
  engine.updateSettings({ noteGroups: [] })
  engine.handleDjLinkEvent({ type: "beat", beat })
  assert.equal(commands.length, 3)
})
