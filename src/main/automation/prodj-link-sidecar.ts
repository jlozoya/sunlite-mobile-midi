import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import type { DjLinkBridgeStatus, DjLinkEvent } from "../../shared/automation-types.js"

type SidecarOptions = {
  isPackaged: boolean
  resourcesPath: string
  projectRoot: string
  onEvent: (event: DjLinkEvent) => void
  onStatus: (status: DjLinkBridgeStatus) => void
}

type LaunchTarget = {
  command: string
  args: string[]
  displayPath: string
}

export class ProDjLinkSidecar {
  private readonly options: SidecarOptions
  private child: ReturnType<typeof spawn> | null = null
  private stopped = false
  private restartTimer: NodeJS.Timeout | null = null
  private status: DjLinkBridgeStatus = {
    available: false,
    running: false,
    connected: false,
    message: "Buscando puente PRO DJ LINK",
    executablePath: null,
    lastEventAt: null,
  }

  constructor(options: SidecarOptions) {
    this.options = options
  }

  start(): void {
    this.stopped = false
    if (this.child) return

    const target = this.resolveTarget()
    if (!target) {
      this.updateStatus({
        available: false,
        running: false,
        message: "No se encontró el ejecutable empaquetado ni Python para desarrollo",
        executablePath: null,
      })
      return
    }

    this.updateStatus({
      available: true,
      running: false,
      message: "Iniciando listener pasivo PRO DJ LINK",
      executablePath: target.displayPath,
    })

    const child = spawn(target.command, target.args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    })
    this.child = child

    const output = readline.createInterface({ input: child.stdout })
    output.on("line", (line) => this.handleLine(line))

    const errors = readline.createInterface({ input: child.stderr })
    errors.on("line", (line) => {
      if (line.trim()) {
        this.updateStatus({ message: line.trim().slice(0, 300) })
      }
    })

    child.on("spawn", () => {
      this.updateStatus({
        running: true,
        message: "Escuchando broadcasts de los CDJ en la red local",
      })
    })

    child.on("error", (error) => {
      this.updateStatus({ running: false, message: error.message })
    })

    child.on("close", (code) => {
      output.close()
      errors.close()
      if (this.child === child) this.child = null
      this.updateStatus({
        running: false,
        connected: false,
        message: this.stopped
          ? "Puente PRO DJ LINK detenido"
          : `El puente PRO DJ LINK terminó con código ${code ?? "desconocido"}`,
      })
      if (!this.stopped) {
        this.restartTimer = setTimeout(() => this.start(), 3000)
      }
    })
  }

  stop(): void {
    this.stopped = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.child?.kill()
    this.child = null
  }

  private resolveTarget(): LaunchTarget | null {
    const packagedExe = path.join(
      this.options.resourcesPath,
      "prodj-link",
      "prodj-link-bridge.exe",
    )
    const developmentExe = path.join(
      this.options.projectRoot,
      "resources",
      "prodj-link",
      "prodj-link-bridge.exe",
    )
    const script = path.join(this.options.projectRoot, "python", "prodj_link_bridge.py")

    if (this.options.isPackaged && fs.existsSync(packagedExe)) {
      return { command: packagedExe, args: [], displayPath: packagedExe }
    }
    if (fs.existsSync(developmentExe)) {
      return { command: developmentExe, args: [], displayPath: developmentExe }
    }
    if (!this.options.isPackaged && fs.existsSync(script)) {
      return { command: "python", args: [script], displayPath: script }
    }
    return null
  }

  private handleLine(line: string): void {
    try {
      const event = JSON.parse(line) as DjLinkEvent
      if (!event || typeof event !== "object" || typeof event.type !== "string") return

      const isConnected =
        event.type === "device" || event.type === "beat" || event.type === "position"
      this.updateStatus({
        running: event.type !== "error",
        connected: isConnected ? true : this.status.connected,
        lastEventAt: Date.now(),
        message:
          event.type === "ready" || event.type === "warning" || event.type === "error"
            ? event.message
            : this.status.message,
      })
      this.options.onEvent(event)
    } catch {
      if (line.trim()) this.updateStatus({ message: line.trim().slice(0, 300) })
    }
  }

  private updateStatus(patch: Partial<DjLinkBridgeStatus>): void {
    this.status = { ...this.status, ...patch }
    this.options.onStatus({ ...this.status })
  }
}
