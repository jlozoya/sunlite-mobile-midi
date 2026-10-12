import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { MusicalContextTracker } from "../dist/shared/musical-context.js"
import { ExamplePolicyEngine } from "../dist/main/automation/policy-engine.js"
import { AutomationEngine } from "../dist/main/automation/automation-engine.js"
import { AutomationSafety } from "../dist/main/automation/automation-safety.js"
import { AudioRhythmTracker } from "../dist/main/automation/audio-rhythm.js"
import { buildTrainingDataset } from "../dist/main/automation/training-dataset.js"
import { waveformFeatures } from "../dist/main/automation/waveform-analysis.js"
import { selectTrainingExamples } from "../dist/main/automation/training-selection.js"
import { AutomationInputContext } from "../dist/main/automation/input-context.js"

function withRoot(run) {
  const parent = fs.realpathSync(os.tmpdir())
  const root = fs.mkdtempSync(path.join(parent, "sunlite-temporal-test-"))
  try {
    return run(root)
  } finally {
    assert.equal(path.dirname(fs.realpathSync(root)), parent)
    assert.ok(path.basename(root).startsWith("sunlite-temporal-test-"))
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function music(beat, gain = 1, color = 0) {
  const rising = Math.max(0, Math.min(1, (beat - 8) / 16))
  const energy =
    beat < 8 ? 0.12 : beat < 24 ? 0.12 + rising * 0.33 : beat < 26 ? 0.035 : 0.65
  const bass = beat < 24 ? 0.4 - rising * 0.28 : beat < 26 ? 0.02 : 0.7
  const high = beat < 24 ? 0.1 + rising * 0.4 : 0.18
  return {
    rms: energy * gain,
    bass: bass * gain,
    mid: (0.2 + color * 0.02) * gain,
    high: high * gain,
    flux: (beat % 1 < 0.15 ? 0.2 : 0.02) * gain,
    centroid: high / (bass + 0.2 + high),
  }
}

function song(bpm = 120, gain = 1, color = 0) {
  const tracker = new MusicalContextTracker(),
    samples = []
  const beatMs = 60000 / bpm
  for (let beat = 0; beat <= 38; beat += 0.1) {
    const at = Math.round(beat * beatMs)
    const features = music(beat, gain, color)
    const context = tracker.push(features, at, bpm)
    if (context) samples.push({ at, beat, features, context })
  }
  return samples
}

const contextAt = (samples, beat) =>
  samples.reduce((best, sample) =>
    Math.abs(sample.beat - beat) < Math.abs(best.beat - beat) ? sample : best,
  )

function demonstrations() {
  return [110, 120, 130].flatMap((bpm, session) => {
    const samples = song(bpm, 0.7 + session * 0.1, session)
    return [12, 15, 18, 21, 23].flatMap((beat) => {
      const sample = contextAt(samples, beat)
      const base = {
        id: `${session}-${beat}`,
        createdAt: session * 100000 + sample.at,
        sessionId: `song-${session}`,
        bpm,
        beatWithinBar: 2,
        features: sample.features,
        context: sample.context,
      }
      return [
        {
          ...base,
          command: {
            type: "note",
            note: beat < 16 ? 50 : beat < 21 ? 51 : 52,
            velocity: 100,
            offDelayMs: 250,
          },
        },
        {
          ...base,
          id: base.id + "-cc",
          command: {
            type: "cc",
            controller: 48,
            value: Math.round(((beat - 8) / 16) * 127),
          },
        },
      ]
    })
  })
}

test("causal context distinguishes builds, breaks and drops and survives a gain change", () => {
  const normal = song(),
    quieter = song(120, 0.4)
  assert.equal(contextAt(normal, 18).context.phase, "build")
  assert.equal(contextAt(normal, 25).context.phase, "break")
  assert.equal(contextAt(normal, 27).context.phase, "drop")
  assert.equal(contextAt(normal, 37).context.phase, "steady")
  for (const beat of [12, 18, 25, 27, 37]) {
    const a = contextAt(normal, beat).context,
      b = contextAt(quieter, beat).context
    assert.equal(a.phase, b.phase)
    assert.ok(Math.abs(a.energyTrend - b.energyTrend) < 0.001)
    assert.ok(Math.abs(a.bassRatio - b.bassRatio) < 0.001)
  }
  const tracker = new MusicalContextTracker()
  for (let at = 0; at < 2000; at += 50) tracker.push(music(2), at)
  assert.ok(tracker.get(2000))
  assert.equal(
    tracker.push(music(18), 6000),
    null,
    "a disconnected source restarts its context",
  )
  assert.equal(tracker.get(9000), null, "stale context cannot drive output")
})

test("same current sound with a different preceding trend produces a different learned note", () =>
  withRoot((root) => {
    const samples = song(),
      rising = contextAt(samples, 18)
    const steadyTracker = new MusicalContextTracker()
    let steady
    for (let at = 0; at < 10000; at += 50)
      steady = steadyTracker.push(rising.features, at)
    assert.equal(steady.phase, "steady")
    const examples = [0, 1, 2].flatMap((session) =>
      [0, 1, 2].flatMap((i) => [
        {
          id: `build-${session}-${i}`,
          createdAt: i,
          sessionId: `session-${session}`,
          features: rising.features,
          context: rising.context,
          beatWithinBar: 2,
          bpm: 120,
          command: { type: "note", note: 50 },
        },
        {
          id: `steady-${session}-${i}`,
          createdAt: i,
          sessionId: `session-${session}`,
          features: rising.features,
          context: steady,
          beatWithinBar: 2,
          bpm: 120,
          command: { type: "note", note: 51 },
        },
      ]),
    )
    const model = new ExamplePolicyEngine(path.join(root, "model.json"))
    model.train(examples)
    assert.equal(model.predict(rising.features, 2, 120, rising.context).command.note, 50)
    assert.equal(model.predict(rising.features, 2, 120, steady).command.note, 51)
    assert.equal(
      model.predict(rising.features, 2, 120, null),
      null,
      "rich models wait for live context",
    )
  }))

test("held-out timbre, loudness and tempo transfer the build's controller progression", () =>
  withRoot((root) => {
    const model = new ExamplePolicyEngine(path.join(root, "model.json"))
    model.train(demonstrations())
    const novel = song(140, 0.4, 3)
    const values = [12, 16, 19, 22].map((beat) => {
      const sample = contextAt(novel, beat)
      const result = model.predictControllers(sample.context, 140)[0]
      assert.ok(result, `missing prediction at beat ${beat}`)
      assert.ok(
        result.confidence >= 0.62,
        `confidence ${result.confidence} at beat ${beat}`,
      )
      return result.command.value
    })
    assert.ok(values.at(-1) - values[0] > 40, JSON.stringify(values))
    assert.ok(
      values.every((value, i) => i === 0 || value >= values[i - 1]),
      JSON.stringify(values),
    )
    const copy = new ExamplePolicyEngine(path.join(root, "model.json"))
    assert.equal(copy.modelInfo.temporalExampleCount, demonstrations().length)
    assert.ok(copy.modelInfo.validation.testedExamples > 0)
    assert.equal(copy.modelInfo.validation.heldOutSessions, 3)
    assert.ok(copy.modelInfo.validation.controllerMeanError < 20)
  }))

test("the model refuses a musical phase it has not learned", () =>
  withRoot((root) => {
    const model = new ExamplePolicyEngine(path.join(root, "model.json"))
    model.train(demonstrations())
    const drop = contextAt(song(), 27)
    const prediction = model.predict(drop.features, 2, 120, drop.context)
    assert.ok(!prediction || prediction.confidence < 0.62)
    const silent = { ...drop.context, phase: "silence" }
    assert.equal(model.predict(drop.features, 2, 120, silent), null)
  }))

test("validation leaves entire sessions out and never claims a score for one recording", () =>
  withRoot((root) => {
    const model = new ExamplePolicyEngine(path.join(root, "model.json"))
    model.train(demonstrations().filter((example) => example.sessionId === "song-0"))
    assert.equal(model.modelInfo.validation, null)
    const conflicting = demonstrations().map((example) => ({
      ...example,
      command:
        example.command.type === "cc"
          ? example.command
          : { type: "note", note: Number(example.sessionId.at(-1)) + 70 },
    }))
    model.train(conflicting)
    assert.equal(
      model.modelInfo.validation.noteAccuracy,
      0,
      "a session's private label cannot leak into its own evaluation",
    )
    const idleContext = contextAt(song(), 37).context
    model.train(
      demonstrations(),
      [0, 1, 2].map((session) => ({
        sessionId: `song-${session}`,
        context: idleContext,
      })),
    )
    assert.equal(model.modelInfo.validation.idleTested, 3)
    assert.equal(model.modelInfo.validation.idleFalsePositiveRate, 0)
  }))

test("dataset recovery uses past context, excludes rejected actions and retains idle examples", () => {
  const samples = song(),
    session = { id: "test-session", startedAt: new Date(0).toISOString() }
  const events = samples.map((sample) => ({
    kind: "audio",
    t: sample.at,
    frame: { features: sample.features },
    context: sample.context,
    inputSource: "audio",
  }))
  const sample = contextAt(samples, 18)
  const example = {
    id: "action",
    createdAt: sample.at,
    features: sample.features,
    bpm: 120,
    beatWithinBar: 0,
    command: { type: "note", note: 50 },
  }
  events.push({ kind: "example", t: sample.at + 1, example, inputSource: "audio" })
  const dataset = buildTrainingDataset([session], () => events, new Set())
  assert.equal(dataset.examples.length, 1)
  assert.equal(dataset.examples[0].sessionId, session.id)
  assert.equal(dataset.examples[0].context.phase, sample.context.phase)
  assert.ok(dataset.idle.length > 0)
  assert.equal(
    buildTrainingDataset([session], () => events, new Set(["action"])).examples.length,
    0,
  )
})

test("observed audio pulses estimate tempo without inventing a downbeat", () => {
  const tracker = new AudioRhythmTracker()
  const pulses = []
  for (let at = 0; at <= 5000; at += 50) {
    const result = tracker.observe({ ...music(0), flux: at % 500 === 0 ? 0.3 : 0.01 }, at)
    if (result.pulse) pulses.push(result)
  }
  assert.ok(pulses.length >= 3)
  assert.ok(pulses.every((pulse) => Math.abs(pulse.bpm - 120) < 1))
  assert.equal("beatWithinBar" in pulses[0], false)
  tracker.reset()
  assert.equal(tracker.observe(music(0), 9000).confidence, 0)
})

test("continuous controller limits, manual values and strobe protections remain separate", () => {
  const safety = new AutomationSafety()
  const settings = {
    minActionIntervalMs: 900,
    minControllerIntervalMs: 100,
    repeatActionCooldownMs: 4000,
    strobeCooldownMs: 5000,
    blockedNotes: [36],
    strobeNotes: [42],
    blockedControllers: [56],
  }
  const cc = { type: "cc", controller: 48, value: 0 }
  safety.executed(cc, 10000, settings)
  assert.equal(
    safety.block({ ...cc, value: 64 }, 10050, settings),
    "intervalo mínimo del fader",
  )
  assert.equal(safety.block({ ...cc, value: 64 }, 10100, settings), null)
  const smooth = safety.smooth({ ...cc, value: 127 }, 10100)
  assert.ok(smooth.value > 0 && smooth.value < 30)
  assert.equal(
    safety.block({ ...cc, controller: 56 }, 11000, settings),
    "control continuo protegido",
  )
  safety.executed({ type: "note", note: 42 }, 11000, settings)
  assert.equal(
    safety.block({ type: "note", note: 42 }, 15100, settings),
    "strobe en cooldown",
  )
  assert.equal(
    safety.block({ type: "note", note: 36 }, 17000, settings),
    "nota protegida",
  )
})

test("CDJ feature extraction only uses the current and preceding waveform", () => {
  const segments = Array.from({ length: 1000 }, (_, i) => ({
    height: i > 450 ? 31 : 4,
    color: [0.4, 0.2, 0.1],
  }))
  const withFutureDrop = waveformFeatures(segments, 3000)
  const noFuture = waveformFeatures(
    segments.map((segment) => ({ ...segment, height: 4 })),
    3000,
  )
  assert.deepEqual(withFutureDrop, noFuture)
})

test("newest examples survive the capacity limit irrespective of session enumeration order", () =>
  withRoot((root) => {
    const model = new ExamplePolicyEngine(path.join(root, "model.json"))
    const sample = contextAt(song(), 18)
    const examples = Array.from({ length: 8100 }, (_, i) => ({
      id: `id-${i}`,
      createdAt: i,
      features: sample.features,
      beatWithinBar: 1,
      bpm: 120,
      command: { type: "note", note: 50 },
    })).reverse()
    model.train(examples)
    const stored = JSON.parse(fs.readFileSync(path.join(root, "model.json"), "utf8"))
    assert.equal(stored.examples.length, 8000)
    assert.equal(stored.examples[0].createdAt, 100)
    assert.equal(stored.examples.at(-1).createdAt, 8099)
  }))

test("a dense fader recording cannot displace all other songs", () => {
  const examples = [0, 1, 2].flatMap((session) =>
    Array.from({ length: session === 2 ? 12000 : 300 }, (_, i) => ({
      id: `${session}-${i}`,
      sessionId: `song-${session}`,
      createdAt: session * 20000 + i,
    })),
  )
  const selected = selectTrainingExamples(examples)
  assert.equal(selected.length, 8000)
  assert.equal(selected.filter((example) => example.sessionId === "song-0").length, 300)
  assert.equal(selected.filter((example) => example.sessionId === "song-1").length, 300)
  assert.ok(new Set(selected.map((example) => example.id)).size === selected.length)
})

test("cueing or seeking resets the deck history instead of inventing a transition", () => {
  const state = new AutomationInputContext()
  for (let t = 0; t <= 3000; t += 50) state.deck(1, music(4), t, 120, t)
  assert.ok(state.get("deck:1", 3000))
  state.deck(1, music(30), 3050, 120, 18000)
  assert.equal(state.get("deck:1", 3050), null)
  assert.equal(state.get("deck:2", 3050), null)
})

test("the engine gradually drives a learned fader on a new musical build and stops on disconnection", () =>
  withRoot((root) => {
    const data = path.join(root, "automation")
    fs.mkdirSync(data)
    new ExamplePolicyEngine(path.join(data, "model.json")).train(demonstrations())
    const commands = [],
      engine = new AutomationEngine(
        root,
        () => {},
        (command) => commands.push({ at: Date.now(), command }),
      )
    const originalNow = Date.now
    let now = originalNow(),
      start = now
    Date.now = () => now
    try {
      engine.setMode("auto")
      const beatMs = 60000 / 140
      for (let t = 0; t < 24 * beatMs; t += 50) {
        now = start + t
        engine.handleAudioFrame({
          capturedAt: now,
          sampleRate: 48000,
          spectrum: [],
          features: music(t / beatMs, 0.4, 3),
        })
      }
      const values = commands.filter((entry) => entry.command.type === "cc")
      assert.ok(
        commands.some((entry) => entry.command.type === "note"),
        "quieter music still triggers learned scene notes on detected pulses",
      )
      assert.ok(values.length > 10, `only ${values.length} controller updates`)
      assert.ok(values.at(-1).command.value > values[0].command.value + 30)
      assert.ok(values.every((entry, i) => i === 0 || entry.at - values[i - 1].at >= 100))
      assert.ok(
        values.every(
          (entry, i) =>
            i === 0 || Math.abs(entry.command.value - values[i - 1].command.value) <= 53,
        ),
      )
      const count = commands.length
      engine.handleAudioDisconnected()
      assert.equal(engine.getStatus().musicalContext, null)
      now += 1000
      assert.equal(commands.length, count)
    } finally {
      engine.dispose()
      Date.now = originalNow
    }
  }))

test("engine emits learned notes on the demonstrated beat and preserves Manual override", () =>
  withRoot((root) => {
    const originalNow = Date.now
    let now = originalNow()
    const data = path.join(root, "automation")
    fs.mkdirSync(data)
    const tracker = new MusicalContextTracker()
    const features = music(3)
    let context
    for (let at = 0; at <= 4000; at += 50) context = tracker.push(features, at, 120)
    new ExamplePolicyEngine(path.join(data, "model.json")).train(
      Array.from({ length: 9 }, (_, i) => ({
        id: `note-${i}`,
        sessionId: `song-${Math.floor(i / 3)}`,
        createdAt: i,
        features,
        context,
        beatWithinBar: 2,
        bpm: 120,
        command: { type: "note", note: 50 },
      })),
    )
    const commands = [],
      engine = new AutomationEngine(
        root,
        () => {},
        (command) => commands.push(command),
      )
    Date.now = () => now
    const start = now
    try {
      engine.setMode("auto")
      for (let t = 0; t <= 4000; t += 50) {
        now = start + t
        engine.handleDjLinkEvent({
          type: "waveform-position",
          position: {
            deviceNumber: 1,
            positionMs: t,
            isPlaying: true,
            isOnAir: true,
            isMaster: true,
            features,
            receivedAt: now,
          },
        })
      }
      const beat = (value) =>
        engine.handleDjLinkEvent({
          type: "beat",
          beat: {
            deviceNumber: 1,
            name: "Test CDJ",
            address: "127.0.0.1",
            bpm: 120,
            beatWithinBar: value,
            pitchPercent: 0,
            receivedAt: now,
          },
        })
      beat(1)
      assert.equal(commands.length, 0)
      beat(2)
      assert.equal(commands.length, 1)
      now += 5000
      engine.handleDjLinkEvent({
        type: "waveform-position",
        position: {
          deviceNumber: 1,
          positionMs: 9000,
          isPlaying: true,
          isOnAir: true,
          isMaster: true,
          features,
          receivedAt: now,
        },
      })
      engine.recordManualCommand({ type: "cc", controller: 48, value: 20 })
      beat(2)
      assert.equal(commands.length, 1)
      engine.setMode("manual")
      beat(2)
      assert.equal(commands.length, 1)
    } finally {
      engine.dispose()
      Date.now = originalNow
    }
  }))
