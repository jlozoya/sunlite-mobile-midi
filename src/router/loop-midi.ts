/**
 * Windows virtual MIDI ports through the loopMIDI bridge.
 *
 * RtMidi cannot create virtual ports on Windows (WinMM has no such concept), so the
 * ports the router hands to other applications are registered with loopMIDI, which
 * installs a multi-client kernel driver. Registration is HKCU-only and needs no
 * elevation; only installing loopMIDI itself does.
 *
 * Note the redistribution constraint recorded in the project README: loopMIDI may not
 * be shipped without the author's written consent, so a public build has to swap this
 * module for the licensed virtualMIDI redistributable. Nothing outside this file knows
 * which bridge is in use.
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { listInputDevices, listOutputDevices } from "./devices.js"

const REGISTRY_KEY = "HKCU\\Software\\Tobias Erichsen\\loopMIDI"
const PORTS_REGISTRY_KEY = `${REGISTRY_KEY}\\Ports`

export type VirtualPortRequest = { name: string; role: "input" | "output" }

export type ProvisionResult = {
  ok: boolean
  message: string
  missing: string[]
}

function runProcess(command: string, args: string[], windowsHide = true) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(command, args, { windowsHide, shell: false })
      let stdout = ""
      let stderr = ""

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk)
      })
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk)
      })
      child.on("error", reject)
      child.on("close", (code) => resolve({ code, stdout, stderr }))
    },
  )
}

export function findLoopMidiExecutable(): string | null {
  const candidates = [
    path.join(
      process.env.ProgramFiles ?? "C:\\Program Files",
      "Tobias Erichsen",
      "loopMIDI",
      "loopMIDI.exe",
    ),
    path.join(
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "Tobias Erichsen",
      "loopMIDI",
      "loopMIDI.exe",
    ),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "loopMIDI", "loopMIDI.exe"),
  ]

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null
}

/** Declare the ports loopMIDI should expose. Existing ports are left alone. */
export async function registerVirtualPorts(names: readonly string[]): Promise<void> {
  if (process.platform !== "win32" || names.length === 0) return

  const entries: Array<[string, string, string]> = [
    [REGISTRY_KEY, "StartMinimized", "1"],
    ...names.map((name): [string, string, string] => [PORTS_REGISTRY_KEY, name, "1"]),
  ]

  for (const [key, name, value] of entries) {
    const result = await runProcess("reg.exe", [
      "ADD",
      key,
      "/v",
      name,
      "/t",
      "REG_DWORD",
      "/d",
      value,
      "/f",
    ])

    if (result.code !== 0) {
      throw new Error(
        `Could not register the virtual MIDI port "${name}": ${result.stderr || result.stdout}`,
      )
    }
  }
}

