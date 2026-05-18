import type { MidiCommand } from "../types"

export function sendStandardButtonNoteOn(
  note: number,
  sendCommand: (command: MidiCommand) => void,
) {
  sendCommand({ type: "noteon", note, velocity: 127 })
}

export function sendStandardButtonNoteOff(
  note: number,
  sendCommand: (command: MidiCommand) => void,
) {
  sendCommand({ type: "noteoff", note, velocity: 0 })
}
