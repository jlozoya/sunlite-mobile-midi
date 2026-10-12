import type { AutomationMidiCommand } from "../../../shared/automation-types"

function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = Math.floor((milliseconds % 60000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatCommand(command: AutomationMidiCommand | undefined): string {
  if (!command) return "Acción MIDI"
  if (command.type === "note" || command.type === "noteon") return `Nota ${command.note}`
  if (command.type === "noteoff") return `Nota ${command.note} off`
  if (command.type === "cc") return `CC ${command.controller} = ${command.value}`
  return `Programa ${command.number}`
}
export { formatDuration, formatCommand }
