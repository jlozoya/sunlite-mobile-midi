import type { AutomationTimelineEvent } from "../../../shared/automation-types"
import { detectSliderGestures, type SliderGesture } from "./slider-curves"
import { formatCommand } from "./automation-format"

export type ReviewAction = {
  id: string
  label: string
  lane: string
  start: number
  end: number
  points: { id: string; t: number }[]
  gesture?: SliderGesture
  value?: number
}

/** A complete slider movement is one editable action, not hundreds of CC samples. */
export function reviewActions(timeline: AutomationTimelineEvent[]): ReviewAction[] {
  const gestures = detectSliderGestures(timeline)
  const grouped = new Set(gestures.flatMap((gesture) => gesture.points.map((p) => p.id)))
  return [
    ...gestures.map((gesture) => ({
      id: gesture.id,
      label: `Slider CC ${gesture.controller}`,
      lane: `Slider CC ${gesture.controller}`,
      start: gesture.start,
      end: gesture.end,
      points: gesture.points,
      gesture,
    })),
    ...timeline.flatMap((event) => {
      const example = event.example
      if (event.kind !== "example" || !example || grouped.has(example.id)) return []
      const command = example.command
      const label = formatCommand(command)
      return [
        {
          id: example.id,
          label,
          lane: command.type === "cc" ? `Slider CC ${command.controller}` : label,
          start: event.t,
          end: event.t,
          points: [{ id: example.id, t: event.t }],
          value: command.type === "cc" ? command.value : undefined,
        },
      ]
    }),
  ].sort((a, b) => a.start - b.start)
}

export function shiftedAction(action: ReviewAction, start: number) {
  const offset = Math.max(0, start) - action.start
  return action.points.map((point) => ({ id: point.id, t: point.t + offset }))
}
