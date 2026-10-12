/**
 * Configuration: defaults, defensive normalization, validation and disk persistence.
 *
 * Everything here is pure except `loadRouterConfig` / `saveRouterConfig`, so the
 * validation rules can be tested directly.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { clamp } from "./message.js"
import {
  DEVICE_PLACEHOLDER,
  createRoute,
  defaultRouteFilters,
} from "../shared/router-config.js"
export {
  DEVICE_PLACEHOLDER,
  createRoute,
  defaultRouteFilters,
  defaultRouteTransforms,
  validateRouterConfig,
} from "../shared/router-config.js"
import {
  ALL_MESSAGE_CLASSES,
  type ChannelSelection,
  type MessageClass,
  type NumericRange,
  type PortDefinition,
  type Route,
  type RouterConfig,
} from "./types.js"

export const CONFIG_FILE_NAME = "midi-router.config.json"

/**
 * A configuration that covers both halves of the problem out of the box:
 * three applications merged into one physical output, and the physical input split
 * by channel into three virtual ports.
 */
export function createDefaultConfig(options?: {
  deviceOutput?: string
  deviceInput?: string
}): RouterConfig {
  const deviceOutput = options?.deviceOutput ?? DEVICE_PLACEHOLDER
  const deviceInput = options?.deviceInput ?? DEVICE_PLACEHOLDER

  const ports: PortDefinition[] = [
    {
      id: "app-a",
      role: "input",
      kind: "virtual",
      deviceName: "Router App A",
      match: "contains",
    },
    {
      id: "app-b",
      role: "input",
      kind: "virtual",
      deviceName: "Router App B",
      match: "contains",
    },
    {
      id: "app-c",
      role: "input",
      kind: "virtual",
      deviceName: "Router App C",
      match: "contains",
    },
    {
      id: "device-out",
      role: "output",
      kind: "hardware",
      deviceName: deviceOutput,
      match: "contains",
    },
    {
      id: "device-in",
      role: "input",
      kind: "hardware",
      deviceName: deviceInput,
      match: "contains",
    },
    {
      id: "split-1",
      role: "output",
      kind: "virtual",
      deviceName: "Router Split 1",
      match: "contains",
    },
    {
      id: "split-2",
      role: "output",
      kind: "virtual",
      deviceName: "Router Split 2",
      match: "contains",
    },
    {
      id: "split-3",
      role: "output",
      kind: "virtual",
      deviceName: "Router Split 3",
      match: "contains",
    },
  ]

  const routes: Route[] = [
    createRoute({
      id: "merge-a",
      name: "App A -> device",
      source: "app-a",
      destination: "device-out",
    }),
    createRoute({
      id: "merge-b",
      name: "App B -> device",
      source: "app-b",
      destination: "device-out",
    }),
    createRoute({
      id: "merge-c",
      name: "App C -> device",
      source: "app-c",
      destination: "device-out",
    }),
    createRoute({
      id: "split-ch1",
      name: "Device CH 1 -> Split 1",
      source: "device-in",
      destination: "split-1",
      channels: [1],
    }),
    createRoute({
      id: "split-ch2",
      name: "Device CH 2 -> Split 2",
      source: "device-in",
      destination: "split-2",
      channels: [2],
    }),
    createRoute({
      id: "split-ch3",
      name: "Device CH 3 -> Split 3",
      source: "device-in",
      destination: "split-3",
      channels: [3],
    }),
  ]

  return { version: 1, ports, routes }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeRange(value: unknown, fallback: NumericRange): NumericRange {
  const record = asRecord(value)
  const min = clamp(Math.round(Number(record.min ?? fallback.min)), 0, 127)
  const max = clamp(Math.round(Number(record.max ?? fallback.max)), 0, 127)
  return min <= max ? { min, max } : { min: max, max: min }
}

function normalizeChannels(value: unknown): ChannelSelection {
  if (value === "omni" || value === undefined || value === null) return "omni"
  if (!Array.isArray(value)) return "omni"

  const channels = [
    ...new Set(
      value
        .map((entry) => Math.round(Number(entry)))
        .filter((entry) => Number.isFinite(entry) && entry >= 1 && entry <= 16),
    ),
  ].sort((left, right) => left - right)

  return channels.length === 0 || channels.length === 16 ? "omni" : channels
}

function normalizeMessageClasses(value: unknown): MessageClass[] {
  if (!Array.isArray(value)) return [...ALL_MESSAGE_CLASSES]
  const allowed = value.filter((entry): entry is MessageClass =>
    ALL_MESSAGE_CLASSES.includes(entry as MessageClass),
  )
  return [...new Set(allowed)]
}

function normalizeControllers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const controllers = [
    ...new Set(
      value
        .map((entry) => Math.round(Number(entry)))
        .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 127),
    ),
  ].sort((left, right) => left - right)
  return controllers.length === 0 ? null : controllers
}

