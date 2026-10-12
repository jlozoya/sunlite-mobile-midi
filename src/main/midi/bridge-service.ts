import { spawn } from "node:child_process"
import fs from "node:fs"
import { shell } from "electron"
import { ensureVirtualPorts, findLoopMidiExecutable } from "../../router/loop-midi.js"
import type { RouterService } from "../router-service.js"
import { getLoopMidiInstallerPath } from "../runtime-paths.js"
import { MIDI_OUTPUT_NAME, MIDI_INPUT_NAME } from "./settings.js"

export function createMidiBridgeService({
  closeMidiConnection,
  refreshMidiConnection,
  getRouterService,
}: {
  closeMidiConnection: () => void
  refreshMidiConnection: () => unknown
  getRouterService: () => RouterService | null
}) {
  type ProcessEventEmitter = {
    on(event: "error", listener: (error: Error) => void): void
    on(event: "close", listener: (code: number | null) => void): void
  }

  let midiAutoConfigured = false

  let midiProvisioningMessage: string | null = null

  function runProcess(command: string, args: string[], windowsHide = true) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(command, args, {
          windowsHide,
          shell: false,
        })

        let stdout = ""
        let stderr = ""

        child.stdout?.on("data", (chunk) => {
          stdout += String(chunk)
        })

        child.stderr?.on("data", (chunk) => {
          stderr += String(chunk)
        })

        const childEvents = child as unknown as ProcessEventEmitter

        childEvents.on("error", reject)
        childEvents.on("close", (code: number | null) => {
          resolve({ code, stdout, stderr })
        })
      },
    )
  }

  async function provisionMidiBridge(options: { installIfMissing: boolean }) {
    midiAutoConfigured = false
    midiProvisioningMessage = "Preparing the local MIDI bridge..."

    const executablePath = findLoopMidiExecutable()
    if (!executablePath && !options.installIfMissing) {
      midiProvisioningMessage = "The local MIDI bridge is not installed."
      return false
    }

    const installerPath = getLoopMidiInstallerPath()
    if (!executablePath && !fs.existsSync(installerPath)) {
      throw new Error("The bundled MIDI bridge installer is missing.")
    }

    let routerWasStopped = false
    const provisioning = await ensureVirtualPorts(
      [
        { name: MIDI_OUTPUT_NAME, role: "output" },
        { name: MIDI_INPUT_NAME, role: "input" },
      ],
      {
        installerPath: options.installIfMissing ? installerPath : undefined,
        onBeforeRestart: () => {
          closeMidiConnection()
          if (getRouterService()?.getState().running) {
            getRouterService()!.stop()
            routerWasStopped = true
          }
        },
        onAfterRestart: async () => {
          refreshMidiConnection()
          if (routerWasStopped && getRouterService()) {
            await getRouterService()!.start({
              installerPath,
              onBeforeRestart: () => closeMidiConnection(),
              onAfterRestart: () => {
                refreshMidiConnection()
              },
            })
            routerWasStopped = false
          }
        },
      },
    )

    if (!provisioning.ok) {
      midiProvisioningMessage = provisioning.message
      return false
    }

    midiAutoConfigured = true
    midiProvisioningMessage = provisioning.message
    refreshMidiConnection()
    return true
  }

  async function installLoopMidi() {
    const existingExecutablePath = findLoopMidiExecutable()

    if (existingExecutablePath) {
      const ready = await provisionMidiBridge({ installIfMissing: false })
      if (!ready) {
        throw new Error(
          midiProvisioningMessage ?? "No se pudieron preparar los puertos MIDI.",
        )
      }
      return {
        code: 0,
        stdout: existingExecutablePath,
        stderr: "",
        skipped: true,
      }
    }

    const installerPath = getLoopMidiInstallerPath()

    if (!fs.existsSync(installerPath)) {
      throw new Error(`loopMIDI installer was not found at: ${installerPath}`)
    }

    const result = await runProcess(installerPath, ["/quiet", "/norestart"], false)
    if (result.code === 0) {
      const ready = await provisionMidiBridge({ installIfMissing: false })
      if (!ready) {
        throw new Error(
          midiProvisioningMessage ?? "No se pudieron preparar los puertos MIDI.",
        )
      }
    }

    return result
  }

  async function openLoopMidi() {
    const executablePath = findLoopMidiExecutable()

    if (executablePath) {
      spawn(executablePath, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }).unref()

      return executablePath
    }

    const installerPath = getLoopMidiInstallerPath()

    if (fs.existsSync(installerPath)) {
      await shell.openPath(installerPath)
      return installerPath
    }

    throw new Error("loopMIDI is not installed and the bundled installer is missing.")
  }
  return {
    provisionMidiBridge,
    installLoopMidi,
    openLoopMidi,
    getStatus: () => ({ midiAutoConfigured, midiProvisioningMessage }),
    reportError: (error: unknown) => {
      midiAutoConfigured = false
      midiProvisioningMessage =
        error instanceof Error ? error.message : "Automatic MIDI setup failed."
    },
  }
}
