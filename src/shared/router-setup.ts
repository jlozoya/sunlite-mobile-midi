/**
 * The guided setup: one sentence in, a whole working configuration out.
 *
 * The panel used to expose the underlying model — ports, then routes that reference
 * them — which meant the first thing you could do was create a route pointing at
 * nothing. This builder turns an intent into a configuration that runs, and the result
 * stays editable afterwards.
 *
 * There is a single setup because there is a single shape. Merging several programs
 * into one device and splitting one device across several programs looked like two
 * problems while each ran one way; built in both directions they generate the very same
 * topology — N programs on one side, one device on the other — and the only thing left
 * between them is whether a program receives everything the device sends or just its
 * own MIDI channel. That is a question, not a second setup.
 *
 * Each program gets two virtual ports rather than one shared port, because a loopMIDI
 * port hands everything written to it back to every listener, the writer included: one
 * port carrying both directions is a feedback loop. The two names are also unrelated
 * rather than one being a suffix of the other, since ports resolve by substring and
 * "Router Entrada 1 Retorno" would satisfy a definition asking for "Router Entrada 1".
 */
import {
  ALL_MESSAGE_CLASSES,
  type PortDefinition,
  type Route,
  type RouterConfig,
} from "./router-types.js"

/** The program writes here; in its own MIDI settings this is an output. */
export const PROGRAM_SEND_PREFIX = "Router Entrada"
/** The program listens here; in its own MIDI settings this is an input. */
export const PROGRAM_RECEIVE_PREFIX = "Router Salida"

export const MIN_SLOTS = 2
export const MAX_SLOTS = 8

/** Pair only unambiguous endpoints; preserve Windows MIDIIN2/MIDIOUT2 port numbers. */
export function matchingDeviceOutput(input: string, outputs: readonly string[]): string {
  const key = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/^midi(?:in|out)(\d*)\s*(?=\()/, "midi$1 ")
  const exact = outputs.filter((name) => name.toLowerCase() === input.toLowerCase())
  if (exact.length === 1) return exact[0]
  const matches = outputs.filter((name) => key(name) === key(input))
  return matches.length === 1 ? matches[0] : ""
}

/** Our program endpoints must never become the shared device. */
export function isProgramPort(name: string): boolean {
  return /^Router (Entrada|Salida) \d+(?:\s|$)/i.test(name)
}

/** Hide the controller bridge, including numeric suffixes added by Windows. */
export function isReservedMidiPort(name: string, reserved: readonly string[]): boolean {
  const candidate = name.trim().toLowerCase()
  return reserved.some((entry) => {
    const port = entry.trim().toLowerCase()
    if (!port) return false
    return (
      candidate === port ||
      (candidate.startsWith(port + " ") &&
        /^\d+$/.test(candidate.slice(port.length).trim()))
    )
  })
}

export type RouterSetup = {
  /**
   * Device the router writes into, as the MIDI output list exposes it. Everything the
   * programs send lands here. Absent leaves the programs listening only, which is all a
   * device without a MIDI input can do.
   */
  writeTo?: string
  /**
   * Device the router listens to, as the MIDI input list exposes it. Windows frequently
   * names the two halves of one device differently ("MIDIIN2 (X)" against "MIDIOUT2
   * (X)"), so this is asked for separately rather than assumed. Absent leaves the
   * programs writing only.
   */
  listenTo?: string
  /**
   * One entry per program, in order: the MIDI channels it receives from the device. An
   * empty list means that program takes everything, which is every entry when nothing
   * is being split by channel.
   */
  channelsPerProgram: readonly number[][]
}

function baseRoute(id: string, name: string, source: string, destination: string): Route {
  return {
    id,
    name,
    enabled: true,
    source,
    destination,
    channels: "omni",
    filters: {
      allow: [...ALL_MESSAGE_CLASSES],
      noteRange: { min: 0, max: 127 },
      controllers: null,
      velocityRange: { min: 0, max: 127 },
    },
    transforms: {
      channelRemap: null,
      transpose: 0,
      velocityScale: 1,
      velocityOffset: 0,
    },
  }
}

function clampSlots(count: number): number {
  if (!Number.isFinite(count)) return MIN_SLOTS
  return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, Math.round(count)))
}

function deviceName(value: string | undefined): string | null {
  const name = value?.trim() ?? ""
  return name === "" ? null : name
}

function programPorts(
  slots: number,
  role: PortDefinition["role"],
  idPrefix: string,
  namePrefix: string,
): PortDefinition[] {
  return Array.from({ length: slots }, (_, index) => ({
    id: `${idPrefix}-${index + 1}`,
    role,
    kind: "virtual",
    deviceName: `${namePrefix} ${index + 1}`,
    match: "contains",
  }))
}

/**
 * Several programs on one side, one device on the other, in both directions.
 *
 * Everything the programs send is folded into the device, which only the router ever
 * opens — the point of the whole thing on Windows, where MIDI drivers are frequently
 * single-client and the second program to ask for a port simply fails. What the device
 * sends comes back the other way, filtered per program by channel or not at all.
 *
 * The return direction is deliberately unfiltered: a program answering on a channel
 * other than the one it was given would otherwise be dropped in silence, which is a far
 * worse failure than the crosstalk it avoids.
 */
export function buildRouterSetup(setup: RouterSetup): RouterConfig {
  const slots = clampSlots(setup.channelsPerProgram.length)
  const assignments = setup.channelsPerProgram.slice(0, slots)
  const writeTo = deviceName(setup.writeTo)
  const listenTo = deviceName(setup.listenTo)

  const ports: PortDefinition[] = []
  const routes: Route[] = []

  if (writeTo) {
    const device: PortDefinition = {
      id: "device-out",
      role: "output",
      kind: "hardware",
      deviceName: writeTo,
      match: "exact",
    }
    const sends = programPorts(slots, "input", "app", PROGRAM_SEND_PREFIX)

    ports.push(...sends, device)
    routes.push(
      ...sends.map((port, index) =>
        baseRoute(
          `to-device-${index + 1}`,
          `${port.deviceName} → ${writeTo}`,
          port.id,
          device.id,
        ),
      ),
    )
  }

  if (listenTo) {
    const device: PortDefinition = {
      id: "device-in",
      role: "input",
      kind: "hardware",
      deviceName: listenTo,
      match: "exact",
    }
    const receives = programPorts(slots, "output", "dest", PROGRAM_RECEIVE_PREFIX)

    ports.push(device, ...receives)
    routes.push(
      ...receives.map((port, index) => {
        const channels = [...new Set(assignments[index] ?? [])].filter(
          (channel) => Number.isInteger(channel) && channel >= 1 && channel <= 16,
        )
        const route = baseRoute(
          `to-program-${index + 1}`,
          channels.length === 0
            ? `${listenTo} → ${port.deviceName}`
            : `${listenTo} CH ${channels.join(", ")} → ${port.deviceName}`,
          device.id,
          port.id,
        )
        return channels.length === 0 || channels.length === 16
          ? route
          : { ...route, channels }
      }),
    )
  }

  return { version: 1, ports, routes }
}

/** Every program takes everything the device sends. */
export function sharedAssignments(slotCount: number): number[][] {
  return Array.from({ length: clampSlots(slotCount) }, () => [])
}

/** One channel per program, starting at 1. */
export function defaultChannelAssignments(slotCount: number): number[][] {
  return Array.from({ length: clampSlots(slotCount) }, (_, index) => [index + 1])
}
