import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { once } from "node:events"
import test from "node:test"
import express from "express"
import { createControllerStore } from "../dist/main/persistence/controller-store.js"
import { createMidiFeedbackStore } from "../dist/main/persistence/midi-feedback-store.js"
import { registerControllerRoutes } from "../dist/main/server/controller-routes.js"
import { registerAutomationRoutes } from "../dist/main/server/automation-routes.js"
import { registerControllerSocket } from "../dist/main/server/controller-socket.js"
import {
  getNetworkUrlCandidates,
  listenWithPortFallback,
} from "../dist/main/server/network.js"
import { WebSocket, WebSocketServer } from "ws"
import { createMidiControllerService } from "../dist/main/midi/controller-service.js"
import { recordRoutedCommands } from "../dist/main/automation/router-training.js"
import { prepareTrainingRouter } from "../dist/main/automation/training-router.js"

async function waitFor(condition) {
  const deadline = Date.now() + 10000
  while (!condition()) {
    assert.ok(Date.now() < deadline, "timed out waiting for the expected event")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

test("training waits for an available saved hardware router, skips unavailable setups and reports startup errors", async (t) => {
  const state = {
    running: false,
    errors: [],
    devices: { inputs: ["APC mini"], outputs: ["Router Salida 1"] },
    ports: [],
    config: {
      ports: [
        {
          id: "physical",
          role: "input",
          kind: "hardware",
          deviceName: "APC",
          match: "contains",
        },
        {
          id: "lights",
          role: "output",
          kind: "virtual",
          deviceName: "Router Salida 1",
          match: "exact",
        },
      ],
      routes: [{ enabled: true, source: "physical", destination: "lights" }],
    },
  }
  let starts = 0,
    sessions = 0,
    release
  const startup = new Promise((resolve) => {
    release = resolve
  })
  const request = await serve(t, (app) =>
    registerAutomationRoutes(app, {
      getEngine: () => ({
        startSession: () => {
          sessions++
          return { recording: true }
        },
      }),
      getCapture: () => null,
      getSidecar: () => null,
      prepareTraining: () =>
        prepareTrainingRouter(
          () => state,
          async () => {
            starts++
            await startup
            state.running = true
            state.ports = [
              { id: "physical", connected: true, error: null },
              { id: "lights", connected: true, error: null },
            ]
          },
        ),
    }),
  )
  const pending = request("/api/automation/session/start", "POST", { name: "Hardware" })
  await waitFor(() => starts === 1)
  assert.equal(starts, 1)
  assert.equal(sessions, 0, "do not record until the router is ready")
  release()
  assert.equal((await pending).body.recording, true)
  for (const variant of [
    { ...state, running: true },
    { ...state, running: false, errors: ["Invalid route"] },
    { ...state, running: false, devices: { inputs: [], outputs: [] } },
    { ...state, running: false, config: { ports: [], routes: [] } },
  ])
    await prepareTrainingRouter(
      () => variant,
      async () => {
        throw Error("must not start")
      },
    )
  state.running = false
  state.ports = []
  const failedRequest = await serve(t, (app) =>
    registerAutomationRoutes(app, {
      getEngine: () => ({
        startSession: () => {
          sessions++
        },
      }),
      getCapture: () => null,
      getSidecar: () => null,
      prepareTraining: () =>
        prepareTrainingRouter(
          () => state,
          async () => {
            throw Error("Device busy")
          },
        ),
    }),
  )
  const failed = await failedRequest("/api/automation/session/start", "POST", {})
  assert.equal(failed.status, 400)
  assert.match(failed.body.message, /Device busy/)
  assert.equal(sessions, 1)
})

test("routed hardware sliders update UI snapshots during a continuous drag without resending MIDI", async (t) => {
  const root = temporaryDirectory(t)
  const feedbackStore = createMidiFeedbackStore(() => root)
  const broadcasts = [],
    sent = [],
    recorded = []
  class Port {
    on() {}
    close() {}
    send(type, payload) {
      sent.push({ type, ...payload })
    }
  }
  const controller = createMidiControllerService({
    broadcastToAll: (payload) => broadcasts.push(payload),
    recordFeedback: (command) => recorded.push(command),
    getLightingSoftware: () => "sunlite",
    feedbackStore,
    midiBackend: {
      getOutputs: () => ["Sunlite Mobile In"],
      getInputs: () => [],
      Output: Port,
      Input: Port,
    },
  })
  const config = {
    ports: [
      { id: "physical", role: "input", kind: "hardware" },
      { id: "return", role: "input", kind: "virtual" },
    ],
  }
  const deliver = (source, value) =>
    recordRoutedCommands(
      config,
      source,
      [{ bytes: [0xb0, 55, value] }, { bytes: [0xb0, 55, value] }],
      (command) => controller.observeControllerCommand(command),
    )
  deliver("physical", 1)
  assert.equal(feedbackStore.cloneMidiFeedbackState().ccValues[55], 1)
  deliver("return", 127)
  assert.equal(feedbackStore.cloneMidiFeedbackState().ccValues[55], 1)
  const drag = setInterval(() => deliver("physical", 80), 5)
  try {
    await waitFor(() => broadcasts.length >= 2)
    assert.ok(broadcasts.length >= 2, "publish while hardware is still moving")
  } finally {
    clearInterval(drag)
  }
  deliver("physical", 127)
  await waitFor(() => broadcasts.at(-1)?.state.ccValues[55] === 127)
  assert.equal(broadcasts.at(-1).event, "midi-feedback-state")
  assert.equal(broadcasts.at(-1).state.ccValues[55], 127)
  assert.deepEqual(sent, [], "mirroring hardware must not duplicate routed MIDI")
  assert.deepEqual(recorded, [], "hardware must not be recorded as software feedback")
  controller.refreshMidiConnection()
  controller.handleCommand({ type: "cc", controller: 56, value: 96 })
  await waitFor(() => broadcasts.at(-1)?.state.ccValues[56] === 96)
  assert.equal(sent.length, 1)
  assert.equal(broadcasts.at(-1).state.ccValues[56], 96)
  controller.closeMidiConnection()
})

test("status refresh preserves native MIDI handles and held notes; explicit refresh reconnects", () => {
  const instances = []
  let outputs = ["Sunlite Mobile In"]
  class Port {
    closed = false
    messages = []
    constructor(name) {
      this.name = name
      instances.push(this)
    }
    on() {}
    send(type, payload) {
      assert.equal(this.closed, false, "must not send a release to a closed handle")
      this.messages.push({ type, ...payload })
    }
    close() {
      this.closed = true
    }
  }
  const controller = createMidiControllerService({
    broadcastToAll() {},
    recordFeedback() {},
    getLightingSoftware: () => "freestyler",
    feedbackStore: { cloneMidiFeedbackState: () => ({}), updateMidiFeedbackState() {} },
    midiBackend: {
      getOutputs: () => outputs,
      getInputs: () => ["Sunlite Mobile Out"],
      Output: Port,
      Input: Port,
    },
  })
  controller.refreshMidiConnection()
  const first = controller.getConnection()
  controller.handleCommand({ type: "noteon", note: 24, velocity: 127 })
  for (let poll = 0; poll < 5; poll++) controller.refreshMidiConnection()
  assert.equal(controller.getConnection(), first)
  assert.equal(instances.length, 2)
  controller.handleCommand({ type: "noteoff", note: 24, velocity: 0 })
  assert.deepEqual(first.output.messages, [
    { type: "noteon", note: 24, velocity: 127, channel: 0 },
    { type: "noteoff", note: 24, velocity: 0, channel: 0 },
  ])
  controller.refreshMidiConnection(true)
  assert.equal(first.output.closed, true)
  assert.equal(first.input.closed, true)
  assert.notEqual(controller.getConnection(), first)
  outputs = []
  assert.equal(controller.refreshMidiConnection().midiReady, false)
  assert.equal(controller.getConnection(), null)
})

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sunlite-services-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

async function serve(t, configure) {
  const app = express()
  app.use(express.json())
  configure(app)
  const server = http.createServer(app)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  return async (url, method = "GET", body) => {
    const response = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const content = await response.text()
    return { status: response.status, body: content ? JSON.parse(content) : null }
  }
}

test("feedback preserves legacy files, snapshots, note release and profile isolation", (t) => {
  const root = temporaryDirectory(t)
  let profile = root
  fs.writeFileSync(
    path.join(root, "midi-feedback-state.json"),
    JSON.stringify({ padVelocities: { 50: 110 }, ccValues: { 7: 80 } }),
  )
  const store = createMidiFeedbackStore(() => profile)
  const snapshot = store.loadMidiFeedbackState()
  assert.deepEqual(snapshot.padStates[50], { velocity: 110, behaviorChannel: 6 })
  snapshot.padStates[50].velocity = 1
  assert.equal(store.cloneMidiFeedbackState().padStates[50].velocity, 110)
  store.updateMidiFeedbackState("noteon", { note: 51, velocity: 200, channel: 20 })
  assert.deepEqual(store.cloneMidiFeedbackState().padStates[51], {
    velocity: 127,
    behaviorChannel: 15,
  })
  store.updateMidiFeedbackState("noteon", { note: 50, velocity: 0 })
  assert.equal(store.cloneMidiFeedbackState().padStates[50], undefined)
  store.updateMidiFeedbackState("noteoff", { note: 51 })
  assert.deepEqual(store.cloneMidiFeedbackState().padStates, {})
  profile = path.join(root, "profiles", "freestyler")
  store.loadMidiFeedbackState()
  store.updateMidiFeedbackState("cc", { controller: 7, value: 12 })
  profile = root
  assert.equal(store.loadMidiFeedbackState().ccValues[7], 80)
  fs.writeFileSync(path.join(root, "midi-feedback-state.json"), "invalid json")
  assert.deepEqual(store.loadMidiFeedbackState(), { padStates: {}, ccValues: {} })
})

test("controller customization follows the active profile without leaking stored labels", (t) => {
  const root = temporaryDirectory(t)
  let profile = root
  const store = createControllerStore(() => profile)
  const initial = store.loadControllerCustomization()
  const pad = Object.keys(initial.pads)[0]
  store.saveControllerCustomization({
    ...initial,
    pads: { ...initial.pads, [pad]: { ...initial.pads[pad], label: "Sunlite scene" } },
  })
  profile = path.join(root, "profiles", "freestyler")
  assert.notEqual(store.loadControllerCustomization().pads[pad].label, "Sunlite scene")
  profile = root
  assert.equal(store.loadControllerCustomization().pads[pad].label, "Sunlite scene")
})

test("controller HTTP routes preserve recording guards, profile switching, persistence and broadcasts", async (t) => {
  const root = temporaryDirectory(t)
  const feedbackStore = createMidiFeedbackStore(() => root)
  const controllerStore = createControllerStore(() => root)
  let status = { lightingSoftware: "sunlite", midiReady: true }
  let recording = false
  const broadcasts = []
  const request = await serve(t, (app) =>
    registerControllerRoutes(app, {
      getStatus: () => status,
      getLightingSoftware: () => status.lightingSoftware,
      isRecording: () => recording,
      switchLightingSoftware: (software) => {
        status = { ...status, lightingSoftware: software }
      },
      refreshMidiConnection: () => status,
      controllerStore,
      feedbackStore,
      midiBridge: {
        installLoopMidi: async () => ({ code: 0 }),
        openLoopMidi: async () => "bridge.exe",
      },
      broadcastToAll: (payload) => broadcasts.push(payload),
    }),
  )
  assert.equal(
    (await request("/api/lighting-software", "PUT", { software: "unknown" })).status,
    400,
  )
  recording = true
  assert.equal(
    (await request("/api/lighting-software", "PUT", { software: "freestyler" })).status,
    409,
  )
  assert.equal(status.lightingSoftware, "sunlite")
  recording = false
  assert.equal(
    (await request("/api/lighting-software", "PUT", { software: "freestyler" })).body
      .lightingSoftware,
    "freestyler",
  )
  assert.equal((await request("/api/status")).body.lightingSoftware, "freestyler")
  const config = controllerStore.loadControllerCustomization()
  assert.equal((await request("/api/controller-config", "PUT", config)).status, 200)
  assert.equal(broadcasts.at(-1).event, "controller-config")
  feedbackStore.updateMidiFeedbackState("cc", { controller: 7, value: 80 })
  assert.equal((await request("/api/midi-feedback/state")).body.state.ccValues[7], 80)
  assert.deepEqual((await request("/api/midi-feedback/clear", "POST")).body.state, {
    padStates: {},
    ccValues: {},
  })
  assert.deepEqual(feedbackStore.loadMidiFeedbackState(), { padStates: {}, ccValues: {} })
  assert.equal(broadcasts.at(-1).event, "midi-feedback-state")
})

test("automation routes resolve the current engine after profile replacement and retain capture error responses", async (t) => {
  let engine = { getStatus: () => ({ profile: "sunlite" }) }
  const request = await serve(t, (app) =>
    registerAutomationRoutes(app, {
      getEngine: () => engine,
      getCapture: () => null,
      getSidecar: () => null,
    }),
  )
  assert.equal((await request("/api/automation/status")).body.profile, "sunlite")
  engine = {
    getStatus: () => ({ profile: "freestyler" }),
    setMode: () => {
      throw Error("Invalid mode")
    },
  }
  assert.equal((await request("/api/automation/status")).body.profile, "freestyler")
  assert.equal(
    (await request("/api/automation/mode", "PUT", { mode: "invalid" })).status,
    400,
  )
  assert.equal((await request("/api/automation/rekordbox/decks/5/frame")).status, 400)
  assert.equal((await request("/api/automation/rekordbox/decks/1/frame")).status, 404)
})

test("existing WebSocket clients send manual actions and audio to the replacement engine", async (t) => {
  const root = temporaryDirectory(t)
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 })
  await once(wss, "listening")
  t.after(() => {
    for (const socket of wss.clients) socket.terminate()
    return new Promise((resolve) => wss.close(resolve))
  })
  const events = []
  let engine = {
    getStatus: () => ({ profile: "sunlite" }),
    recordManualCommand: () => events.push("old"),
  }
  registerControllerSocket(wss, {
    refreshMidiConnection: () => null,
    midiController: {
      getConnection: () => null,
      getStatus: () => ({ availableMidiOutputs: [], feedbackDisabledReason: null }),
      handleCommand: (command) => ({ ok: true, ...command }),
    },
    controllerStore: createControllerStore(() => root),
    feedbackStore: createMidiFeedbackStore(() => root),
    getEngine: () => engine,
  })
  const client = new WebSocket(`ws://127.0.0.1:${wss.address().port}`)
  t.after(() => client.terminate())
  await once(client, "open")
  engine = {
    recordManualCommand: (command) => events.push(command),
    handleAudioFrame: (frame) => events.push(frame),
  }
  const reply = new Promise((resolve) => {
    const onMessage = (raw) => {
      if (JSON.parse(raw.toString()).event === "command-result") {
        client.off("message", onMessage)
        resolve()
      }
    }
    client.on("message", onMessage)
  })
  client.send(JSON.stringify({ type: "cc", controller: 7, value: 90 }))
  await reply
  assert.deepEqual(events[0], { type: "cc", controller: 7, value: 90 })
  const received = once([...wss.clients][0], "message")
  client.send(
    JSON.stringify({ type: "automation-audio-frame", frame: { capturedAt: 123 } }),
  )
  await received
  assert.deepEqual(events[1], { capturedAt: 123 })
})

test("network discovery favours physical private LAN over virtual and link-local adapters", (t) => {
  t.mock.method(os, "networkInterfaces", () => ({
    vEthernet: [{ family: "IPv4", internal: false, address: "172.20.0.1" }],
    "Wi-Fi": [{ family: "IPv4", internal: false, address: "192.168.1.20" }],
    Other: [{ family: "IPv4", internal: false, address: "169.254.1.2" }],
    Loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
  }))
  const candidates = getNetworkUrlCandidates(3000)
  assert.equal(candidates.length, 3)
  assert.equal(candidates[0].url, "http://192.168.1.20:3000")
})

test("HTTP listener retries a busy port without losing the server", async (t) => {
  const blocker = http.createServer()
  blocker.listen(0, "0.0.0.0")
  await once(blocker, "listening")
  t.after(() => new Promise((resolve) => blocker.close(resolve)))
  const server = http.createServer()
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const port = await listenWithPortFallback(server, blocker.address().port)
  assert.ok(port > blocker.address().port)
  assert.equal(server.address().port, port)
})
