import type { AutomationTimelineEvent } from "../../../shared/automation-types"

export type SliderCurvePoint = {
  id: string
  t: number
  value: number
  isNew?: boolean
}

export type SliderGesture = {
  id: string
  controller: number
  start: number
  end: number
  points: SliderCurvePoint[]
}

export function detectSliderGestures(
  timeline: AutomationTimelineEvent[],
  maximumGapMs = 750,
): SliderGesture[] {
  const byController = new Map<number, SliderCurvePoint[]>()

  for (const event of timeline) {
    const command = event.example?.command
    if (event.kind !== "example" || !event.example || command?.type !== "cc") continue
    const points = byController.get(command.controller) ?? []
    points.push({ id: event.example.id, t: event.t, value: command.value })
    byController.set(command.controller, points)
  }

  const gestures: SliderGesture[] = []
  for (const [controller, unordered] of byController) {
    const points = [...unordered].sort((left, right) => left.t - right.t)
    let current: SliderCurvePoint[] = []
    const finish = () => {
      if (current.length >= 2) {
        gestures.push({
          id: `${controller}:${current[0].id}`,
          controller,
          start: current[0].t,
          end: current[current.length - 1].t,
          points: current,
        })
      }
      current = []
    }

    for (const point of points) {
      if (current.length && point.t - current[current.length - 1].t > maximumGapMs) {
        finish()
      }
      current.push(point)
    }
    finish()
  }

  return gestures.sort((left, right) => left.start - right.start)
}

export function averageSliderCurve(points: SliderCurvePoint[]): SliderCurvePoint[] {
  if (points.length < 3) return points.map((point) => ({ ...point }))
  let smoothed = points.map((point) => ({ ...point }))
  for (let pass = 0; pass < 4; pass += 1) {
    smoothed = smoothed.map((point, index, current) => {
      const start = Math.max(0, index - 2)
      const end = Math.min(current.length - 1, index + 2)
      let weightedValue = 0
      let totalWeight = 0
      for (let neighbor = start; neighbor <= end; neighbor += 1) {
        const distance = Math.abs(neighbor - index)
        const weight = distance === 0 ? 4 : distance === 1 ? 2 : 1
        weightedValue += current[neighbor].value * weight
        totalWeight += weight
      }
      return {
        ...point,
        value: Math.max(0, Math.min(127, Math.round(weightedValue / totalWeight))),
      }
    })
  }
  return smoothed
}
