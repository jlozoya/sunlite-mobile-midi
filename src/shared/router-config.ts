import {
  ALL_MESSAGE_CLASSES,
  type PortDefinition,
  type Route,
  type RouteFilters,
  type RouteTransforms,
  type RouterConfig,
} from "./router-types.js"

/** Placeholder written by `init` when the physical device is not known yet. */
export const DEVICE_PLACEHOLDER = "<select a MIDI device>"

export function defaultRouteFilters(): RouteFilters {
  return {
    allow: [...ALL_MESSAGE_CLASSES],
    noteRange: { min: 0, max: 127 },
    controllers: null,
    velocityRange: { min: 0, max: 127 },
  }
}

export function defaultRouteTransforms(): RouteTransforms {
  return {
    channelRemap: null,
    transpose: 0,
    velocityScale: 1,
    velocityOffset: 0,
  }
}

export function createRoute(
  route: Partial<Route> & Pick<Route, "id" | "source" | "destination">,
): Route {
  return {
    id: route.id,
    name: route.name ?? route.id,
    enabled: route.enabled ?? true,
    source: route.source,
    destination: route.destination,
    channels: route.channels ?? "omni",
    filters: { ...defaultRouteFilters(), ...route.filters },
    transforms: { ...defaultRouteTransforms(), ...route.transforms },
  }
}

/**
 * Semantic problems that would make the router misbehave. An empty array means the
 * configuration is safe to run.
 */
export function validateRouterConfig(config: RouterConfig): string[] {
  const errors: string[] = []
  const portsById = new Map<string, PortDefinition>()

  for (const port of config.ports) {
    if (portsById.has(port.id)) {
      errors.push(`Duplicate port id "${port.id}".`)
      continue
    }
    if (port.deviceName.trim() === "") {
      errors.push(`Port "${port.id}" has no device name.`)
    }
    if (port.deviceName === DEVICE_PLACEHOLDER) {
      errors.push(
        `Port "${port.id}" still holds the placeholder device name. Run "list" and set a real device.`,
      )
    }
    portsById.set(port.id, port)
  }

  const seenRouteIds = new Set<string>()

  for (const route of config.routes) {
    if (seenRouteIds.has(route.id)) errors.push(`Duplicate route id "${route.id}".`)
    seenRouteIds.add(route.id)

    const source = portsById.get(route.source)
    const destination = portsById.get(route.destination)

    if (!source)
      errors.push(`Route "${route.id}" points at unknown source port "${route.source}".`)
    else if (source.role !== "input")
      errors.push(`Route "${route.id}" uses output port "${route.source}" as a source.`)

    if (!destination)
      errors.push(
        `Route "${route.id}" points at unknown destination port "${route.destination}".`,
      )
    else if (destination.role !== "output")
      errors.push(
        `Route "${route.id}" uses input port "${route.destination}" as a destination.`,
      )

    if (route.filters.allow.length === 0) {
      errors.push(
        `Route "${route.id}" blocks every message type and would never pass anything.`,
      )
    }
  }

  errors.push(...findFeedbackLoops(config, portsById))
  return errors
}

/**
 * A loopMIDI port called "X" is exposed as both an input and an output, so a chain of
 * routes can close on itself and flood the driver. The check runs on device names, not
 * port ids, because two definitions can name the same device.
 */
function findFeedbackLoops(
  config: RouterConfig,
  portsById: Map<string, PortDefinition>,
): string[] {
  const graph = new Map<string, Set<string>>()

  for (const route of config.routes) {
    if (!route.enabled) continue
    const source = portsById.get(route.source)
    const destination = portsById.get(route.destination)
    if (!source || !destination) continue

    const from = source.deviceName.toLowerCase()
    const to = destination.deviceName.toLowerCase()
    const edges = graph.get(from) ?? new Set<string>()
    edges.add(to)
    graph.set(from, edges)
  }

  const errors: string[] = []
  const visited = new Set<string>()
  const stack: string[] = []

  const walk = (node: string) => {
    const cycleStart = stack.indexOf(node)
    if (cycleStart !== -1) {
      const cycle = [...stack.slice(cycleStart), node].join(" -> ")
      errors.push(`Feedback loop between MIDI ports: ${cycle}.`)
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    stack.push(node)
    for (const next of graph.get(node) ?? []) walk(next)
    stack.pop()
  }

  for (const node of graph.keys()) walk(node)
  return [...new Set(errors)]
}
