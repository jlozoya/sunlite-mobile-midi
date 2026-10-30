import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { ExamplePolicyEngine } from "../dist/main/automation/policy-engine.js"
import { AutomationEngine } from "../dist/main/automation/automation-engine.js"

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

test("isolated jitter CC in two sessions cannot bypass whole-gesture support via scalar prediction", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sunlite-slider-fallback-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const data = path.join(directory, "automation")
  fs.mkdirSync(data)
  const examples = ["song-a", "song-b"].flatMap((sessionId, session) =>
    Array.from({ length: 3 }, (_, index) => ({
      id: `${sessionId}-${index}`,
      sessionId,
      createdAt: session * 10000 + index * 2000,
      features: { rms: 0.5, bass: 0.5, mid: 0.3, high: 0.2, flux: 0.1, centroid: 0.2 },
      context,
      beatWithinBar: 1,
      bpm: 120,
      command: { type: "cc", controller: 54, value: 55 + (index % 2) },
    })),
  )
  new ExamplePolicyEngine(path.join(data, "model.json")).train(examples)
  const commands = []
  const engine = new AutomationEngine(
    directory,
    () => {},
    (command) => commands.push(command),
  )
  const originalNow = Date.now
  let now = 100000
  Date.now = () => now
  try {
    engine.inputContext.get = () => context
    engine.setMode("auto")
    assert.equal(engine.getStatus().modelInfo.sliderGestureCount, 0)
    assert.ok(engine.getStatus().modelInfo.controllersAwaitingSupport.includes(54))
    for (let elapsed = 0; elapsed <= 20000; elapsed += 200) {
      now = 100000 + elapsed
      engine.predictControllers()
    }
    assert.deepEqual(
      commands,
      [],
      "a raw scalar prediction is not an executable learned curve",
    )
  } finally {
    Date.now = originalNow
    engine.dispose()
  }
})
