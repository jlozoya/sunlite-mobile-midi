import type {
  AutomationTrainingExample,
  MusicalContext,
} from "../../shared/automation-types.js"
import { isMusicalContext } from "../../shared/musical-context.js"
import { temporalDistance } from "./musical-distance.js"

export type LearnedSliderGesture = {
  id: string
  sessionId?: string
  controller: number
  context: MusicalContext
  points: Array<{ t: number; value: number }>
}

export function analyzeSliderGestures(examples: AutomationTrainingExample[]) {
  const groups = new Map<string, AutomationTrainingExample[]>()
  for (const example of examples) {
    if (example.command.type !== "cc") continue
    const key = JSON.stringify([
      example.sessionId ?? "legacy",
      example.command.controller,
    ])
    const group = groups.get(key)
    if (group) group.push(example)
    else groups.set(key, [example])
  }
  const gestures: LearnedSliderGesture[] = []
  let rejectedNoMusicalContext = 0
  for (const group of groups.values()) {
    let segment: AutomationTrainingExample[] = []
    const finish = () => {
      const first = segment[0]
      if (segment.length >= 2 && first.command.type === "cc") {
        const points = segment.map((example) => ({
          t: example.createdAt - first.createdAt,
          value: example.command.type === "cc" ? example.command.value : 0,
        }))
        if (points.at(-1)!.t > 0) {
          // The context tracker may still be warming up, or the gesture may start
          // during silence. Match its first useful musical context while retaining
          // the entire original movement, including its initial level and timing.
          const anchor = segment.find(
            (example) =>
              isMusicalContext(example.context) && example.context.phase !== "silence",
          )?.context
          if (anchor) {
            gestures.push({
              id: `${first.sessionId ?? "legacy"}:${first.id}`,
              sessionId: first.sessionId,
              controller: first.command.controller,
              context: anchor,
              points,
            })
          } else rejectedNoMusicalContext++
        }
      }
      segment = []
    }
    for (const example of [...group].sort((a, b) => a.createdAt - b.createdAt)) {
      if (segment.length && example.createdAt - segment.at(-1)!.createdAt > 750) finish()
      segment.push(example)
    }
    finish()
  }
  return { gestures, rejectedNoMusicalContext }
}

export function learnSliderGestures(
  examples: AutomationTrainingExample[],
): LearnedSliderGesture[] {
  return analyzeSliderGestures(examples).gestures
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
    if (gesture.context.phase === "silence") continue
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

const SUPPORT_CONTEXT_DISTANCE = 0.12
const MINIMUM_GESTURE_RANGE = 5

function isSignificantGesture(gesture: LearnedSliderGesture): boolean {
  if (!gesture.sessionId || gesture.context.phase === "silence") return false
  const values = gesture.points.map((point) => point.value)
  return Math.max(...values) - Math.min(...values) >= MINIMUM_GESTURE_RANGE
}

function supportedGesturePools(gestures: LearnedSliderGesture[]) {
  const pools = new Map<string, LearnedSliderGesture[]>()
  for (const gesture of gestures) {
    if (!isSignificantGesture(gesture)) continue
    const key = `${gesture.controller}:${gesture.context.phase}`
    const pool = pools.get(key)
    if (pool) pool.push(gesture)
    else pools.set(key, [gesture])
  }
  return pools
}

/** Hundreds of samples from one drag are one demonstration, not repeated evidence. */
export function selectSupportedSliderGestures(
  gestures: LearnedSliderGesture[],
  context: MusicalContext,
) {
  if (context.phase === "silence") return []
  const pools = supportedGesturePools(gestures)
  const best = new Map<
    number,
    { gesture: LearnedSliderGesture; confidence: number; distance: number }
  >()
  for (const pool of pools.values()) {
    for (const gesture of pool) {
      const distance = temporalDistance(context, gesture.context)
      const similarity = Math.max(0, 1 - distance / 0.65)
      if (similarity <= (best.get(gesture.controller)?.confidence ?? 0)) continue
      const sessions = new Map<string, number>()
      for (const supporter of pool) {
        if (
          temporalDistance(gesture.context, supporter.context) > SUPPORT_CONTEXT_DISTANCE
        )
          continue
        const confidence = Math.max(
          0,
          1 - temporalDistance(context, supporter.context) / 0.65,
        )
        sessions.set(
          supporter.sessionId!,
          Math.max(sessions.get(supporter.sessionId!) ?? 0, confidence),
        )
      }
      if (sessions.size < 2) continue
      const support = [...sessions.values()].sort((a, b) => b - a).slice(0, 2)
      const confidence = Math.min(similarity, (support[0] + support[1]) / 2)
      if (confidence > (best.get(gesture.controller)?.confidence ?? 0))
        best.set(gesture.controller, { gesture, confidence, distance })
    }
  }
  return [...best.values()]
}

export function getUnsupportedSliderControllers(gestures: LearnedSliderGesture[]) {
  const supported = new Set<number>()
  for (const pool of supportedGesturePools(gestures).values()) {
    if (supported.has(pool[0].controller)) continue
    const hasSupport = pool.some((gesture) =>
      pool.some(
        (other) =>
          other.sessionId !== gesture.sessionId &&
          temporalDistance(gesture.context, other.context) <= SUPPORT_CONTEXT_DISTANCE,
      ),
    )
    if (hasSupport) supported.add(pool[0].controller)
  }
  return [...new Set(gestures.map((gesture) => gesture.controller))].filter(
    (controller) => !supported.has(controller),
  )
}

export function sliderGestureValue(
  gesture: LearnedSliderGesture,
  elapsed: number,
): number {
  const points = gesture.points
  // Upper bound: keep the last value when several hardware messages share a
  // timestamp, and avoid rescanning dense curves on every playback/validation tick.
  let left = 0,
    right = points.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (points[middle].t <= elapsed) left = middle + 1
    else right = middle
  }
  if (right === points.length) return points.at(-1)!.value
  if (right === 0) return points[0].value
  const a = points[right - 1],
    b = points[right]
  return Math.round(a.value + ((b.value - a.value) * (elapsed - a.t)) / (b.t - a.t))
}
