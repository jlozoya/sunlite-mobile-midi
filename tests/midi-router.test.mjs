import assert from "node:assert/strict"
import test from "node:test"

import { RoutingEngine } from "../dist/router/engine.js"
import {
  classifyMessage,
  getChannel,
  isNoteOff,
  isNoteOn,
  withChannel,
} from "../dist/router/message.js"
import {
  createDefaultConfig,
  createRoute,
  defaultRouteFilters,
  defaultRouteTransforms,
  normalizeRouterConfig,
  validateRouterConfig,
} from "../dist/router/config.js"
import {
  buildRouterSetup,
  matchingDeviceOutput,
  isProgramPort,
  defaultChannelAssignments,
  MAX_SLOTS,
  MIN_SLOTS,
  sharedAssignments,
} from "../dist/shared/router-setup.js"

const NOTE_ON_CH1 = 0x90
const NOTE_OFF_CH1 = 0x80
const CC_CH1 = 0xb0

function port(id, role, kind = "virtual") {
  return { id, role, kind, deviceName: `Device ${id}`, match: "contains" }
}

function configWith(routes, ports) {
  return { version: 1, ports, routes }
}

test("message helpers read channels and note forms", () => {
  assert.equal(getChannel([0x93, 60, 100]), 4)
  assert.equal(getChannel([0xf8]), null)
  assert.equal(classifyMessage([0x93, 60, 100]), "note")
  assert.equal(classifyMessage([0xb0, 7, 100]), "cc")
  assert.equal(classifyMessage([0xf8]), "clock")
  assert.equal(classifyMessage([0xfa]), "transport")
  assert.equal(classifyMessage([0xf0, 0x7e, 0xf7]), "sysex")
  assert.equal(classifyMessage([0x40]), null)

  assert.ok(isNoteOn([0x90, 60, 1]))
  assert.ok(!isNoteOn([0x90, 60, 0]))
  assert.ok(isNoteOff([0x90, 60, 0]), "note-on with velocity 0 is a release")
  assert.ok(isNoteOff([0x80, 60, 64]))

  assert.deepEqual(withChannel([0x90, 60, 100], 10), [0x99, 60, 100])
  assert.deepEqual(withChannel([0xf8], 10), [0xf8], "system messages have no channel")
})

test("fan-out copies one source to every destination", () => {
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({ id: "a", source: "in", destination: "out-a" }),
        createRoute({ id: "b", source: "in", destination: "out-b" }),
        createRoute({ id: "c", source: "in", destination: "out-c" }),
      ],
      [
        port("in", "input"),
        port("out-a", "output"),
        port("out-b", "output"),
        port("out-c", "output"),
      ],
    ),
  )

  const routed = engine.route("in", [NOTE_ON_CH1, 60, 100])

  assert.equal(routed.length, 3)
  assert.deepEqual(
    routed.map((message) => message.destination),
    ["out-a", "out-b", "out-c"],
  )
  for (const message of routed) {
    assert.deepEqual(message.bytes, [NOTE_ON_CH1, 60, 100])
  }
})

test("channel split sends each channel to its own destination", () => {
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({ id: "s1", source: "device", destination: "out-1", channels: [1] }),
        createRoute({ id: "s2", source: "device", destination: "out-2", channels: [2] }),
        createRoute({
          id: "s3",
          source: "device",
          destination: "out-3",
          channels: [3, 4],
        }),
      ],
      [
        port("device", "input"),
        port("out-1", "output"),
        port("out-2", "output"),
        port("out-3", "output"),
      ],
    ),
  )

  assert.deepEqual(
    engine.route("device", [0x90, 60, 100]).map((message) => message.destination),
    ["out-1"],
  )
  assert.deepEqual(
    engine.route("device", [0x91, 60, 100]).map((message) => message.destination),
    ["out-2"],
  )
  assert.deepEqual(
    engine.route("device", [0x93, 60, 100]).map((message) => message.destination),
    ["out-3"],
  )
  assert.deepEqual(engine.route("device", [0x9a, 60, 100]), [], "channel 11 is unrouted")
})

