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
  // Smooth in time, so dense hardware CC bursts do not change the filter's width.
  const radiusMs = 80
  let smoothed = points.map((point) => ({ ...point }))
  for (let pass = 0; pass < 2; pass += 1) {
    smoothed = smoothed.map((point, index, current) => {
      // Keep the intended initial and final fader levels intact.
      if (index === 0 || index === current.length - 1) return { ...point }
      let weightedValue = 0
      let totalWeight = 0
      for (const neighbor of current) {
        const distance = Math.abs(neighbor.t - point.t)
        if (distance >= radiusMs) continue
        const weight = 1 - distance / radiusMs
        weightedValue += neighbor.value * weight
        totalWeight += weight
      }
      return {
        ...point,
        value: Math.max(0, Math.min(127, weightedValue / totalWeight)),
      }
    })
  }
  return smoothed.map((point) => ({ ...point, value: Math.round(point.value) }))
}
