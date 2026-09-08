/**
 * The runnable router: virtual port provisioning, device I/O and the routing engine
 * wired together.
 */
import { EventEmitter } from "node:events"
import { RoutingEngine } from "./engine.js"
import {
  ensureVirtualPorts,
  type ProvisionResult,
  type VirtualPortRequest,
} from "./loop-midi.js"
import { describeMessage, getChannel } from "./message.js"
import { MidiPortHub, type PortStatus } from "./ports.js"
import { validateRouterConfig } from "./config.js"
import type { RouterConfig, RouterMonitorEvent, RouterStats } from "./types.js"

export type { RouterMonitorEvent as MonitorEvent, RouterStats } from "./types.js"

/**
 * Sustained rate above which a source is treated as a feedback loop. A busy controller
 * sending dense CC plus MIDI clock stays an order of magnitude below this.
 */
const OVERLOAD_MESSAGES_PER_SECOND = 5000

export class MidiRouter extends EventEmitter {
  private engine: RoutingEngine
  private hub: MidiPortHub
  private config: RouterConfig
  private running = false
  private stats: RouterStats = { received: 0, sent: 0, dropped: 0, undelivered: 0 }
  private windowStartedAt = 0
  private windowCount = new Map<string, number>()
  private throttled = new Set<string>()

  constructor(
    config: RouterConfig,
    private readonly options?: {
      installerPath?: string
      rescanIntervalMs?: number
      onBeforeRestart?: () => void | Promise<void>
      onAfterRestart?: () => void | Promise<void>
    },
  ) {
    super()
    this.config = config
    this.engine = new RoutingEngine(config)
    this.hub = new MidiPortHub({ rescanIntervalMs: options?.rescanIntervalMs })
    this.hub.on("status", (status: PortStatus[]) => this.emit("status", status))
    this.hub.on("message", (portId: string, bytes: number[]) => {
      this.handleIncoming(portId, bytes)
    })
  }

  getConfig(): RouterConfig {
    return this.config
  }

  getStatus(): PortStatus[] {
    return this.hub.status()
  }

  getStats(): RouterStats {
    return { ...this.stats }
  }

  /** Provision virtual ports, open devices and begin routing. */
  async start(): Promise<{ provisioning: ProvisionResult; status: PortStatus[] }> {
    const errors = validateRouterConfig(this.config)
    if (errors.length > 0) {
      throw new Error(`Invalid router configuration:\n  - ${errors.join("\n  - ")}`)
    }

    const requests: VirtualPortRequest[] = this.config.ports
      .filter((port) => port.kind === "virtual")
      .map((port) => ({ name: port.deviceName, role: port.role }))

    const provisioning = await ensureVirtualPorts(requests, {
      installerPath: this.options?.installerPath,
      onBeforeRestart: this.options?.onBeforeRestart,
      onAfterRestart: this.options?.onAfterRestart,
    })

    this.hub.setPorts(this.config.ports)
    this.hub.start()
    this.running = true

    return { provisioning, status: this.hub.status() }
  }

  /** Apply a new configuration without dropping the ports that stay the same. */
  updateConfig(config: RouterConfig): void {
    const errors = validateRouterConfig(config)
    if (errors.length > 0) {
      throw new Error(`Invalid router configuration:\n  - ${errors.join("\n  - ")}`)
    }

    for (const release of this.engine.setConfig(config)) {
      this.hub.send(release.destination, release.bytes)
    }

    this.config = config
    this.throttled.clear()
    if (this.running) this.hub.setPorts(config.ports)
  }

  /** Silence the destinations and release every device. */
  stop(): void {
    if (this.running) {
      for (const message of this.engine.panic()) {
        this.hub.send(message.destination, message.bytes)
      }
    }
    this.running = false
    this.hub.stop()
  }

  private handleIncoming(portId: string, bytes: number[]) {
    this.stats.received += 1

    if (this.isOverloaded(portId)) {
      this.stats.dropped += 1
      return
    }

    this.emitMonitor("in", portId, null, bytes)

    const routed = this.engine.route(portId, bytes)
    if (routed.length === 0) {
      this.stats.dropped += 1
      return
    }

    for (const message of routed) {
      if (this.hub.send(message.destination, message.bytes)) {
        this.stats.sent += 1
        this.emitMonitor("out", message.destination, message.routeId, message.bytes)
      } else {
        this.stats.undelivered += 1
      }
    }
  }

  /**
   * Last-resort guard. Static validation rejects configured cycles, but a hardware MIDI
   * thru or an application echoing its input can still close a loop at runtime.
   */
  private isOverloaded(portId: string): boolean {
    const now = Date.now()

    if (now - this.windowStartedAt >= 1000) {
      this.windowStartedAt = now
      this.windowCount.clear()
      this.throttled.clear()
    }

    const count = (this.windowCount.get(portId) ?? 0) + 1
    this.windowCount.set(portId, count)

    if (count <= OVERLOAD_MESSAGES_PER_SECOND) return false

    if (!this.throttled.has(portId)) {
      this.throttled.add(portId)
      this.emit(
        "overload",
        `Port "${portId}" exceeded ${OVERLOAD_MESSAGES_PER_SECOND} messages per second and is being throttled. Check for a MIDI feedback loop.`,
      )
    }

    return true
  }

  private emitMonitor(
    direction: "in" | "out",
    portId: string,
    routeId: string | null,
    bytes: readonly number[],
  ) {
    if (this.listenerCount("monitor") === 0) return

    const event: RouterMonitorEvent = {
      at: Date.now(),
      direction,
      portId,
      routeId,
      channel: getChannel(bytes),
      text: describeMessage(bytes),
    }

    this.emit("monitor", event)
  }
}
