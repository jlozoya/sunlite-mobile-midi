import type { MidiCommand } from "../types"
import type { ButtonCustomization } from "../../../shared/controller-config"

export function sendStandardButtonNoteOn(
  note: number,
  sendCommand: (command: MidiCommand) => void,
  config?: ButtonCustomization,
) {
  sendCommand({
    type: "noteon",
    note: config?.midiNumber ?? note,
    velocity: config?.onValue ?? 127,
  })
}

export function sendStandardButtonNoteOff(
  note: number,
  sendCommand: (command: MidiCommand) => void,
  config?: ButtonCustomization,
) {
  sendCommand({
    type: "noteoff",
    note: config?.midiNumber ?? note,
    velocity: config?.offValue ?? 0,
  })
}
