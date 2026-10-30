import assert from "node:assert/strict"
import test from "node:test"
import { prepareTrainingRouter } from "../dist/main/automation/training-router.js"

function setup() {
  const ports = [
    {
      id: "pads",
      role: "input",
      kind: "hardware",
      deviceName: "APC mini",
      match: "exact",
    },
    {
      id: "lights",
      role: "output",
      kind: "virtual",
      deviceName: "Sunlite Mobile In",
      match: "exact",
    },
    {
      id: "leds",
      role: "output",
      kind: "hardware",
      deviceName: "APC LEDs",
      match: "exact",
    },
  ]
  const state = {
    running: false,
    errors: [],
    config: {
      version: 1,
      ports,
      routes: [{ id: "to-lights", enabled: true, source: "pads", destination: "lights" }],
    },
    ports: ports.map((port) => ({ ...port, connected: false, error: null })),
    devices: { inputs: ["APC mini"], outputs: [] },
    provisioning: null,
  }
  const ready = () => {
    state.running = true
    for (const port of state.ports) port.connected = port.id !== "leds"
  }
  return { state, ready }
}

const immediate = { timeoutMs: 0 }

test("training starts a saved router and requires the delivered hardware route, not unrelated ports", async () => {
  const { state, ready } = setup()
  let starts = 0
  await prepareTrainingRouter(
    () => state,
    async () => {
      starts++
      ready()
    },
    immediate,
  )
  assert.equal(starts, 1)
  assert.equal(state.ports.find((port) => port.id === "leds").connected, false)
})

test("training refuses a hardware input that remains busy after a nominally successful start", async () => {
  const { state, ready } = setup()
  await assert.rejects(
    prepareTrainingRouter(
      () => state,
      async () => {
        ready()
        state.ports[0].connected = false
        state.ports[0].error = "Device busy"
      },
      immediate,
    ),
    /APC mini: Device busy/,
  )
})

test("training refuses a closed route destination even when the physical input is open", async () => {
  const { state, ready } = setup()
  await assert.rejects(
    prepareTrainingRouter(
      () => state,
      async () => {
        ready()
        state.ports[1].connected = false
        state.ports[1].error = "Virtual port missing"
      },
      immediate,
    ),
    /Sunlite Mobile In: Virtual port missing/,
  )
})

test("an already running router must still have its route connected and is never restarted", async () => {
  const { state, ready } = setup()
  ready()
  const unexpectedStart = async () => {
    throw Error("must not restart")
  }
  await prepareTrainingRouter(() => state, unexpectedStart, immediate)
  state.ports[1].connected = false
  await assert.rejects(
    prepareTrainingRouter(() => state, unexpectedStart, immediate),
    /Sunlite Mobile In: puerto sin conectar/,
  )
})

test("training waits for ports to become ready after startup instead of recording early", async () => {
  const { state, ready } = setup()
  let reads = 0
  const getState = () => {
    if (++reads === 4) ready()
    return state
  }
  await prepareTrainingRouter(
    getState,
    async () => {
      state.running = true
    },
    { timeoutMs: 1000, pollIntervalMs: 1 },
  )
  assert.ok(reads >= 4)
  assert.equal(state.ports[1].connected, true)
})

test("training reports that a router stopped during preparation", async () => {
  const { state } = setup()
  await assert.rejects(
    prepareTrainingRouter(
      () => state,
      async () => {},
      immediate,
    ),
    /el router está detenido/,
  )
})

test("no usable saved hardware route leaves training from the UI available", async () => {
  for (const change of [
    (state) => {
      state.errors = ["Invalid route"]
    },
    (state) => {
      state.devices.inputs = []
    },
    (state) => {
      state.config.routes[0].enabled = false
    },
    (state) => {
      state.config.ports = []
      state.config.routes = []
    },
  ]) {
    const { state } = setup()
    change(state)
    await prepareTrainingRouter(
      () => state,
      async () => {
        throw Error("must not start")
      },
      immediate,
    )
  }
})

test("device availability uses the same case-insensitive matching as router ports", async () => {
  for (const match of ["exact", "contains"]) {
    const { state, ready } = setup()
    state.config.ports[0].match = match
    state.config.ports[0].deviceName = match === "exact" ? "  apc MINI  " : "  apc  "
    await prepareTrainingRouter(
      () => state,
      async () => {
        ready()
      },
      immediate,
    )
    assert.equal(state.running, true)
  }
})

test("a failed startup prevents training and preserves the device error", async () => {
  const { state } = setup()
  await assert.rejects(
    prepareTrainingRouter(
      () => state,
      async () => {
        throw Error("Native MIDI unavailable")
      },
      immediate,
    ),
    /No se pudo arrancar el router para entrenar.*Native MIDI unavailable/,
  )
})
