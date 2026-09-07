/**
 * Thin wrapper over the native MIDI bindings for enumerating devices.
 *
 * Port indexes are not stable across device plug/unplug, so every open resolves the
 * index again from the device name.
 */
import { Input, Output } from "@julusian/midi"
import type { PortDefinition } from "./types.js"

export type MidiDevice = { index: number; name: string }

function listDevices(kind: "input" | "output"): MidiDevice[] {
  const port = kind === "input" ? new Input() : new Output()
  const devices: MidiDevice[] = []

  try {
    const count = port.getPortCount()
    for (let index = 0; index < count; index += 1) {
      devices.push({ index, name: port.getPortName(index) })
    }
  } finally {
    port.destroy()
  }

  return devices
}

export function listInputDevices(): MidiDevice[] {
  return listDevices("input")
}

export function listOutputDevices(): MidiDevice[] {
  return listDevices("output")
}

export function deviceMatches(
  deviceName: string,
  definition: Pick<PortDefinition, "deviceName" | "match">,
): boolean {
  const candidate = deviceName.toLowerCase()
  const wanted = definition.deviceName.trim().toLowerCase()
  if (wanted === "") return false
  return definition.match === "exact" ? candidate === wanted : candidate.includes(wanted)
}

/** Resolve a port definition to a live device index, or `null` when it is absent. */
export function findDevice(
  devices: readonly MidiDevice[],
  definition: Pick<PortDefinition, "deviceName" | "match">,
): MidiDevice | null {
  return devices.find((device) => deviceMatches(device.name, definition)) ?? null
}
