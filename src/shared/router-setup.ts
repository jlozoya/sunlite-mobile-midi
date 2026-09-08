/**
 * Guided setups for the two things people actually want from a MIDI router.
 *
 * The panel used to expose the underlying model — ports, then routes that reference
 * them — which meant the first thing you could do was create a route pointing at
 * nothing. These builders turn a one-sentence intent into a whole working
 * configuration, and the result stays editable afterwards.
 */
import {
  ALL_MESSAGE_CLASSES,
  type PortDefinition,
  type Route,
  type RouterConfig,
} from "./router-types.js"

/** Names other applications will see in their own MIDI device lists. */
export const MERGE_PORT_PREFIX = "Router Entrada"
export const SPLIT_PORT_PREFIX = "Router Salida"

export const MIN_SLOTS = 2
export const MAX_SLOTS = 8

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

/**
 * Several applications write into one physical device.
 *
 * Each application gets its own virtual port; the router is the only thing that opens
 * the device, which is what makes this work on Windows.
 */
export function buildMergeConfig(deviceName: string, slotCount: number): RouterConfig {
  const slots = clampSlots(slotCount)

  const inputs: PortDefinition[] = Array.from({ length: slots }, (_, index) => ({
    id: `app-${index + 1}`,
    role: "input",
    kind: "virtual",
    deviceName: `${MERGE_PORT_PREFIX} ${index + 1}`,
    match: "contains",
  }))

  const output: PortDefinition = {
    id: "device-out",
    role: "output",
    kind: "hardware",
    deviceName,
    match: "contains",
  }

  const routes = inputs.map((port, index) =>
    baseRoute(
      `merge-${index + 1}`,
      `${port.deviceName} → ${deviceName}`,
      port.id,
      output.id,
    ),
  )

  return { version: 1, ports: [...inputs, output], routes }
}

/**
 * One physical device is split across several applications by MIDI channel.
 *
 * `channelsPerSlot[i]` is the channel list that reaches destination `i`; an empty list
 * means that destination takes everything.
 */
export function buildSplitConfig(
  deviceName: string,
  channelsPerSlot: readonly number[][],
): RouterConfig {
  const slots = clampSlots(channelsPerSlot.length)
  const assignments = channelsPerSlot.slice(0, slots)

  const input: PortDefinition = {
    id: "device-in",
    role: "input",
    kind: "hardware",
    deviceName,
    match: "contains",
  }

  const outputs: PortDefinition[] = assignments.map((_, index) => ({
    id: `dest-${index + 1}`,
    role: "output",
    kind: "virtual",
    deviceName: `${SPLIT_PORT_PREFIX} ${index + 1}`,
    match: "contains",
  }))

  const routes = outputs.map((port, index) => {
    const channels = assignments[index].filter(
      (channel) => Number.isInteger(channel) && channel >= 1 && channel <= 16,
    )
    const route = baseRoute(
      `split-${index + 1}`,
      channels.length === 0
        ? `${deviceName} → ${port.deviceName}`
        : `${deviceName} CH ${channels.join(", ")} → ${port.deviceName}`,
      input.id,
      port.id,
    )
    return channels.length === 0 || channels.length === 16
      ? route
      : { ...route, channels }
  })

  return { version: 1, ports: [input, ...outputs], routes }
}

/** Default channel assignment: one channel per destination, starting at 1. */
export function defaultChannelAssignments(slotCount: number): number[][] {
  return Array.from({ length: clampSlots(slotCount) }, (_, index) => [index + 1])
}
