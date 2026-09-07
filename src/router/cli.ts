/**
 * Command line entry point for the MIDI router.
 *
 *   node dist/router/cli.js list
 *   node dist/router/cli.js init --out "APC mini mk2" --in "APC mini mk2"
 *   node dist/router/cli.js check
 *   node dist/router/cli.js run --monitor
 */
import fs from "node:fs"
import path from "node:path"
import {
  createDefaultConfig,
  loadRouterConfig,
  resolveConfigPath,
  saveRouterConfig,
  validateRouterConfig,
} from "./config.js"
import { listInputDevices, listOutputDevices } from "./devices.js"
import { MidiRouter, type MonitorEvent } from "./router.js"
import type { PortStatus } from "./ports.js"

type Flags = Record<string, string | boolean>

function parseArgs(argv: readonly string[]): { command: string; flags: Flags } {
  const [command = "help", ...rest] = argv
  const flags: Flags = {}

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token || !token.startsWith("--")) continue
    const key = token.slice(2)
    const next = rest[index + 1]
    if (next && !next.startsWith("--")) {
      flags[key] = next
      index += 1
    } else {
      flags[key] = true
    }
  }

  return { command, flags }
}

function flagString(flags: Flags, key: string): string | undefined {
  const value = flags[key]
  return typeof value === "string" ? value : undefined
}

function printHelp() {
  console.log(`MIDI Router - channel split and multi-application merge

Usage:
  list                      Show every MIDI input and output Windows exposes
  init [options]            Write a starter configuration file
  check [--config <path>]   Validate a configuration without opening any device
  run [options]             Run the router

Options:
  --config <path>   Configuration file (default: %APPDATA%/sunlite-midi-router/midi-router.config.json)
  --in <name>       Physical device to read from, used by "init"
  --out <name>      Physical device to write to, used by "init"
  --force           Overwrite an existing configuration file
  --monitor         Print every routed message while running
  --installer <path>  loopMIDI installer to use if the bridge is missing`)
}

function commandList() {
  const inputs = listInputDevices()
  const outputs = listOutputDevices()

  console.log("MIDI inputs (applications and devices the router can read):")
  if (inputs.length === 0) console.log("  (none)")
  for (const device of inputs) console.log(`  [${device.index}] ${device.name}`)

  console.log("\nMIDI outputs (devices and ports the router can write to):")
  if (outputs.length === 0) console.log("  (none)")
  for (const device of outputs) console.log(`  [${device.index}] ${device.name}`)
}

function commandInit(flags: Flags) {
  const configPath = resolveConfigPath(flagString(flags, "config"))

  if (fs.existsSync(configPath) && flags.force !== true) {
    console.error(`${configPath} already exists. Pass --force to overwrite it.`)
    process.exitCode = 1
    return
  }

  const config = createDefaultConfig({
    deviceInput: flagString(flags, "in"),
    deviceOutput: flagString(flags, "out"),
  })

  saveRouterConfig(configPath, config)
  console.log(`Configuration written to ${configPath}`)

  const errors = validateRouterConfig(config)
  if (errors.length > 0) {
    console.log("\nStill to do before it can run:")
    for (const error of errors) console.log(`  - ${error}`)
    console.log('\nRun "list" to see the exact device names, then edit the file.')
  }
}

function commandCheck(flags: Flags) {
  const configPath = resolveConfigPath(flagString(flags, "config"))

  if (!fs.existsSync(configPath)) {
    console.error(`No configuration at ${configPath}. Run "init" first.`)
    process.exitCode = 1
    return
  }

  const config = loadRouterConfig(configPath)
  const errors = validateRouterConfig(config)

  if (errors.length === 0) {
    console.log(
      `${configPath} is valid: ${config.routes.length} routes, ${config.ports.length} ports.`,
    )
    return
  }

  console.error(`${configPath} has problems:`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exitCode = 1
}

function formatTime(at: number): string {
  const date = new Date(at)
  const time = date.toTimeString().slice(0, 8)
  return `${time}.${String(date.getMilliseconds()).padStart(3, "0")}`
}

function printStatus(status: readonly PortStatus[]) {
  console.log("\nPorts:")
  for (const port of status) {
    const state = port.connected
      ? "open"
      : port.error
        ? `error: ${port.error}`
        : "waiting"
    const role = port.role === "input" ? "IN " : "OUT"
    console.log(`  ${role} ${port.id.padEnd(12)} ${port.deviceName.padEnd(28)} ${state}`)
  }
}

async function commandRun(flags: Flags) {
  const configPath = resolveConfigPath(flagString(flags, "config"))

  if (!fs.existsSync(configPath)) {
    console.error(`No configuration at ${configPath}. Run "init" first.`)
    process.exitCode = 1
    return
  }

  const config = loadRouterConfig(configPath)
  const installer = flagString(flags, "installer")
  const router = new MidiRouter(config, {
    installerPath: installer ? path.resolve(installer) : undefined,
  })

  router.on("status", printStatus)
  router.on("overload", (message: string) => console.warn(`\n[warning] ${message}`))

  if (flags.monitor === true) {
    router.on("monitor", (event: MonitorEvent) => {
      const direction = event.direction === "in" ? "IN " : "OUT"
      const channel =
        event.channel === null ? "     " : `CH ${String(event.channel).padStart(2)}`
      const label = event.routeId ? `${event.portId} (${event.routeId})` : event.portId
      console.log(
        `${formatTime(event.at)}  ${direction} ${label.padEnd(28)} ${channel}  ${event.text}`,
      )
    })
  }

  const { provisioning, status } = await router.start()
  console.log(provisioning.message)
  printStatus(status)

  const enabled = config.routes.filter((route) => route.enabled)
  console.log(
    `\nRouting ${enabled.length} of ${config.routes.length} routes. Press Ctrl+C to stop.`,
  )

  let stopping = false
  const shutdown = () => {
    if (stopping) return
    stopping = true
    const stats = router.getStats()
    router.stop()
    console.log(
      `\nStopped. received=${stats.received} sent=${stats.sent} filtered=${stats.dropped} undelivered=${stats.undelivered}`,
    )
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))

  switch (command) {
    case "list":
      commandList()
      return
    case "init":
      commandInit(flags)
      return
    case "check":
      commandCheck(flags)
      return
    case "run":
      await commandRun(flags)
      return
    default:
      printHelp()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
