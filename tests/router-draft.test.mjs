import assert from "node:assert/strict"
import test from "node:test"
import {
  createDraftRoute,
  nextRouterPortId,
  readRouterSetup,
} from "../dist/shared/router-draft.js"
import { validateRouterConfig } from "../dist/shared/router-config.js"
import { buildRouterSetup } from "../dist/shared/router-setup.js"

const port = (id, role) => ({
  id,
  role,
  kind: "hardware",
  deviceName: `Device ${id}`,
  match: "exact",
})

test("adding ports after removal never reuses an existing id", () => {
  const ports = [port("in-1", "input"), port("in-3", "input"), port("out-1", "output")]
  assert.equal(nextRouterPortId(ports, "input"), "in-2")
  assert.equal(nextRouterPortId(ports, "output"), "out-2")
  assert.equal(ports.length, 3)
})

test("manual routes require both roles and receive safe independent defaults", () => {
  const empty = { version: 1, ports: [], routes: [] }
  assert.equal(createDraftRoute(empty), null)
  assert.equal(createDraftRoute({ ...empty, ports: [port("in-1", "input")] }), null)
  const config = { ...empty, ports: [port("in-1", "input"), port("out-1", "output")] }
  const first = createDraftRoute(config)
  assert.equal(first.source, "in-1")
  assert.equal(first.destination, "out-1")
  assert.equal(first.channels, "omni")
  config.routes.push(first)
  const second = createDraftRoute(config)
  assert.equal(second.id, "route-2")
  first.filters.allow.pop()
  assert.notDeepEqual(first.filters.allow, second.filters.allow)
  assert.deepEqual(validateRouterConfig({ ...config, routes: [second] }), [])
})

test("editing a shared setup restores device names and program count", () => {
  const config = buildRouterSetup({
    listenTo: "Controller MIDI",
    writeTo: "Controller Feedback",
    channelsPerProgram: [[], [], []],
  })
  const setup = readRouterSetup(config)
  assert.equal(setup.listenTo, "Controller MIDI")
  assert.equal(setup.writeTo, "Controller Feedback")
  assert.equal(setup.slots, 3)
  assert.equal(setup.perChannel, false)
  assert.deepEqual(setup.channels.slice(0, 3), [[1], [2], [3]])
})

test("editing a channel split preserves omni and multi-channel assignments", () => {
  const config = buildRouterSetup({
    listenTo: "Controller MIDI",
    writeTo: "Controller Feedback",
    channelsPerProgram: [[], [2, 5], [9]],
  })
  const setup = readRouterSetup(config)
  assert.equal(setup.perChannel, true)
  assert.deepEqual(setup.channels.slice(0, 3), [[], [2, 5], [9]])
  setup.channels[1].push(10)
  assert.deepEqual(readRouterSetup(config).channels[1], [2, 5])
})

test("a new wizard starts with two programs and independent default channel arrays", () => {
  const setup = readRouterSetup()
  assert.equal(setup.listenTo, "")
  assert.equal(setup.writeTo, "")
  assert.equal(setup.slots, 2)
  assert.equal(setup.perChannel, false)
  setup.channels[0].push(16)
  assert.deepEqual(readRouterSetup().channels[0], [1])
})