test("merge folds several sources into a single destination", () => {
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({ id: "a", source: "app-a", destination: "device" }),
        createRoute({ id: "b", source: "app-b", destination: "device" }),
      ],
      [port("app-a", "input"), port("app-b", "input"), port("device", "output")],
    ),
  )

  const fromA = engine.route("app-a", [NOTE_ON_CH1, 60, 100])
  const fromB = engine.route("app-b", [CC_CH1, 7, 64])

  assert.deepEqual(fromA, [
    { routeId: "a", destination: "device", bytes: [NOTE_ON_CH1, 60, 100] },
  ])
  assert.deepEqual(fromB, [
    { routeId: "b", destination: "device", bytes: [CC_CH1, 7, 64] },
  ])
})

test("channel remap rewrites the outgoing channel", () => {
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({
          id: "remap",
          source: "in",
          destination: "out",
          transforms: { ...defaultRouteTransforms(), channelRemap: 10 },
        }),
      ],
      [port("in", "input"), port("out", "output")],
    ),
  )

  assert.deepEqual(engine.route("in", [0x90, 60, 100])[0].bytes, [0x99, 60, 100])
  assert.deepEqual(engine.route("in", [0xb2, 7, 64])[0].bytes, [0xb9, 7, 64])
  assert.deepEqual(engine.route("in", [0xf8])[0].bytes, [0xf8], "clock is left alone")
})

test("transpose tracks held notes so releases match the note that was played", () => {
  const config = configWith(
    [
      createRoute({
        id: "up",
        source: "in",
        destination: "out",
        transforms: { ...defaultRouteTransforms(), transpose: 12 },
      }),
    ],
    [port("in", "input"), port("out", "output")],
  )
  const engine = new RoutingEngine(config)

  assert.deepEqual(engine.route("in", [NOTE_ON_CH1, 60, 100])[0].bytes, [
    NOTE_ON_CH1,
    72,
    100,
  ])
  assert.deepEqual(engine.route("in", [NOTE_OFF_CH1, 60, 0])[0].bytes, [
    NOTE_OFF_CH1,
    72,
    0,
  ])

  // A note-on with velocity 0 keeps its shape, because FreeStyler expects that form.
  engine.route("in", [NOTE_ON_CH1, 60, 100])
  assert.deepEqual(engine.route("in", [NOTE_ON_CH1, 60, 0])[0].bytes, [
    NOTE_ON_CH1,
    72,
    0,
  ])

  assert.equal(
    engine.route("in", [NOTE_ON_CH1, 120, 100]).length,
    0,
    "a note transposed past 127 is dropped",
  )
})

test("changing transpose while a note is held releases the old note", () => {
  const ports = [port("in", "input"), port("out", "output")]
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({
          id: "up",
          source: "in",
          destination: "out",
          transforms: { ...defaultRouteTransforms(), transpose: 12 },
        }),
      ],
      ports,
    ),
  )

  engine.route("in", [NOTE_ON_CH1, 60, 100])

  const releases = engine.setConfig(
    configWith(
      [
        createRoute({
          id: "up",
          source: "in",
          destination: "out",
          transforms: { ...defaultRouteTransforms(), transpose: 0 },
        }),
      ],
      ports,
    ),
  )

  assert.deepEqual(releases, [
    { routeId: "up", destination: "out", bytes: [NOTE_OFF_CH1, 72, 0] },
  ])
})

test("velocity is scaled, offset and clamped into 1-127", () => {
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({
          id: "vel",
          source: "in",
          destination: "out",
          transforms: {
            ...defaultRouteTransforms(),
            velocityScale: 0.5,
            velocityOffset: 10,
          },
        }),
      ],
      [port("in", "input"), port("out", "output")],
    ),
  )

  assert.equal(engine.route("in", [NOTE_ON_CH1, 60, 100])[0].bytes[2], 60)
  assert.equal(engine.route("in", [NOTE_ON_CH1, 61, 127])[0].bytes[2], 74)
  assert.equal(engine.route("in", [NOTE_ON_CH1, 62, 1])[0].bytes[2], 11)
})

test("filters gate note range, controllers and message classes", () => {
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({
          id: "filtered",
          source: "in",
          destination: "out",
          filters: {
            ...defaultRouteFilters(),
            allow: ["note", "cc"],
            noteRange: { min: 36, max: 51 },
            controllers: [7, 11],
          },
        }),
      ],
      [port("in", "input"), port("out", "output")],
    ),
  )

  assert.equal(engine.route("in", [NOTE_ON_CH1, 40, 100]).length, 1)
  assert.equal(engine.route("in", [NOTE_ON_CH1, 60, 100]).length, 0, "outside note range")
  assert.equal(engine.route("in", [CC_CH1, 7, 64]).length, 1)
  assert.equal(engine.route("in", [CC_CH1, 21, 64]).length, 0, "controller not allowed")
  assert.equal(engine.route("in", [0xf8]).length, 0, "clock is not in the allow list")
  assert.equal(engine.route("in", [0xc0, 3]).length, 0, "program change is not allowed")
})

