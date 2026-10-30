import type {
  AutomationTrainingExample,
  MusicalContext,
  AutomationMidiCommand,
} from "../../shared/automation-types.js"
import { isMusicalContext } from "../../shared/musical-context.js"
import { temporalDistance } from "./musical-distance.js"

export type ActionSequence = {
  id: string
  session: string
  start: number
  context: MusicalContext
  beat: number
  steps: Array<{ beat: number; command: AutomationMidiCommand; context: MusicalContext }>
}

function commandKey(command: AutomationMidiCommand) {
  return command.type === "cc"
    ? `cc:${command.controller}`
    : command.type === "program"
      ? `program:${command.number}`
      : `note:${command.note}`
}

/** Short demonstrated phrases, never an entire song timeline. CC bursts keep their endpoints. */
export function learnActionSequences(examples: AutomationTrainingExample[]) {
  const sessions = new Map<string, AutomationTrainingExample[]>()
  for (const example of examples) {
    if (!example.sessionId || !isMusicalContext(example.context)) continue
    const key = JSON.stringify([example.sessionId, example.inputSource ?? "legacy"])
    const group = sessions.get(key) ?? []
    group.push(example)
    sessions.set(key, group)
  }
  const sequences: ActionSequence[] = []
  for (const group of sessions.values()) {
    let phrase: AutomationTrainingExample[] = []
    const finish = () => {
      const first = phrase[0]
      if (!first || phrase.length < 2 || first.context!.phase === "silence") return
      // Dense samples of a single slider already have a dedicated curve learner.
      if (new Set(phrase.map((item) => commandKey(item.command))).size < 2) return
      const steps: ActionSequence["steps"] = []
      const lastCC = new Map<number, number>()
      let beat = 0
      phrase.forEach((example, index) => {
        if (index) {
          const previous = phrase[index - 1]
          beat +=
            ((example.createdAt - previous.createdAt) * (previous.bpm || 120)) / 60000
        }
        const command = example.command
        if (command.type === "noteoff") return
        if (command.type === "cc") {
          const previous = lastCC.get(command.controller)
          if (previous !== undefined && beat - steps[previous].beat < 0.2) {
            // Keep the start plus the latest point in this short time window.
            const before = steps[previous - 1]
            if (before && commandKey(before.command) === commandKey(command)) {
              steps[previous] = {
                beat,
                command: { ...command },
                context: example.context!,
              }
              return
            }
          }
          lastCC.set(command.controller, steps.length)
        }
        steps.push({
          beat,
          context: example.context!,
          command:
            command.type === "noteon"
              ? {
                  type: "note",
                  note: command.note,
                  velocity: command.velocity,
                  offDelayMs: 250,
                }
              : { ...command },
        })
      })
      steps.sort((a, b) => a.beat - b.beat)
      sequences.push({
        id: first.id,
        session: first.sessionId!,
        start: first.createdAt,
        context: first.context!,
        beat: first.beatWithinBar,
        steps,
      })
    }
    for (const example of [...group].sort((a, b) => a.createdAt - b.createdAt)) {
      const first = phrase[0],
        last = phrase.at(-1)
      if (
        first &&
        last &&
        (example.createdAt - last.createdAt > (2 * 60000) / (last.bpm || 120) ||
          example.createdAt - first.createdAt > (8 * 60000) / (first.bpm || 120))
      ) {
        finish()
        phrase = []
      }
      phrase.push(example)
    }
    finish()
  }
  return sequences
}

// Compare ordered note/program events and sparse CC landmarks, rather than message counts.
function landmarks(sequence: ActionSequence) {
  const steps = sequence.steps.filter((step) => step.command.type !== "cc")
  const controllers = new Set(
    sequence.steps.flatMap((step) =>
      step.command.type === "cc" ? [step.command.controller] : [],
    ),
  )
  for (const controller of controllers) {
    const points = sequence.steps.filter(
      (step) => step.command.type === "cc" && step.command.controller === controller,
    )
    for (const index of new Set([
      0,
      Math.floor((points.length - 1) / 2),
      points.length - 1,
    ]))
      steps.push(points[index])
  }
  return steps.sort((a, b) => a.beat - b.beat)
}

export function sequencesAgree(a: ActionSequence, b: ActionSequence) {
  const left = landmarks(a),
    right = landmarks(b)
  const used = new Set<number>()
  return (
    left.length === right.length &&
    left.every((step) => {
      const index = right.findIndex(
        (other, index) =>
          !used.has(index) &&
          commandKey(step.command) === commandKey(other.command) &&
          Math.abs(step.beat - other.beat) <= 0.35 &&
          (step.command.type !== "cc" ||
            other.command.type !== "cc" ||
            Math.abs(step.command.value - other.command.value) <= 16),
      )
      if (index < 0) return false
      used.add(index)
      return true
    })
  )
}

export function supportedActionSequences(sequences: ActionSequence[]) {
  return sequences.filter((sequence) =>
    sequences.some(
      (other) =>
        other !== sequence &&
        (other.session !== sequence.session ||
          Math.abs(other.start - sequence.start) > 5000) &&
        temporalDistance(sequence.context, other.context) < 0.12 &&
        sequencesAgree(sequence, other),
    ),
  )
}
