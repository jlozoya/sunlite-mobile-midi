/**
 * Owns every physical and virtual MIDI port the router touches.
 *
 * Each device is opened exactly once, no matter how many routes reference it. That
 * single-open rule is what makes the merge direction work at all: Windows MIDI drivers
 * are frequently single-client, so the router holds the device and the applications
 * talk to virtual ports instead.
 */
import { Input, Output } from "@julusian/midi"
import { EventEmitter } from "node:events"
import { findDevice, listInputDevices, listOutputDevices } from "./devices.js"
import type { PortDefinition } from "./types.js"

export type PortStatus = {
  id: string
  role: "input" | "output"
  deviceName: string
  /** The device name Windows actually reported, once resolved. */
  resolvedName: string | null
  connected: boolean
  error: string | null
}

type OpenInput = { definition: PortDefinition; port: Input; resolvedName: string }
type OpenOutput = { definition: PortDefinition; port: Output; resolvedName: string }

const DEFAULT_RESCAN_INTERVAL_MS = 3000

export class MidiPortHub extends EventEmitter {
  private definitions: PortDefinition[] = []
  private inputs = new Map<string, OpenInput>()
  private outputs = new Map<string, OpenOutput>()
  private errors = new Map<string, string>()
  private rescanTimer: NodeJS.Timeout | null = null
  private readonly rescanIntervalMs: number

  constructor(options?: { rescanIntervalMs?: number }) {
    super()
    this.rescanIntervalMs = options?.rescanIntervalMs ?? DEFAULT_RESCAN_INTERVAL_MS
  }

  setPorts(definitions: readonly PortDefinition[]): void {
    this.definitions = [...definitions]
    const known = new Set(this.definitions.map((definition) => definition.id))

    for (const id of [...this.inputs.keys()]) {
      if (!known.has(id)) this.closeInput(id)
    }
    for (const id of [...this.outputs.keys()]) {
      if (!known.has(id)) this.closeOutput(id)
    }

    this.refresh()
  }

  /** Open what can be opened and keep retrying in the background for the rest. */
  start(): void {
    this.refresh()
    if (this.rescanTimer) return
    this.rescanTimer = setInterval(() => this.refresh(), this.rescanIntervalMs)
    this.rescanTimer.unref?.()
  }

  stop(): void {
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }
    for (const id of [...this.inputs.keys()]) this.closeInput(id)
    for (const id of [...this.outputs.keys()]) this.closeOutput(id)
  }

  /** `false` when the destination is not currently open. */
  send(portId: string, bytes: readonly number[]): boolean {
    const output = this.outputs.get(portId)
    if (!output) return false

    try {
      output.port.sendMessage([...bytes])
      return true
    } catch (error) {
      this.errors.set(portId, error instanceof Error ? error.message : String(error))
      this.closeOutput(portId)
      this.emit("status", this.status())
      return false
    }
  }

  isOpen(portId: string): boolean {
    return this.inputs.has(portId) || this.outputs.has(portId)
  }

  status(): PortStatus[] {
    return this.definitions.map((definition) => {
      const open =
        definition.role === "input"
          ? this.inputs.get(definition.id)
          : this.outputs.get(definition.id)

      return {
        id: definition.id,
        role: definition.role,
        deviceName: definition.deviceName,
        resolvedName: open?.resolvedName ?? null,
        connected: open !== undefined,
        error: this.errors.get(definition.id) ?? null,
      }
    })
  }

  /** Re-resolve every definition: open what appeared, drop what disappeared. */
  refresh(): void {
    // Only enumerate the roles actually in use. Constructing an input probe on a
    // machine with no MIDI inputs makes RtMidi print a warning on every scan.
    const needsInputs = this.definitions.some((definition) => definition.role === "input")
    const needsOutputs = this.definitions.some(
      (definition) => definition.role === "output",
    )
    const availableInputs = needsInputs ? listInputDevices() : []
    const availableOutputs = needsOutputs ? listOutputDevices() : []
    let changed = false

    for (const definition of this.definitions) {
      const devices = definition.role === "input" ? availableInputs : availableOutputs
      const device = findDevice(devices, definition)
      const isOpen =
        definition.role === "input"
          ? this.inputs.has(definition.id)
          : this.outputs.has(definition.id)

      if (!device) {
        if (isOpen) {
          if (definition.role === "input") this.closeInput(definition.id)
          else this.closeOutput(definition.id)
          this.errors.set(definition.id, "Device disconnected.")
          changed = true
        }
        continue
      }

      if (isOpen) continue

      try {
        if (definition.role === "input")
          this.openInput(definition, device.index, device.name)
        else this.openOutput(definition, device.index, device.name)
        this.errors.delete(definition.id)
        changed = true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // A busy device is normal while another application still holds it; the next
        // scan will pick it up once the port is released.
        if (this.errors.get(definition.id) !== message) {
          this.errors.set(definition.id, message)
          changed = true
        }
      }
    }

    if (changed) this.emit("status", this.status())
  }

  private openInput(definition: PortDefinition, index: number, resolvedName: string) {
    const port = new Input()
    // Sysex and timing pass through; active sensing is dropped because it is pure
    // heartbeat traffic that would otherwise flood every destination.
    port.ignoreTypes(false, false, true)
    port.openPort(index)
    port.on("message", (deltaTime, bytes) => {
      this.emit("message", definition.id, bytes, deltaTime)
    })
    this.inputs.set(definition.id, { definition, port, resolvedName })
  }

  private openOutput(definition: PortDefinition, index: number, resolvedName: string) {
    const port = new Output()
    port.openPort(index)
    this.outputs.set(definition.id, { definition, port, resolvedName })
  }

  private closeInput(id: string) {
    const open = this.inputs.get(id)
    if (!open) return
    this.inputs.delete(id)
    try {
      open.port.closePort()
      open.port.destroy()
    } catch {
      // The port is going away either way.
    }
  }

  private closeOutput(id: string) {
    const open = this.outputs.get(id)
    if (!open) return
    this.outputs.delete(id)
    try {
      open.port.closePort()
      open.port.destroy()
    } catch {
      // The port is going away either way.
    }
  }
}