test("sysex passes through untouched", () => {
  const engine = new RoutingEngine(
    configWith(
      [createRoute({ id: "sysex", source: "in", destination: "out" })],
      [port("in", "input"), port("out", "output")],
    ),
  )

  const bytes = [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0d, 0x00, 0x7f, 0xf7]
  assert.deepEqual(engine.route("in", bytes)[0].bytes, bytes)
})

test("panic releases held notes and silences every destination in use", () => {
  const engine = new RoutingEngine(
    configWith(
      [
        createRoute({ id: "a", source: "in", destination: "out-a" }),
        createRoute({ id: "b", source: "in", destination: "out-b" }),
      ],
      [port("in", "input"), port("out-a", "output"), port("out-b", "output")],
    ),
  )

  engine.route("in", [NOTE_ON_CH1, 60, 100])
  const messages = engine.panic()

  assert.deepEqual(messages[0].bytes, [NOTE_OFF_CH1, 60, 0])
  assert.equal(
    messages.filter((message) => message.bytes[1] === 123).length,
    32,
    "All Notes Off on 16 channels of both destinations",
  )
})

test("disabled routes carry nothing", () => {
  const engine = new RoutingEngine(
    configWith(
      [createRoute({ id: "off", source: "in", destination: "out", enabled: false })],
      [port("in", "input"), port("out", "output")],
    ),
  )

  assert.deepEqual(engine.route("in", [NOTE_ON_CH1, 60, 100]), [])
})

test("validation rejects unknown ports, wrong roles and empty allow lists", () => {
  const errors = validateRouterConfig(
    configWith(
      [
        createRoute({ id: "ghost", source: "nope", destination: "out" }),
        createRoute({ id: "backwards", source: "out", destination: "in" }),
        createRoute({
          id: "silent",
          source: "in",
          destination: "out",
          filters: { ...defaultRouteFilters(), allow: [] },
        }),
      ],
      [port("in", "input"), port("out", "output")],
    ),
  )

  assert.ok(errors.some((error) => error.includes('unknown source port "nope"')))
  assert.ok(errors.some((error) => error.includes('uses output port "out" as a source')))
  assert.ok(errors.some((error) => error.includes("blocks every message type")))
})

test("validation catches feedback loops between ports", () => {
  const ports = [
    {
      id: "a-in",
      role: "input",
      kind: "virtual",
      deviceName: "Loop A",
      match: "contains",
    },
    {
      id: "a-out",
      role: "output",
      kind: "virtual",
      deviceName: "Loop A",
      match: "contains",
    },
    {
      id: "b-in",
      role: "input",
      kind: "virtual",
      deviceName: "Loop B",
      match: "contains",
    },
    {
      id: "b-out",
      role: "output",
      kind: "virtual",
      deviceName: "Loop B",
      match: "contains",
    },
  ]

  const errors = validateRouterConfig(
    configWith(
      [
        createRoute({ id: "forward", source: "a-in", destination: "b-out" }),
        createRoute({ id: "back", source: "b-in", destination: "a-out" }),
      ],
      ports,
    ),
  )

  assert.ok(
    errors.some((error) => error.startsWith("Feedback loop")),
    errors.join(" | "),
  )
})

test("the default configuration is only missing its physical device names", () => {
  const withPlaceholders = validateRouterConfig(createDefaultConfig())
  assert.ok(withPlaceholders.every((error) => error.includes("placeholder")))

  const configured = createDefaultConfig({
    deviceInput: "APC mini mk2",
    deviceOutput: "APC mini mk2",
  })
  assert.deepEqual(validateRouterConfig(configured), [])
})

