import { describe, expect, test } from "bun:test"
import {
  normalizeCaptureRegions,
  REKORDBOX_EXPORT_REGIONS,
} from "../src/shared/rekordbox-capture"

describe("Rekordbox capture regions", () => {
  test("keeps only valid deck rectangles inside the captured window", () => {
    const regions = normalizeCaptureRegions({
      1: REKORDBOX_EXPORT_REGIONS[1],
      2: { x: 0.95, y: 0.2, width: 0.1, height: 0.2 },
      3: { x: NaN, y: 0, width: 0.2, height: 0.2 },
      4: { x: 0, y: 0, width: 0.01, height: 0.2 },
      5: { x: 0, y: 0, width: 1, height: 1 },
    })
    expect(regions).toEqual({ 1: REKORDBOX_EXPORT_REGIONS[1] })
  })

  test("accepts a rectangle touching the lower right corner", () => {
    expect(
      normalizeCaptureRegions({ 4: { x: 0.8, y: 0.8, width: 0.2, height: 0.2 } }),
    ).toEqual({
      4: { x: 0.8, y: 0.8, width: 0.2, height: 0.2 },
    })
  })
})
