import { createRoute } from "./router-config.js"
import {
  defaultChannelAssignments,
  MAX_SLOTS,
  MIN_SLOTS,
  PROGRAM_RECEIVE_PREFIX,
} from "./router-setup.js"
import type { PortDefinition, PortRole, RouterConfig } from "./router-types.js"

function nextId(ids: readonly string[], prefix: string): string {
  let index = 1
  while (ids.includes(`${prefix}-${index}`)) index += 1
  return `${prefix}-${index}`
}

export function nextRouterPortId(
  ports: readonly PortDefinition[],
  role: PortRole,
): string {
  return nextId(
    ports.map((port) => port.id),
    role === "input" ? "in" : "out",
  )
}

export function createDraftRoute(config: RouterConfig) {
  const source = config.ports.find((port) => port.role === "input")
  const destination = config.ports.find((port) => port.role === "output")
  if (!source || !destination) return null
  const id = nextId(
    config.routes.map((route) => route.id),
    "route",
  )
  return createRoute({
    id,
    name: "Nueva ruta",
    source: source.id,
    destination: destination.id,
  })
}

/** Prefill the guided setup with the saved device, program count and channel split. */
export function readRouterSetup(config?: RouterConfig) {
  const listenTo =
    config?.ports.find((port) => port.kind === "hardware" && port.role === "input")
      ?.deviceName ?? ""
  const writeTo =
    config?.ports.find((port) => port.kind === "hardware" && port.role === "output")
      ?.deviceName ?? ""
  const receiving =
    config?.ports.filter(
      (port) =>
        port.kind === "virtual" &&
        port.role === "output" &&
        port.deviceName.startsWith(PROGRAM_RECEIVE_PREFIX + " "),
    ) ?? []
  const slots = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, receiving.length))
  const defaults = defaultChannelAssignments(MAX_SLOTS)
  const routes = Array.from({ length: slots }, (_, index) => {
    const port = receiving.find(
      (port) => port.deviceName === `${PROGRAM_RECEIVE_PREFIX} ${index + 1}`,
    )
    return config?.routes.find(
      (route) =>
        route.destination === port?.id &&
        config.ports.some((port) => port.id === route.source && port.kind === "hardware"),
    )
  })
  const perChannel = routes.some((route) => route && route.channels !== "omni")
  const channels = defaults.map((fallback, index) => {
    const selection = routes[index]?.channels
    return !perChannel || selection === undefined
      ? fallback
      : selection === "omni"
        ? []
        : [...selection]
  })
  return { listenTo, writeTo, slots, perChannel, channels }
}
