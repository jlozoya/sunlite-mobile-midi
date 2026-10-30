import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  learnActionSequences,
  supportedActionSequences,
} from "../dist/main/automation/action-sequences.js"
import { SequencePlayback } from "../dist/main/automation/sequence-playback.js"
import { ExamplePolicyEngine } from "../dist/main/automation/policy-engine.js"
import { AutomationEngine } from "../dist/main/automation/automation-engine.js"
import { AutomationSafety } from "../dist/main/automation/automation-safety.js"
import { normalizeSettings } from "../dist/main/automation/settings.js"

const context = {
  version: 1,
  phase: "build",
  energy: 0.6,
  bassRatio: 0.4,
  midRatio: 0.3,
  highRatio: 0.3,
  brightness: 0.3,
  flux: 0.2,
  energyTrend: 0.4,
  brightnessTrend: 0.2,
  bassChange: 0,
  pulseDensity: 0.5,
  buildStrength: 0.5,
  dropStrength: 0,
  historyBeats: 0.8,
  phaseProgress: 0.2,
}
const settings = normalizeSettings({})
function demonstration(session, start = 10000) {
  return [
    [0, { type: "noteon", note: 24, velocity: 127 }],
    [0, { type: "noteon", note: 27, velocity: 127 }],
    [0, { type: "cc", controller: 55, value: 0 }],
    [0, { type: "cc", controller: 56, value: 127 }],
    [500, { type: "cc", controller: 55, value: 127 }],
    [500, { type: "cc", controller: 56, value: 0 }],
    [1000, { type: "noteon", note: 6, velocity: 127 }],
  ].map(([t, command], i) => ({
    id: `${session}-${start}-${i}`,
    sessionId: session,
    inputSource: "deck:1",
    createdAt: start + t,
    bpm: 120,
    beatWithinBar: 1,
    context: { ...context },
    features: { rms: 0.5, bass: 0.4, mid: 0.3, high: 0.3, flux: 0.2, centroid: 0.3 },
    command,
  }))
}
const learned = () =>
  supportedActionSequences(
    learnActionSequences([...demonstration("a"), ...demonstration("b")]),
  )
function harness(sequences = learned()) {
  const player = new SequencePlayback(),
    sent = [],
    safety = new AutomationSafety()
  let time = 10000
  const tick = (elapsed, overrides = {}) => {
    time = 10000 + elapsed
    player.tick(
      time,
      overrides.source ?? "deck:1",
      overrides.context === undefined ? context : overrides.context,
      overrides.bpm ?? 60,
      overrides.beat ?? 1,
      overrides.mode ?? "auto",
      settings,
      overrides.overrideUntil ?? 0,
      sequences,
      (prediction) => {
        if (overrides.failure) return false
        if (!safety.block(prediction.command, time, settings)) {
          sent.push({ at: elapsed, command: prediction.command })
          safety.executed(prediction.command, time, settings)
        }
      },
    )
  }
  return { player, sent, tick }
}

test("learns joint actions, preserves order, simultaneous controls and tempo-relative timing", () => {
  assert.equal(learned().length, 2)
  const { sent, tick } = harness()
  tick(0)
  assert.deepEqual(
    sent.map(({ command }) => command.type),
    ["note", "note", "cc", "cc"],
  )
  assert.equal(new Set(sent.map(({ at }) => at)).size, 1)
  tick(500)
  assert.equal(sent.length, 4) // 60 BPM: a demonstrated half second now lasts one second.
  tick(1000)
  assert.deepEqual(
    sent.slice(-2).map(({ command }) => command.value),
    [127, 0],
  )
  tick(1500)
  tick(2000)
  assert.equal(sent.at(-1).command.note, 6)
  tick(2500)
  assert.equal(sent.length, 7) // no endless retrigger in the same context
})

test("one demonstration or one dense CC burst is not repeated evidence", () => {
  assert.equal(
    supportedActionSequences(learnActionSequences(demonstration("a"))).length,
    0,
  )
  assert.equal(
    learnActionSequences(
      demonstration("a").filter(
        (e) => e.command.type === "cc" && e.command.controller === 55,
      ),
    ).length,
    0,
  )
  assert.equal(
    supportedActionSequences(
      learnActionSequences([...demonstration("same"), ...demonstration("same", 20000)]),
    ).length,
    2,
  )
})

