/**
 * Router-internal types.
 *
 * The data types that travel between the engine, the Electron main process and the UI
 * live in `src/shared/router-types.ts`, so the renderer can import them too. This module
 * re-exports them for the router's own files and adds what never leaves the engine.
 */
export {
  ALL_MESSAGE_CLASSES,
  MESSAGE_CLASS_LABELS,
  type ChannelSelection,
  type MessageClass,
  type NumericRange,
  type PortDefinition,
  type PortKind,
  type PortRole,
  type PortStatus,
  type Route,
  type RouteFilters,
  type RouteTransforms,
  type RouterConfig,
  type RouterMonitorEvent,
  type RouterState,
  type RouterStats,
} from "../shared/router-types.js"

/** A message after filtering and transformation, addressed to one output port. */
export type RoutedMessage = {
  routeId: string
  destination: string
  bytes: number[]
}
