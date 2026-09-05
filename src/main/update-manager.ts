import type { AppUpdater } from "electron-updater"
import type { UpdateStatus } from "../shared/update-types.js"

type Updater = Pick<
  AppUpdater,
  | "autoDownload"
  | "autoInstallOnAppQuit"
  | "allowPrerelease"
  | "allowDowngrade"
  | "on"
  | "checkForUpdates"
  | "downloadUpdate"
  | "quitAndInstall"
>

export function validateUpdateFeed(value: string): string {
  const url = new URL(value)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  ) {
    throw new Error(
      "El servidor de actualizaciones debe usar HTTPS (HTTP solo en localhost).",
    )
  }
  return url.href
}

export class UpdateManager {
  private state: UpdateStatus
  private busy = false
  private startupTimer?: ReturnType<typeof setTimeout>
  private interval?: ReturnType<typeof setInterval>

  constructor(
    private updater: Updater,
    version: string,
    disabledReason: string | null,
    private prepareInstall: () => void,
  ) {
    this.state = {
      currentVersion: version,
      phase: disabledReason ? "disabled" : "idle",
      availableVersion: null,
      percent: null,
      message: disabledReason ?? "Puedes buscar una nueva versión.",
      checkedAt: null,
    }
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = false
    updater.allowDowngrade = false
    updater.on("checking-for-update", () =>
      this.change({
        phase: "checking",
        message: "Buscando actualizaciones…",
      }),
    )
    updater.on("update-available", (info) =>
      this.change({
        phase: "available",
        availableVersion: info.version,
        percent: null,
        checkedAt: new Date().toISOString(),
        message: `La versión ${info.version} está disponible.`,
      }),
    )
    updater.on("update-not-available", () =>
      this.change({
        phase: "idle",
        availableVersion: null,
        percent: null,
        checkedAt: new Date().toISOString(),
        message: "Tienes la última versión publicada.",
      }),
    )
    updater.on("download-progress", (progress) =>
      this.change({
        phase: "downloading",
        percent: Math.min(100, Math.max(0, progress.percent)),
        message: "Descargando actualización…",
      }),
    )
    updater.on("update-downloaded", (info) =>
      this.change({
        phase: "downloaded",
        availableVersion: info.version,
        percent: 100,
        message: "Actualización lista. Instálala cuando termine tu show.",
      }),
    )
    updater.on("error", () => this.fail())
  }

  private change(patch: Partial<UpdateStatus>) {
    this.state = { ...this.state, ...patch }
  }

  private fail() {
    this.change({
      phase: "error",
      percent: null,
      message:
        "No se pudo completar la actualización. Comprueba tu conexión y vuelve a intentarlo.",
    })
  }

  status(): UpdateStatus {
    return { ...this.state }
  }

  start() {
    if (this.state.phase === "disabled" || this.interval) return
    this.startupTimer = setTimeout(() => void this.check(), 5000)
    this.interval = setInterval(() => void this.check(), 4 * 60 * 60 * 1000)
    this.startupTimer.unref()
    this.interval.unref()
  }

  stop() {
    clearTimeout(this.startupTimer)
    clearInterval(this.interval)
    this.interval = undefined
  }

  async check(): Promise<UpdateStatus> {
    if (this.busy || ["disabled", "downloaded", "installing"].includes(this.state.phase))
      return this.status()
    this.busy = true
    this.change({
      phase: "checking",
      availableVersion: null,
      percent: null,
      message: "Buscando actualizaciones…",
    })
    try {
      const result = await this.updater.checkForUpdates()
      if (!result) this.fail()
    } catch {
      this.fail()
    } finally {
      this.busy = false
    }
    return this.status()
  }

  async download(): Promise<UpdateStatus> {
    if (
      this.busy ||
      !this.state.availableVersion ||
      !["available", "error"].includes(this.state.phase)
    )
      return this.status()
    this.busy = true
    this.change({
      phase: "downloading",
      percent: 0,
      message: "Descargando actualización…",
    })
    try {
      await this.updater.downloadUpdate()
    } catch {
      this.fail()
    } finally {
      this.busy = false
    }
    return this.status()
  }

  install(): UpdateStatus {
    if (this.busy || this.state.phase !== "downloaded") return this.status()
    try {
      // Check live recording/mode state immediately before quitting.
      this.prepareInstall()
    } catch (error) {
      this.change({
        message: error instanceof Error ? error.message : "No se puede reiniciar ahora.",
      })
      return this.status()
    }
    this.change({ phase: "installing", message: "Cerrando la aplicación para instalar…" })
    try {
      this.updater.quitAndInstall(false, true)
    } catch {
      this.fail()
    }
    return this.status()
  }
}
