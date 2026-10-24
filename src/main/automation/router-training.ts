import type { AutomationMidiCommand } from "../../shared/automation-types.js"
import type { RouterConfig } from "../../shared/router-types.js"

/** Learn delivered hardware gestures, never software feedback or fan-out copies. */
export function recordRoutedCommands(
  config: RouterConfig,
  source: string,
  messages: readonly { bytes: readonly number[] }[],
  record: (command: AutomationMidiCommand) => void,
): void {
  if (
    !config.ports.some(
      (port) => port.id === source && port.role === "input" && port.kind === "hardware",
    )
  )
    return
  const seen = new Set<string>()
  for (const { bytes } of messages) {
    if (!bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255))
      continue
    const type = (bytes[0] ?? 0) & 0xf0
    if (bytes[0] < 0x80 || bytes[0] >= 0xf0) continue
    if (
      bytes.length < (type === 0xc0 ? 2 : 3) ||
      bytes.slice(1).some((byte) => byte > 127)
    )
      continue
    let command: AutomationMidiCommand
    if (type === 0x90 || type === 0x80) {
      command = {
        type: type === 0x80 || bytes[2] === 0 ? "noteoff" : "noteon",
        note: bytes[1],
        velocity: bytes[2],
      }
    } else if (type === 0xb0) {
      command = { type: "cc", controller: bytes[1], value: bytes[2] }
    } else if (type === 0xc0) {
      command = { type: "program", number: bytes[1] }
    } else continue
    const key = JSON.stringify(command)
    if (seen.has(key)) continue
    seen.add(key)
    record(command)
  }
}
