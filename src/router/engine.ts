/**
 * Pure routing engine: raw bytes in, raw bytes out, no I/O and no native bindings.
 *
 * It is deliberately free of side effects so the whole filter/transform matrix can be
 * exercised in tests without a MIDI device attached.
 */
import {
  NOTE_OFF,
  NOTE_ON,
  POLY_AFTERTOUCH,
  classifyMessage,
  clamp,
  getChannel,
  getMessageType,
  isNoteOff,
  withChannel,
} from "./message.js"
import type { MessageClass, RoutedMessage, Route, RouterConfig } from "./types.js"

const ALL_SOUND_OFF = 120
const ALL_NOTES_OFF = 123

type HeldNote = { channel: number; note: number }

/** The parts of a route that change how an already held note must be released. */
function noteIdentity(route: Route): string {
  return JSON.stringify([
    route.destination,
    route.channels,
    route.transforms.channelRemap,
    route.transforms.transpose,
  ])
}

export class RoutingEngine {
  private config: RouterConfig
  private routesBySource = new Map<string, Route[]>()
  /** routeId -> incoming "channel:note" -> the note actually emitted downstream. */
  private held = new Map<string, Map<string, HeldNote>>()

  constructor(config: RouterConfig) {
    this.config = config
    this.indexRoutes()
  }

  getConfig(): RouterConfig {
    return this.config
  }

  /**
   * Swap the configuration. Returns the note-offs that must be sent first, so notes
   * held under the previous routing do not stick on the destination device.
   */
  setConfig(next: RouterConfig): RoutedMessage[] {
    const upcoming = new Map(next.routes.map((route) => [route.id, route]))
    const releases: RoutedMessage[] = []

    for (const route of this.config.routes) {
      const replacement = upcoming.get(route.id)
      const stillValid =
        replacement !== undefined &&
        replacement.enabled &&
        route.enabled &&
        noteIdentity(replacement) === noteIdentity(route)

      if (!stillValid) releases.push(...this.releaseRoute(route.id, route.destination))
    }

    this.config = next
    this.indexRoutes()
    return releases
  }

  /** Route one incoming message. Returns one outgoing message per matching route. */
  route(sourcePortId: string, bytes: readonly number[]): RoutedMessage[] {
    const routes = this.routesBySource.get(sourcePortId)
    if (!routes || routes.length === 0) return []

    const messageClass = classifyMessage(bytes)
    if (messageClass === null) return []

    const results: RoutedMessage[] = []

    for (const route of routes) {
      const transformed = this.applyRoute(route, messageClass, bytes)
      if (transformed) {
        results.push({
          routeId: route.id,
          destination: route.destination,
          bytes: transformed,
        })
      }
    }

    return results
  }

  /** Note-offs for every note a route is currently holding down. */
  releaseRoute(routeId: string, destination: string): RoutedMessage[] {
    const notes = this.held.get(routeId)
    if (!notes || notes.size === 0) return []

    const releases = [...notes.values()].map((note) => ({
      routeId,
      destination,
      bytes: [NOTE_OFF | (note.channel - 1), note.note, 0],
    }))

    notes.clear()
    return releases
  }

  /**
   * Everything needed to leave the destinations silent: tracked note-offs first, then
   * All Sound Off and All Notes Off on the 16 channels of every destination in use.
   */
  panic(): RoutedMessage[] {
    const messages: RoutedMessage[] = []

    for (const route of this.config.routes) {
      messages.push(...this.releaseRoute(route.id, route.destination))
    }

    const destinations = new Set(
      this.config.routes
        .filter((route) => route.enabled)
        .map((route) => route.destination),
    )

    for (const destination of destinations) {
      for (let channel = 0; channel < 16; channel += 1) {
        messages.push({
          routeId: "panic",
          destination,
          bytes: [0xb0 | channel, ALL_SOUND_OFF, 0],
        })
        messages.push({
          routeId: "panic",
          destination,
          bytes: [0xb0 | channel, ALL_NOTES_OFF, 0],
        })
      }
    }

    return messages
  }

