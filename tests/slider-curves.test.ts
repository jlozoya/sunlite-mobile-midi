import { expect, test } from "bun:test"
import {
  averageSliderCurve,
  type SliderCurvePoint,
} from "../src/renderer/ui/automation/slider-curves"

function curve(values: number[], interval = 10): SliderCurvePoint[] {
  return values.map((value, index) => ({
    id: `point-${index}`,
    t: index * interval,
    value,
  }))
}

test("reduces fader jitter while preserving endpoints, timing and original samples", () => {
  const original = curve([0, 25, 10, 55, 40, 85, 70, 110, 127])
  const snapshot = structuredClone(original)
  const smoothed = averageSliderCurve(original)
  const variation = (points: SliderCurvePoint[]) =>
    points
      .slice(1)
      .reduce((sum, point, i) => sum + Math.abs(point.value - points[i].value), 0)

  expect(variation(smoothed)).toBeLessThan(variation(original))
  expect(smoothed[0]).toEqual(original[0])
  expect(smoothed.at(-1)).toEqual(original.at(-1))
  expect(smoothed.map(({ id, t }) => ({ id, t }))).toEqual(
    original.map(({ id, t }) => ({ id, t })),
  )
  expect(original).toEqual(snapshot)
  expect(
    smoothed.every(({ value }) => Number.isInteger(value) && value >= 0 && value <= 127),
  ).toBe(true)
})

test("does not blend distant movements or change a held level", () => {
  const sparse = curve([0, 127, 0], 200)
  expect(averageSliderCurve(sparse)).toEqual(sparse)
  expect(averageSliderCurve(curve([64, 64, 64, 64]))).toEqual(curve([64, 64, 64, 64]))
  expect(averageSliderCurve([])).toEqual([])
  expect(averageSliderCurve(curve([0, 127]))).toEqual(curve([0, 127]))
})
