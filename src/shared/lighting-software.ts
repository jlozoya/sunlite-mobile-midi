export type LightingSoftware = "sunlite" | "freestyler"

export const LIGHTING_SOFTWARE_LABELS: Record<LightingSoftware, string> = {
  sunlite: "Sunlite Suite 2",
  freestyler: "FreeStyler",
}

export function isLightingSoftware(value: unknown): value is LightingSoftware {
  return value === "sunlite" || value === "freestyler"
}

// FreeStyler's default Key Up is Note On with velocity zero. Sunlite keeps
// the existing Note Off transport. Both represent a released MIDI note.
export function noteRelease(software: LightingSoftware, velocity = 0) {
  return software === "freestyler"
    ? { type: "noteon" as const, velocity: 0 }
    : { type: "noteoff" as const, velocity }
}