test("normalization repairs hand-edited configuration files", () => {
  const config = normalizeRouterConfig({
    ports: [{ id: "in", role: "input", kind: "nonsense", deviceName: "X" }],
    routes: [
      {
        id: "r",
        source: "in",
        destination: "out",
        channels: [0, 3, 3, 99, 2],
        filters: {
          allow: ["note", "not-a-class"],
          noteRange: { min: 200, max: -5 },
          controllers: [7, 7, 300],
          velocityRange: { max: 10, min: 90 },
        },
        transforms: { channelRemap: 99, transpose: 400, velocityScale: 9 },
      },
    ],
  })

  const [route] = config.routes
  assert.equal(config.ports[0].kind, "hardware", "unknown kinds fall back to hardware")
  assert.deepEqual(route.channels, [2, 3], "out-of-range channels are discarded")
  assert.deepEqual(route.filters.allow, ["note"])
  assert.deepEqual(route.filters.noteRange, { min: 0, max: 127 })
  assert.deepEqual(
    route.filters.controllers,
    [7],
    "out-of-range controllers are discarded, not clamped onto a real controller",
  )
  assert.deepEqual(
    route.filters.velocityRange,
    { min: 10, max: 90 },
    "range is reordered",
  )
  assert.equal(route.transforms.channelRemap, 16)
  assert.equal(route.transforms.transpose, 48)
  assert.equal(route.transforms.velocityScale, 4)
})

// ---------------------------------------------------------------- the guided setup

test("the setup folds every program into the device and answers them all", () => {
  const config = buildRouterSetup({
    writeTo: "APC mini mk2",
    listenTo: "APC mini mk2",
    channelsPerProgram: sharedAssignments(3),
  })

  assert.deepEqual(
    validateRouterConfig(config),
    [],
    "the two directions must not read as a feedback loop",
  )
  assert.equal(config.ports.filter((port) => port.kind === "virtual").length, 6)
  assert.equal(config.routes.length, 6)

  const engine = new RoutingEngine(config)
  assert.deepEqual(
    engine.route("app-2", [CC_CH1, 7, 64]).map((message) => message.destination),
    ["device-out"],
    "everything the programs write lands on the one device",
  )
  assert.deepEqual(
    engine.route("device-in", [NOTE_ON_CH1, 60, 100]).map((m) => m.destination),
    ["dest-1", "dest-2", "dest-3"],
    "the device cannot address one program, so its answers reach all of them",
  )
})

test("channels split what each program receives, never what it sends", () => {
  const config = buildRouterSetup({
    writeTo: "APC mini mk2",
    listenTo: "APC mini mk2",
    channelsPerProgram: [[1], [2], [3, 4]],
  })

  assert.deepEqual(validateRouterConfig(config), [])

  const engine = new RoutingEngine(config)
  assert.deepEqual(
    engine.route("device-in", [0x90, 60, 100]).map((message) => message.destination),
    ["dest-1"],
  )
  assert.deepEqual(
    engine.route("device-in", [0x93, 60, 100]).map((message) => message.destination),
    ["dest-3"],
    "channel 4 also reaches the program that claims 3 and 4",
  )
  assert.deepEqual(
    engine.route("device-in", [0x9f, 60, 100]),
    [],
    "channel 16 is unrouted",
  )
  assert.deepEqual(
    engine.route("app-3", [0x9f, 60, 100]).map((message) => message.destination),
    ["device-out"],
    "a program answering on another channel is not silently dropped",
  )
})

test("an empty channel list means that program takes everything", () => {
  const config = buildRouterSetup({
    listenTo: "Device",
    channelsPerProgram: [[], [5]],
  })
  const engine = new RoutingEngine(config)

  const routed = engine.route("device-in", [0x9a, 60, 100]).map((m) => m.destination)
  assert.deepEqual(routed, ["dest-1"], "the omni program still receives channel 11")
})

test("a device that exists in one direction only builds a one-way setup", () => {
  const writeOnly = buildRouterSetup({
    writeTo: "Device",
    channelsPerProgram: sharedAssignments(3),
  })
  assert.deepEqual(validateRouterConfig(writeOnly), [])
  assert.equal(writeOnly.routes.length, 3)
  assert.equal(writeOnly.ports.filter((port) => port.role === "output").length, 1)

  const listenOnly = buildRouterSetup({
    listenTo: "  ",
    channelsPerProgram: sharedAssignments(3),
  })
  assert.deepEqual(listenOnly.ports, [], "a blank device name is no device at all")
  assert.deepEqual(listenOnly.routes, [])
})

