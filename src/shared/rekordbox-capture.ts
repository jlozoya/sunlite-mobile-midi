export type RekordboxDeckNumber = 1 | 2 | 3 | 4

export type RekordboxCaptureRegion = {
  x: number
  y: number
  width: number
  height: number
}

export type RekordboxCaptureRegions = Partial<
  Record<RekordboxDeckNumber, RekordboxCaptureRegion>
>

export type RekordboxCaptureStatus = {
  available: boolean
  regions: RekordboxCaptureRegions
}

export function normalizeCaptureRegions(value: unknown): RekordboxCaptureRegions {
  if (!value || typeof value !== "object") return {}

  const result: RekordboxCaptureRegions = {}
  const source = value as Record<string, unknown>
  for (const deck of [1, 2, 3, 4] as const) {
    const candidate = source[String(deck)]
    if (!candidate || typeof candidate !== "object") continue
    const region = candidate as Record<string, unknown>
    const { x, y, width, height } = region
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width < 0.02 ||
      height < 0.02 ||
      x + width > 1.001 ||
      y + height > 1.001
    ) {
      continue
    }
    result[deck] = { x, y, width, height }
  }
  return result
}

export const REKORDBOX_EXPORT_REGIONS: RekordboxCaptureRegions = {
  1: { x: 0.043, y: 0.075, width: 0.843, height: 0.08 },
  2: { x: 0.043, y: 0.348, width: 0.843, height: 0.075 },
}
