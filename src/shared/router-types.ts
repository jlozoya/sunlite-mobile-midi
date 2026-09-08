/**
 * MIDI router types shared by the Electron main process, the router engine and the UI.
 *
 * The router solves two problems the controller itself does not:
 *
 *   fan-out : one input is copied to several destinations, optionally split by channel
 *   merge   : several inputs are folded into a single output port, so only the router
 *             ever opens the physical device (Windows MIDI drivers are frequently
 *             single-client)
 */

/** Message families a route can allow or block. */
export type MessageClass =
  | "note"
  | "cc"
  | "programChange"
  | "pitchBend"
  | "aftertouch"
  | "sysex"
  | "clock"
  | "transport"
  | "systemCommon"

export const ALL_MESSAGE_CLASSES: readonly MessageClass[] = [
  "note",
  "cc",
  "programChange",
  "pitchBend",
  "aftertouch",
  "sysex",
  "clock",
  "transport",
  "systemCommon",
]

/** Human labels for the UI, in the language the rest of the interface uses. */
export const MESSAGE_CLASS_LABELS: Record<MessageClass, string> = {
  note: "Notas",
  cc: "CC",
  programChange: "Program Change",
  pitchBend: "Pitch Bend",
  aftertouch: "Aftertouch",
  sysex: "SysEx",
  clock: "Clock",
  transport: "Transporte",
  systemCommon: "Sistema",
}

/** `"omni"` accepts every channel; otherwise a list of 1-based MIDI channels. */
export type ChannelSelection = "omni" | number[]

export type NumericRange = { min: number; max: number }

export type RouteFilters = {
  /** Message families that survive the route. */
  allow: MessageClass[]
  /** Note range, inclusive. Applies to note on/off and polyphonic aftertouch. */
  noteRange: NumericRange
  /** Allowed controller numbers, or `null` for every controller. */
  controllers: number[] | null
  /** Note-on velocity gate, inclusive. Note-offs are never gated by velocity. */
  velocityRange: NumericRange
}

export type RouteTransforms = {
  /** Rewrite the outgoing channel (1-16), or `null` to keep the incoming one. */
  channelRemap: number | null
  /** Semitones added to note numbers. Notes pushed outside 0-127 are dropped. */
  transpose: number
  /** Multiplier applied to note-on velocity before `velocityOffset`. */
  velocityScale: number
  /** Constant added to note-on velocity after `velocityScale`. */
  velocityOffset: number
}

export type Route = {
  id: string
  name: string
  enabled: boolean
  /** `id` of an input port definition. */
  source: string
  /** `id` of an output port definition. */
  destination: string
  channels: ChannelSelection
  filters: RouteFilters
  transforms: RouteTransforms
}

export type PortRole = "input" | "output"

/**
 * `hardware` ports must already exist. `virtual` ports are created on demand
 * through the loopMIDI bridge before the router opens them.
 */
export type PortKind = "hardware" | "virtual"

export type PortDefinition = {
  id: string
  role: PortRole
  kind: PortKind
  /** Device name as Windows exposes it. */
  deviceName: string
  /** `contains` tolerates the numeric suffixes Windows appends to duplicate names. */
  match: "exact" | "contains"
}

export type RouterConfig = {
  version: 1
  ports: PortDefinition[]
  routes: Route[]
}

/** Live state of one configured port. */
export type PortStatus = {
  id: string
  role: PortRole
  deviceName: string
  /** The device name Windows actually reported, once resolved. */
  resolvedName: string | null
  connected: boolean
  error: string | null
}

export type RouterStats = {
  received: number
  sent: number
  dropped: number
  undelivered: number
}

/** One line of the live MIDI monitor. */
export type RouterMonitorEvent = {
  at: number
  direction: "in" | "out"
  portId: string
  routeId: string | null
  channel: number | null
  text: string
}

/** Everything the Router panel needs to render. */
export type RouterState = {
  running: boolean
  config: RouterConfig
  ports: PortStatus[]
  stats: RouterStats
  /** Result of the last virtual-port provisioning attempt, or `null` before starting. */
  provisioning: { ok: boolean; message: string } | null
  /** Problems that stop the router from starting at all. */
  errors: string[]
  /** Things that will probably misbehave but do not block starting. */
  warnings: string[]
  /** MIDI devices Windows currently exposes, for the port pickers. */
  devices: { inputs: string[]; outputs: string[] }
}