test("does not combine different recordings or different input sources", () => {
  const partial = demonstration("a").map((e, i) => ({ ...e, sessionId: `s-${i}` }))
  assert.equal(learnActionSequences(partial).length, 0)
  const sources = demonstration("a")
    .slice(0, 2)
    .map((e, i) => ({ ...e, inputSource: `deck:${i}` }))
  assert.equal(learnActionSequences(sources).length, 0)
})

test("a reversed chain is not evidence for the demonstrated order", () => {
  const first = demonstration("a")
  const reversed = demonstration("b").map((e, i) => ({
    ...e,
    command:
      i === 0
        ? { type: "noteon", note: 6, velocity: 127 }
        : i === 6
          ? { type: "noteon", note: 24, velocity: 127 }
          : e.command,
  }))
  assert.equal(
    supportedActionSequences(learnActionSequences([...first, ...reversed])).length,
    0,
  )
  const { sent, tick } = harness()
  tick(0, { context: { ...context, phase: "break", energyTrend: -0.8 } })
  assert.equal(sent.length, 0)
})

test("conflicting equally plausible phrases abstain instead of choosing arbitrarily", () => {
  const other = ["c", "d"].flatMap((session) =>
    demonstration(session).map((e) => ({
      ...e,
      command:
        e.command.type === "noteon" && e.command.note === 6
          ? { ...e.command, note: 7 }
          : e.command,
    })),
  )
  const sequences = supportedActionSequences(
    learnActionSequences([...demonstration("a"), ...demonstration("b"), ...other]),
  )
  const { sent, tick } = harness(sequences)
  tick(0)
  assert.equal(sent.length, 0)
})

test("cancels pending steps on manual override, silence, source change, stale input or transport failure", () => {
  for (const interruption of [
    { overrideUntil: 30000 },
    { context: null },
    { context: { ...context, phase: "silence" } },
    { mode: "manual" },
    { source: "deck:2" },
    { failure: true },
  ]) {
    const { sent, tick } = harness()
    tick(0)
    tick(1000, interruption)
    assert.equal(sent.length, 4, JSON.stringify(interruption))
  }
  const { sent, tick } = harness()
  tick(0)
  tick(2000) // never catch up a backlog after losing input
  assert.equal(sent.length, 4)
})

test("protected notes remain blocked within a learned sequence", () => {
  const sequences = learned().map((s) => ({
    ...s,
    steps: s.steps.map((step) => ({
      ...step,
      command:
        step.command.type === "note" ? { ...step.command, note: 36 } : step.command,
    })),
  }))
  const { sent, tick } = harness(sequences)
  tick(0)
  assert.ok(sent.every(({ command }) => command.type === "cc"))
})

test("training and model reload derive sequences from existing session examples", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunlite-sequences-"))
  try {
    const file = path.join(root, "model.json")
    const policy = new ExamplePolicyEngine(file)
    policy.train([...demonstration("a"), ...demonstration("b")])
    assert.equal(policy.sequences.length, 2)
    assert.equal(policy.modelInfo.supportedSequenceCount, 2)
    assert.equal(new ExamplePolicyEngine(file).sequences.length, 2)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("engine selects a joint phrase instead of mixing independent predictions and manual input cancels it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunlite-sequence-engine-"))
  const originalNow = Date.now
  let engine,
    now = 10000
  try {
    const data = path.join(root, "automation")
    fs.mkdirSync(data)
    new ExamplePolicyEngine(path.join(data, "model.json")).train([
      ...demonstration("a"),
      ...demonstration("b"),
    ])
    const sent = []
    Date.now = () => now
    engine = new AutomationEngine(
      root,
      () => {},
      (command) => sent.push(command),
    )
    // Fix the analysis output to isolate scheduling and output from audio feature extraction.
    engine.inputContext.get = () => context
    engine.setMode("auto")
    const frame = () =>
      engine.handleAudioFrame({
        capturedAt: now,
        sampleRate: 48000,
        spectrum: [],
        features: demonstration("a")[0].features,
      })
    frame()
    assert.equal(sent.length, 4)
    now += 500
    frame()
    assert.equal(sent.length, 6)
    engine.recordManualCommand({ type: "cc", controller: 55, value: 70 })
    now += 500
    frame()
    assert.equal(sent.length, 6)
    assert.ok(!sent.some((command) => command.note === 6))
  } finally {
    engine?.dispose()
    Date.now = originalNow
    fs.rmSync(root, { recursive: true, force: true })
  }
})
