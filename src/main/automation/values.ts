import type {
  AutomationMidiCommand,
  DjLinkBridgeStatus,
} from "../../shared/automation-types.js"

export const EMPTY_BRIDGE_STATUS: DjLinkBridgeStatus = {
  available: false,
  running: false,
  connected: false,
  message: "PRO DJ LINK bridge is not started",
  executablePath: null,
  lastEventAt: null,
}

export function commandLabel(command: AutomationMidiCommand): string {
  if (command.type === "note" || command.type === "noteon") return `nota ${command.note}`
  if (command.type === "cc") return `CC ${command.controller} = ${command.value}`
  if (command.type === "program") return `programa ${command.number}`
  return `fin de nota ${command.note}`
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, numeric))
}
export { clamp }
