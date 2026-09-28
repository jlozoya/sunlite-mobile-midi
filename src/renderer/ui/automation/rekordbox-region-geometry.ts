import type { RekordboxCaptureRegion } from "../../../shared/rekordbox-capture"

export type RegionHandle = "move" | "nw" | "ne" | "sw" | "se"

const MIN_SIZE = 0.025
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export function transformRegion(
  region: RekordboxCaptureRegion,
  handle: RegionHandle,
  dx: number,
  dy: number,
): RekordboxCaptureRegion {
  if (handle === "move") {
    return {
      ...region,
      x: clamp(region.x + dx, 0, 1 - region.width),
      y: clamp(region.y + dy, 0, 1 - region.height),
    }
  }
  const right = region.x + region.width
  const bottom = region.y + region.height
  const left = handle.endsWith("w") ? clamp(region.x + dx, 0, right - MIN_SIZE) : region.x
  const top = handle.startsWith("n")
    ? clamp(region.y + dy, 0, bottom - MIN_SIZE)
    : region.y
  const nextRight = handle.endsWith("e") ? clamp(right + dx, left + MIN_SIZE, 1) : right
  const nextBottom = handle.startsWith("s")
    ? clamp(bottom + dy, top + MIN_SIZE, 1)
    : bottom
  return { x: left, y: top, width: nextRight - left, height: nextBottom - top }
}
