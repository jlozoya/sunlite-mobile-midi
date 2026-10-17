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