test("program counts are clamped to a range the setup can actually build", () => {
  const many = buildRouterSetup({
    writeTo: "Device",
    channelsPerProgram: sharedAssignments(99),
  })
  const few = buildRouterSetup({
    writeTo: "Device",
    channelsPerProgram: sharedAssignments(0),
  })

  assert.equal(many.routes.length, MAX_SLOTS)
  assert.equal(few.routes.length, MIN_SLOTS)
  assert.deepEqual(defaultChannelAssignments(3), [[1], [2], [3]])
  assert.deepEqual(sharedAssignments(3), [[], [], []])
})

test("no virtual port name is contained in another one", () => {
  // Ports resolve by substring, so a port named after another would also satisfy that
  // other definition and the two could swap devices under the router's feet.
  const config = buildRouterSetup({
    writeTo: "Device",
    listenTo: "Device",
    channelsPerProgram: defaultChannelAssignments(MAX_SLOTS),
  })
  const names = config.ports
    .filter((port) => port.kind === "virtual")
    .map((port) => port.deviceName.toLowerCase())

  for (const name of names) {
    const clash = names.filter((other) => other.includes(name))
    assert.deepEqual(clash, [name], `"${name}" is ambiguous against ${clash.join(", ")}`)
  }
})

test("device pairing handles exact names and Windows numbered endpoints without guessing", () => {
  assert.equal(
    matchingDeviceOutput("APC mini mk2", ["APC mini mk2 2", "APC mini mk2"]),
    "APC mini mk2",
  )
  assert.equal(
    matchingDeviceOutput("MIDIIN2 (Controller)", [
      "MIDIOUT3 (Controller)",
      "MIDIOUT2 (Controller)",
    ]),
    "MIDIOUT2 (Controller)",
  )
  assert.equal(
    matchingDeviceOutput("MIDIIN2 (Controller)", ["MIDIOUT3 (Controller)"]),
    "",
  )
  assert.equal(matchingDeviceOutput("Controller", ["Other Controller"]), "")
  assert.equal(
    matchingDeviceOutput("MIDIIN (Controller)", [
      "MIDIOUT (Controller)",
      "midiout (controller)",
    ]),
    "",
  )
  assert.equal(matchingDeviceOutput("Unplugged", []), "")
  assert.ok(isProgramPort("Router Entrada 1"))
  assert.ok(isProgramPort("Router Salida 8 2"))
  assert.ok(!isProgramPort("APC mini mk2"))
})

test("sharing preserves MIDI messages in both directions for two through eight programs", () => {
  const messages = [
    [0x90, 60, 100],
    [0x80, 60, 0],
    [0xbf, 7, 64],
    [0xcf, 10],
    [0xef, 0, 64],
    [0xf8],
    [0xfa],
    [0xf0, 0x7d, 1, 0xf7],
  ]
  for (const count of [2, 3, MAX_SLOTS]) {
    const setup = buildRouterSetup({
      listenTo: "MIDIIN2 (Device)",
      writeTo: "MIDIOUT2 (Device)",
      channelsPerProgram: sharedAssignments(count),
    })
    assert.deepEqual(validateRouterConfig(setup), [])
    assert.ok(
      setup.ports
        .filter((port) => port.kind === "hardware")
        .every((port) => port.match === "exact"),
    )
    const engine = new RoutingEngine(setup)
    for (const bytes of messages) {
      const copies = engine.route("device-in", bytes)
      assert.equal(copies.length, count)
      assert.equal(new Set(copies.map((copy) => copy.destination)).size, count)
      assert.ok(
        copies.every((copy) => JSON.stringify(copy.bytes) === JSON.stringify(bytes)),
      )
      for (let slot = 1; slot <= count; slot++) {
        const replies = engine.route("app-" + slot, bytes)
        assert.equal(replies.length, 1)
        assert.equal(replies[0].destination, "device-out")
        assert.deepEqual(replies[0].bytes, bytes)
      }
    }
  }
})

test("duplicate channel selections never accidentally turn a filter into omni", () => {
  const setup = buildRouterSetup({
    listenTo: "Device",
    channelsPerProgram: [Array(16).fill(1), []],
  })
  const engine = new RoutingEngine(setup)
  assert.deepEqual(
    engine.route("device-in", [0x91, 60, 100]).map((m) => m.destination),
    ["dest-2"],
  )
})
