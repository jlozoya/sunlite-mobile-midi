/**
 * Shared types for the MIDI router.
 *
 * The router solves two problems at once:
 *
 *   fan-out : one input is copied to several destinations, optionally split by channel
 *   merge   : several inputs are folded into a single output port, so only the router
 *             ever opens the physical device (Windows MIDI drivers are frequently
 *             single-client and refuse a second application)
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

/** A message after filtering and transformation, addressed to one output port. */
export type RoutedMessage = {
  routeId: string
  destination: string
  bytes: number[]
}
