import type {
  AutomationMode,
  AutomationSettings,
  MusicalContext,
} from "../../shared/automation-types.js"
import type { PolicyPrediction } from "./policy-engine.js"
import type { ActionSequence } from "./action-sequences.js"
import { sequencesAgree } from "./action-sequences.js"
import { temporalDistance } from "./musical-distance.js"

/** Event-driven playback: nothing fires without fresh musical input. */
export class SequencePlayback {
  ownsActions = false
  private active: {
    sequence: ActionSequence
    source: string
    progress: number
    at: number
    next: number
    confidence: number
  } | null = null
  private latched: ActionSequence | null = null
  reset() {
    this.ownsActions = false
    this.active = null
    this.latched = null
  }
  tick(
    now: number,
    source: string,
    context: MusicalContext | null,
    bpm: number,
    beat: number,
    mode: AutomationMode,
    settings: AutomationSettings,
    overrideUntil: number,
    sequences: ActionSequence[],
    apply: (prediction: PolicyPrediction, trigger: string) => boolean | void,
  ) {
    this.ownsActions = false
    if (
      !context ||
      context.phase === "silence" ||
      mode === "manual" ||
      now < overrideUntil
    ) {
      this.reset()
      return
    }
    if (this.active && (this.active.source !== source || now - this.active.at > 1000)) {
      this.reset()
      return
    }
    if (this.latched && temporalDistance(context, this.latched.context) > 0.3)
      this.latched = null
    if (!this.active && !this.latched) {
      const candidate = sequences
        .map((sequence) => ({
          sequence,
          distance: temporalDistance(context, sequence.context),
        }))
        .filter(({ sequence }) => !beat || !sequence.beat || beat === sequence.beat)
        .sort((a, b) => a.distance - b.distance)[0]
      if (!candidate || 1 - candidate.distance / 0.65 < settings.confidenceThreshold)
        return
      // Abstain when similarly plausible demonstrations prescribe different phrases.
      const ambiguous = sequences.some(
        (sequence) =>
          sequence !== candidate.sequence &&
          temporalDistance(context, sequence.context) <= candidate.distance + 0.03 &&
          !sequencesAgree(sequence, candidate.sequence),
      )
      if (ambiguous) {
        this.ownsActions = true
        return
      }
      this.active = {
        sequence: candidate.sequence,
        source,
        at: now,
        progress: 0,
        next: 0,
        confidence: 1 - candidate.distance / 0.65,
      }
      this.latched = candidate.sequence
    }
    const active = this.active
    this.ownsActions = !!active || !!this.latched?.steps.at(-1)?.beat
    if (!active) return
    active.progress +=
      (Math.max(0, now - active.at) * Math.max(50, Math.min(240, bpm || 120))) / 60000
    active.at = now
    while (active.next < active.sequence.steps.length) {
      const step = active.sequence.steps[active.next]
      if (step.beat > active.progress + 0.02) break
      // A phrase is conditional on the demonstrated musical evolution, not a blind macro.
      if (temporalDistance(context, step.context) > 0.3) {
        this.active = null
        return
      }
      if (
        apply(
          {
            command: step.command,
            confidence: active.confidence,
            neighborCount: 2,
            distance: 1 - active.confidence,
            temporal: true,
          },
          "secuencia aprendida",
        ) === false
      ) {
        this.active = null
        return
      }
      active.next++
    }
    if (active.next === active.sequence.steps.length || mode === "assist")
      this.active = null
  }
}
