export type LightingSoftware = "sunlite" | "freestyler"

export const LIGHTING_SOFTWARE_LABELS: Record<LightingSoftware, string> = {
  sunlite: "Sunlite Suite 2",
  freestyler: "FreeStyler",
}

export function isLightingSoftware(value: unknown): value is LightingSoftware {
  return value === "sunlite" || value === "freestyler"
}

// Match physical APC controllers and FreeStyler's checked NoteOn - NoteOff option.
export function noteRelease(_software: LightingSoftware, velocity = 0) {
  return { type: "noteoff" as const, velocity }
}
