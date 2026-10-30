import { expect, test } from "bun:test"
import type {
  AutomationTimelineEvent,
  AutomationMidiCommand,
} from "../src/shared/automation-types"
import {
  reviewActions,
  shiftedAction,
} from "../src/renderer/ui/automation/training-review"

function event(
  id: string,
  t: number,
  command: AutomationMidiCommand,
): AutomationTimelineEvent {
  return {
    t,
    at: "",
    kind: "example",
    example: {
      id,
      createdAt: t,
      command,
      bpm: 120,
      beatWithinBar: 1,
      features: { rms: 0.5, bass: 0.4, mid: 0.3, high: 0.2, flux: 0.1, centroid: 0.3 },
    },
  }
}

test("shows a dense slider gesture once and retains simultaneous notes on their own tracks", () => {
  const events = Array.from({ length: 61 }, (_, i) =>
    event(`cc-${i}`, 4000 + i * 50, {
      type: "cc",
      controller: 55,
      value: Math.round((i * 127) / 60),
    }),
  )
  events.push(
    event("note-a", 4000, { type: "noteon", note: 24, velocity: 127 }),
    event("note-b", 4000, { type: "noteon", note: 27, velocity: 127 }),
  )
  const actions = reviewActions(events)
  expect(actions).toHaveLength(3)
  expect(actions.map((action) => action.start)).toEqual([4000, 4000, 4000])
  expect(new Set(actions.map((action) => action.lane)).size).toBe(3)
  expect(actions[0].points).toHaveLength(61)
  const original = structuredClone(actions[0])
  const moved = shiftedAction(actions[0], 6000)
  expect(moved[0].t).toBe(6000)
  expect(moved.at(-1)!.t).toBe(9000)
  expect(moved.map((point) => point.id)).toEqual(
    actions[0].points.map((point) => point.id),
  )
  expect(actions[0]).toEqual(original)
})

test("includes older notes, isolated CC and separate movements instead of limiting the list to twelve notes", () => {
  const events = Array.from({ length: 25 }, (_, i) =>
    event(`note-${i}`, i * 1000, { type: "note", note: 24, velocity: 127 }),
  )
  events.push(event("isolated", 500, { type: "cc", controller: 56, value: 80 }))
  const actions = reviewActions(events.reverse())
  expect(actions).toHaveLength(26)
  expect(actions[0].start).toBe(0)
  expect(actions[1].value).toBe(80)
  expect(actions.at(-1)!.start).toBe(24000)
})
