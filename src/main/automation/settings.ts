import fs from "node:fs"
import type { AutomationSettings } from "../../shared/automation-types.js"
import { clamp } from "./values.js"
import { normalizeNoteGroups } from "../../shared/automation-action-groups.js"

const DEFAULT_SETTINGS: AutomationSettings = {
  confidenceThreshold: 0.62,
  manualOverrideMs: 8000,
  minActionIntervalMs: 900,
  minControllerIntervalMs: 100,
  repeatActionCooldownMs: 4000,
  strobeCooldownMs: 5000,
  blockedNotes: [36, 37],
  strobeNotes: [42],
  blockedControllers: [],
  preferredDeck: null,
}

function midiNumbers(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback
  return [...new Set(value.map((item) => Math.round(clamp(item, 0, 127, 0))))]
}

function loadSettings(filePath: string): AutomationSettings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(filePath, "utf8")))
  } catch {
    return normalizeSettings({})
  }
}

function normalizeSettings(value: unknown): AutomationSettings {
  const source =
    value && typeof value === "object" ? (value as Partial<AutomationSettings>) : {}
  const preferredDeck = Number(source.preferredDeck)

  return {
    confidenceThreshold: clamp(
      source.confidenceThreshold,
      0.25,
      0.98,
      DEFAULT_SETTINGS.confidenceThreshold,
    ),
    manualOverrideMs: Math.round(
      clamp(source.manualOverrideMs, 1000, 60000, DEFAULT_SETTINGS.manualOverrideMs),
    ),
    minActionIntervalMs: Math.round(
      clamp(source.minActionIntervalMs, 250, 30000, DEFAULT_SETTINGS.minActionIntervalMs),
    ),
    minControllerIntervalMs: Math.round(
      clamp(
        source.minControllerIntervalMs,
        50,
        1000,
        DEFAULT_SETTINGS.minControllerIntervalMs!,
      ),
    ),
    repeatActionCooldownMs: Math.round(
      clamp(
        source.repeatActionCooldownMs,
        500,
        120000,
        DEFAULT_SETTINGS.repeatActionCooldownMs,
      ),
    ),
    strobeCooldownMs: Math.round(
      clamp(source.strobeCooldownMs, 1000, 120000, DEFAULT_SETTINGS.strobeCooldownMs),
    ),
    blockedNotes: midiNumbers(source.blockedNotes, DEFAULT_SETTINGS.blockedNotes),
    strobeNotes: midiNumbers(source.strobeNotes, DEFAULT_SETTINGS.strobeNotes),
    blockedControllers: midiNumbers(
      source.blockedControllers,
      DEFAULT_SETTINGS.blockedControllers,
    ),
    preferredDeck:
      Number.isInteger(preferredDeck) && preferredDeck >= 1 && preferredDeck <= 6
        ? preferredDeck
        : null,
    noteGroups: normalizeNoteGroups(source.noteGroups),
  }
}
export { loadSettings, normalizeSettings }