function normalizePort(value: unknown, index: number): PortDefinition {
  const record = asRecord(value)
  const role = record.role === "output" ? "output" : "input"
  const kind = record.kind === "virtual" ? "virtual" : "hardware"

  return {
    id: String(record.id ?? `port-${index + 1}`),
    role,
    kind,
    deviceName: String(record.deviceName ?? ""),
    match: record.match === "exact" ? "exact" : "contains",
  }
}

function normalizeRoute(value: unknown, index: number): Route {
  const record = asRecord(value)
  const filters = asRecord(record.filters)
  const transforms = asRecord(record.transforms)
  const defaults = defaultRouteFilters()
  const channelRemapRaw = transforms.channelRemap

  return {
    id: String(record.id ?? `route-${index + 1}`),
    name: String(record.name ?? record.id ?? `Route ${index + 1}`),
    enabled: record.enabled !== false,
    source: String(record.source ?? ""),
    destination: String(record.destination ?? ""),
    channels: normalizeChannels(record.channels),
    filters: {
      allow: normalizeMessageClasses(filters.allow),
      noteRange: normalizeRange(filters.noteRange, defaults.noteRange),
      controllers: normalizeControllers(filters.controllers),
      velocityRange: normalizeRange(filters.velocityRange, defaults.velocityRange),
    },
    transforms: {
      channelRemap:
        channelRemapRaw === null || channelRemapRaw === undefined
          ? null
          : clamp(Math.round(Number(channelRemapRaw)), 1, 16),
      transpose: clamp(Math.round(Number(transforms.transpose ?? 0)), -48, 48),
      velocityScale: clamp(Number(transforms.velocityScale ?? 1), 0, 4),
      velocityOffset: clamp(
        Math.round(Number(transforms.velocityOffset ?? 0)),
        -127,
        127,
      ),
    },
  }
}

/** Accepts anything and returns a structurally valid configuration. */
export function normalizeRouterConfig(value: unknown): RouterConfig {
  const record = asRecord(value)
  const ports = Array.isArray(record.ports) ? record.ports.map(normalizePort) : []
  const routes = Array.isArray(record.routes) ? record.routes.map(normalizeRoute) : []

  return { version: 1, ports, routes }
}

/** Default location: `%APPDATA%/sunlite-midi-router/midi-router.config.json`. */
export function defaultConfigPath(): string {
  const base = process.env.APPDATA ?? path.join(os.homedir(), ".config")
  return path.join(base, "sunlite-midi-router", CONFIG_FILE_NAME)
}

export function resolveConfigPath(explicit?: string): string {
  return explicit ? path.resolve(explicit) : defaultConfigPath()
}

export function loadRouterConfig(filePath: string): RouterConfig {
  const raw = fs.readFileSync(filePath, "utf8")
  return normalizeRouterConfig(JSON.parse(raw))
}

export function saveRouterConfig(filePath: string, config: RouterConfig): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}