export function startLoopMidi(executablePath: string): void {
  spawn(executablePath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref()
}

async function isLoopMidiRunning(): Promise<boolean> {
  const result = await runProcess("tasklist.exe", [
    "/FI",
    "IMAGENAME eq loopMIDI.exe",
    "/NH",
  ])
  return result.stdout.toLowerCase().includes("loopmidi.exe")
}

/**
 * loopMIDI reads its port list from the registry only at startup, so a port registered
 * while it is running does not appear until it is restarted. Every port comes back
 * afterwards, including the ones the controller uses, but they do blink out for a moment
 * and any application holding them has to reopen.
 */
async function restartLoopMidi(executablePath: string): Promise<void> {
  await runProcess("taskkill.exe", ["/IM", "loopMIDI.exe", "/F"])
  await new Promise((resolve) => setTimeout(resolve, 600))
  startLoopMidi(executablePath)
}

function missingPorts(requests: readonly VirtualPortRequest[]): string[] {
  // Only probe the roles that were asked for: enumerating inputs on a machine that has
  // none makes RtMidi print a warning, and this runs on a polling loop.
  const wantsInputs = requests.some((request) => request.role === "input")
  const wantsOutputs = requests.some((request) => request.role === "output")
  const inputs = wantsInputs
    ? listInputDevices().map((device) => device.name.toLowerCase())
    : []
  const outputs = wantsOutputs
    ? listOutputDevices().map((device) => device.name.toLowerCase())
    : []

  return requests
    .filter((request) => {
      const pool = request.role === "input" ? inputs : outputs
      return !pool.some((name) => name.includes(request.name.toLowerCase()))
    })
    .map((request) => request.name)
}

async function waitForPorts(
  requests: readonly VirtualPortRequest[],
  timeoutMs: number,
): Promise<string[]> {
  const startedAt = Date.now()
  let missing = missingPorts(requests)

  while (missing.length > 0 && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    missing = missingPorts(requests)
  }

  return missing
}

/**
 * Make sure every requested virtual port exists, installing and starting loopMIDI when
 * needed. Ports that are already present are reported as ready without touching them.
 */
export async function ensureVirtualPorts(
  requests: readonly VirtualPortRequest[],
  options?: {
    installerPath?: string
    timeoutMs?: number
    /** Release any loopMIDI port this process holds; it is about to be restarted. */
    onBeforeRestart?: () => void | Promise<void>
    /** Reopen what was released once loopMIDI is back. */
    onAfterRestart?: () => void | Promise<void>
  },
): Promise<ProvisionResult> {
  if (requests.length === 0) {
    return { ok: true, message: "No virtual ports requested.", missing: [] }
  }

  if (process.platform !== "win32") {
    const missing = missingPorts(requests)
    return {
      ok: missing.length === 0,
      message:
        missing.length === 0
          ? "Virtual ports already present."
          : `This platform has no loopMIDI bridge. Create these ports manually: ${missing.join(", ")}.`,
      missing,
    }
  }

  const alreadyPresent = missingPorts(requests)
  if (alreadyPresent.length === 0) {
    return { ok: true, message: "Virtual ports already present.", missing: [] }
  }

  let executablePath = findLoopMidiExecutable()

  if (!executablePath && options?.installerPath && fs.existsSync(options.installerPath)) {
    const install = await runProcess(
      options.installerPath,
      ["/quiet", "/norestart"],
      false,
    )
    if (install.code !== 0) {
      return {
        ok: false,
        message:
          install.stderr ||
          install.stdout ||
          `The MIDI bridge installer exited with code ${install.code}.`,
        missing: alreadyPresent,
      }
    }
    executablePath = findLoopMidiExecutable()
  }

  if (!executablePath) {
    return {
      ok: false,
      message:
        "loopMIDI is not installed, so these virtual ports cannot be created: " +
        `${alreadyPresent.join(", ")}. Install loopMIDI and run the command again.`,
      missing: alreadyPresent,
    }
  }

  const names = [...new Set(requests.map((request) => request.name))]
  await registerVirtualPorts(names)

  // Registering is not enough on its own: loopMIDI only reads the port list at startup,
  // so an instance that is already running has to be restarted to expose the new ports.
  //
  // Anything still holding a loopMIDI port when it dies takes the device out from under
  // RtMidi, which crashes the process on Windows. The caller gets a chance to release
  // its ports first and reopen them afterwards.
  const wasRunning = await isLoopMidiRunning()
  if (wasRunning) {
    await options?.onBeforeRestart?.()
    await restartLoopMidi(executablePath)
    await options?.onAfterRestart?.()
  } else {
    startLoopMidi(executablePath)
  }

  const missing = await waitForPorts(requests, options?.timeoutMs ?? 8000)
  const restarted = wasRunning
    ? " loopMIDI se reinició para exponerlos, así que los puertos existentes parpadearon un momento."
    : ""

  return {
    ok: missing.length === 0,
    message:
      missing.length === 0
        ? `Puertos virtuales listos: ${names.join(", ")}.${restarted}`
        : `loopMIDI no expuso estos puertos: ${missing.join(", ")}. Ciérralo desde la bandeja del sistema y vuelve a arrancar el router.`,
    missing,
  }
}
