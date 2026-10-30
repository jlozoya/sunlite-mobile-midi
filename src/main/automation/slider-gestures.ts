import type {
  AutomationTrainingExample,
  MusicalContext,
} from "../../shared/automation-types.js"
import { isMusicalContext } from "../../shared/musical-context.js"
import { temporalDistance } from "./temporal-policy.js"

export type LearnedSliderGesture = {
  id: string
  controller: number
  context: MusicalContext
  points: Array<{ t: number; value: number }>
}

export function learnSliderGestures(
  examples: AutomationTrainingExample[],
): LearnedSliderGesture[] {
  const groups = new Map<string, AutomationTrainingExample[]>()
  for (const example of examples) {
    if (example.command.type !== "cc") continue
    const key = JSON.stringify([
      example.sessionId ?? "legacy",
      example.command.controller,
    ])
    groups.set(key, [...(groups.get(key) ?? []), example])
  }
  const gestures: LearnedSliderGesture[] = []
  for (const group of groups.values()) {
    let segment: AutomationTrainingExample[] = []
    const finish = () => {
      const first = segment[0]
      if (
        segment.length >= 2 &&
        first.command.type === "cc" &&
        isMusicalContext(first.context)
      ) {
        const points = segment.map((example) => ({
          t: example.createdAt - first.createdAt,
          value: example.command.type === "cc" ? example.command.value : 0,
        }))
        if (points.at(-1)!.t > 0)
          gestures.push({
            id: `${first.sessionId ?? "legacy"}:${first.id}`,
            controller: first.command.controller,
            context: first.context,
            points,
          })
      }
      segment = []
    }
    for (const example of [...group].sort((a, b) => a.createdAt - b.createdAt)) {
      if (segment.length && example.createdAt - segment.at(-1)!.createdAt > 750) finish()
      segment.push(example)
    }
    finish()
  }
  return gestures
}

export function selectSliderGestures(
  gestures: LearnedSliderGesture[],
  context: MusicalContext,
) {
  if (context.phase === "silence") return []
  const best = new Map<
    number,
    { gesture: LearnedSliderGesture; confidence: number; distance: number }
  >()
  for (const gesture of gestures) {
    const distance = temporalDistance(context, gesture.context)
    if (
      !best.has(gesture.controller) ||
      distance < best.get(gesture.controller)!.distance
    )
      best.set(gesture.controller, {
        gesture,
        distance,
        confidence: Math.max(0, 1 - distance / 0.65),
      })
  }
  return [...best.values()]
}

export function sliderGestureValue(
  gesture: LearnedSliderGesture,
  elapsed: number,
): number {
  const points = gesture.points
  const right = points.findIndex((point) => point.t > elapsed)
  if (right < 0) return points.at(-1)!.value
  if (right === 0) return points[0].value
  const a = points[right - 1],
    b = points[right]
  return Math.round(a.value + ((b.value - a.value) * (elapsed - a.t)) / (b.t - a.t))
}
