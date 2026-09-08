/**
 * Wraps the MIDI router for the Electron app: configuration on disk, lifecycle, and
 * the live state the Router panel renders.
 *
 * The router is deliberately not started on launch. It takes ownership of whatever
 * devices it is pointed at, and taking a device away from the lighting software without
 * being asked would be worse than doing nothing.
 */
import fs from "node:fs"
import path from "node:path"
import {
  loadRouterConfig,
  normalizeRouterConfig,
  saveRouterConfig,
  validateRouterConfig,
} from "../router/config.js"
import { listInputDevices, listOutputDevices } from "../router/devices.js"
import { MidiRouter } from "../router/router.js"
import type {
  RouterConfig,
  RouterMonitorEvent,
  RouterState,
} from "../shared/router-types.js"

const MONITOR_BUFFER_SIZE = 200
/** Monitor events are batched so a busy controller cannot flood the WebSocket. */
const MONITOR_FLUSH_MS = 150

/** An app that starts with nothing configured is valid; the placeholder default is not. */
function emptyConfig(): RouterConfig {
  return { version: 1, ports: [], routes: [] }
}

export class RouterService {
  private config: RouterConfig
  private router: MidiRouter | null = null
  private provisioning: RouterState["provisioning"] = null
  private monitor: RouterMonitorEvent[] = []
  private pendingMonitor: RouterMonitorEvent[] = []
  private flushTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly configPath: string,
    private readonly broadcast: (payload: unknown) => void,
  ) {
    this.config = this.readConfig()
  }

  private readConfig(): RouterConfig {
    try {
      if (fs.existsSync(this.configPath)) return loadRouterConfig(this.configPath)
    } catch {
      // A corrupt file should not stop the app from opening; the panel starts empty
      // and the user can rebuild the routes.
    }
    return emptyConfig()
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true })
    saveRouterConfig(this.configPath, this.config)
  }

  /**
   * Points the router at a device the controller already owns. Not fatal, but the two
   * would fight over a single-client driver, so it is worth saying out loud.
   */
  private conflictWarnings(reserved: string[]): string[] {
    const warnings: string[] = []

    for (const port of this.config.ports) {
      const clash = reserved.find((name) =>
        port.deviceName.toLowerCase().includes(name.toLowerCase()),
      )
      if (clash) {
        warnings.push(
          `El puerto "${port.id}" apunta a "${port.deviceName}", que ya usa el controlador de la app. Los dos se disputarían el dispositivo.`,
        )
      }
    }

    return warnings
  }

  getState(reserved: string[] = []): RouterState {
    return {
      running: this.router !== null,
      config: this.config,
      ports: this.router?.getStatus() ?? [],
      stats: this.router?.getStats() ?? {
        received: 0,
        sent: 0,
        dropped: 0,
        undelivered: 0,
      },
      provisioning: this.provisioning,
      errors: validateRouterConfig(this.config),
      warnings: this.conflictWarnings(reserved),
      devices: {
        inputs: listInputDevices().map((device) => device.name),
        outputs: listOutputDevices().map((device) => device.name),
      },
    }
  }

  getMonitor(): RouterMonitorEvent[] {
    return [...this.monitor]
  }

  /** Validate, persist, and apply to a running router without dropping shared ports. */
  updateConfig(raw: unknown): RouterConfig {
    const next = normalizeRouterConfig(raw)
    const errors = validateRouterConfig(next)

    // The configuration is saved even when invalid, so a half-built set of routes
    // survives a restart. Only starting the router requires it to be valid.
    this.config = next
    this.persist()

    if (this.router && errors.length === 0) this.router.updateConfig(next)
    return next
  }

  async start(options?: {
    installerPath?: string
    onBeforeRestart?: () => void | Promise<void>
    onAfterRestart?: () => void | Promise<void>
  }): Promise<void> {
    if (this.router) return

    const errors = validateRouterConfig(this.config)
    if (errors.length > 0) {
      throw new Error(errors.join(" "))
    }

    const router = new MidiRouter(this.config, {
      installerPath: options?.installerPath,
      onBeforeRestart: options?.onBeforeRestart,
      onAfterRestart: options?.onAfterRestart,
    })

    router.on("status", () => this.broadcast({ event: "router-state" }))
    router.on("overload", (message: string) => {
      this.broadcast({ event: "router-overload", message })
    })
    router.on("monitor", (event: RouterMonitorEvent) => this.queueMonitor(event))

    const { provisioning } = await router.start()
    this.provisioning = { ok: provisioning.ok, message: provisioning.message }
    this.router = router
  }

  stop(): void {
    if (!this.router) return
    this.router.stop()
    this.router = null
    this.flushMonitor()
  }

  dispose(): void {
    this.stop()
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private queueMonitor(event: RouterMonitorEvent): void {
    this.pendingMonitor.push(event)
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => this.flushMonitor(), MONITOR_FLUSH_MS)
    this.flushTimer.unref?.()
  }

  private flushMonitor(): void {
    if (this.pendingMonitor.length === 0) {
      if (this.flushTimer) {
        clearInterval(this.flushTimer)
        this.flushTimer = null
      }
      return
    }

    const batch = this.pendingMonitor
    this.pendingMonitor = []
    this.monitor = [...this.monitor, ...batch].slice(-MONITOR_BUFFER_SIZE)
    this.broadcast({ event: "router-monitor", events: batch })
  }
}