  private indexRoutes() {
    this.routesBySource.clear()

    for (const route of this.config.routes) {
      if (!route.enabled) continue
      const existing = this.routesBySource.get(route.source)
      if (existing) existing.push(route)
      else this.routesBySource.set(route.source, [route])
    }

    const liveRouteIds = new Set(this.config.routes.map((route) => route.id))
    for (const routeId of [...this.held.keys()]) {
      if (!liveRouteIds.has(routeId)) this.held.delete(routeId)
    }
  }

  private heldNotes(routeId: string): Map<string, HeldNote> {
    let notes = this.held.get(routeId)
    if (!notes) {
      notes = new Map()
      this.held.set(routeId, notes)
    }
    return notes
  }

  private applyRoute(
    route: Route,
    messageClass: MessageClass,
    bytes: readonly number[],
  ): number[] | null {
    if (!route.filters.allow.includes(messageClass)) return null

    const channel = getChannel(bytes)

    if (
      channel !== null &&
      route.channels !== "omni" &&
      !route.channels.includes(channel)
    ) {
      return null
    }

    if (messageClass === "note") return this.applyNote(route, bytes, channel ?? 1)

    if (messageClass === "cc") {
      const controllers = route.filters.controllers
      if (controllers && !controllers.includes(bytes[1] ?? 0)) return null
    }

    if (getMessageType(bytes) === POLY_AFTERTOUCH) {
      const note = bytes[1] ?? 0
      const { noteRange } = route.filters
      if (note < noteRange.min || note > noteRange.max) return null
      const transposed = this.transposeNote(route, note)
      if (transposed === null) return null
      const next = this.retarget(route, bytes, channel)
      next[1] = transposed
      return next
    }

    return this.retarget(route, bytes, channel)
  }

  private applyNote(
    route: Route,
    bytes: readonly number[],
    channel: number,
  ): number[] | null {
    const statusType = getMessageType(bytes)
    const note = bytes[1] ?? 0
    const velocity = bytes[2] ?? 0
    const notes = this.heldNotes(route.id)
    const key = `${channel}:${note}`

    if (isNoteOff(bytes)) {
      const heldNote = notes.get(key)
      if (heldNote) {
        notes.delete(key)
        // The incoming release form is preserved on purpose: some hosts (FreeStyler)
        // send note-on with velocity 0 as the release and expect the same shape.
        return [statusType | (heldNote.channel - 1), heldNote.note, velocity]
      }

      // No matching note-on was seen. Letting the release through under the plain
      // transform is safer than swallowing it and leaving the destination hanging.
      const released = this.transposeNote(route, note)
      if (released === null) return null
      const outChannel = route.transforms.channelRemap ?? channel
      return [statusType | (outChannel - 1), released, velocity]
    }

    const { velocityRange, noteRange } = route.filters
    if (note < noteRange.min || note > noteRange.max) return null
    if (velocity < velocityRange.min || velocity > velocityRange.max) return null

    const outNote = this.transposeNote(route, note)
    if (outNote === null) return null

    const { velocityScale, velocityOffset, channelRemap } = route.transforms
    const outVelocity = clamp(
      Math.round(velocity * velocityScale + velocityOffset),
      1,
      127,
    )
    const outChannel = channelRemap ?? channel

    notes.set(key, { channel: outChannel, note: outNote })
    return [NOTE_ON | (outChannel - 1), outNote, outVelocity]
  }

  /** Transposed note, or `null` when the result would fall outside 0-127. */
  private transposeNote(route: Route, note: number): number | null {
    const transposed = note + route.transforms.transpose
    if (transposed < 0 || transposed > 127) return null
    return transposed
  }

  private retarget(
    route: Route,
    bytes: readonly number[],
    channel: number | null,
  ): number[] {
    const remap = route.transforms.channelRemap
    if (remap === null || channel === null) return [...bytes]
    return withChannel(bytes, remap)
  }
}
