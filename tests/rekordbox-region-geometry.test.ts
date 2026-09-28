import { describe, expect, test } from "bun:test"
import { transformRegion } from "../src/renderer/ui/automation/rekordbox-region-geometry"

const region = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 }

describe("Rekordbox region handles", () => {
  test("moving preserves size and stays inside the window", () => {
    expect(transformRegion(region, "move", 2, -2)).toEqual({
      x: 0.6,
      y: 0,
      width: 0.4,
      height: 0.2,
    })
  })

  test("resizing one corner keeps the opposite corner fixed", () => {
    const resized = transformRegion(region, "nw", -0.1, -0.1)
    expect(resized.x).toBeCloseTo(0.1)
    expect(resized.y).toBeCloseTo(0.2)
    expect(resized.x + resized.width).toBeCloseTo(0.6)
    expect(resized.y + resized.height).toBeCloseTo(0.5)
  })

  test("corners cannot invert or leave the captured window", () => {
    const smaller = transformRegion(region, "se", -2, -2)
    expect(smaller.width).toBeCloseTo(0.025)
    expect(smaller.height).toBeCloseTo(0.025)
    const larger = transformRegion(region, "se", 2, 2)
    expect(larger.x + larger.width).toBe(1)
    expect(larger.y + larger.height).toBe(1)
  })
})
