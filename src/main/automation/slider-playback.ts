import type {
  AutomationMode,
  AutomationSettings,
  MusicalContext,
} from "../../shared/automation-types.js"
import type { ExamplePolicyEngine, PolicyPrediction } from "./policy-engine.js"
import { sliderGestureValue, type LearnedSliderGesture } from "./slider-gestures.js"

export class SliderPlayback {
  readonly active = new Map<
    number,
    {
      gesture: LearnedSliderGesture
      startedAt: number
      confidence: number
      source: string
    }
  >()
  private completed = new Map<number, number>()
  clear() {
    this.active.clear()
  }
  reset() {
    this.clear()
    this.completed.clear()
  }
  get size() {
    return this.active.size
  }
  tick(
    now: number,
    source: string,
    context: MusicalContext,
    mode: AutomationMode,
    settings: AutomationSettings,
    manualOverrideUntil: number,
    policy: ExamplePolicyEngine,
    apply: (prediction: PolicyPrediction, trigger: string) => void,
  ) {
    for (const [controller, playback] of this.active) {
      if (playback.source !== source || settings.blockedControllers.includes(controller))
        this.active.delete(controller)
    }
    for (const candidate of policy.predictSliderGestures(context)) {
      const { gesture, confidence } = candidate
      if (
        this.active.has(gesture.controller) ||
        now - (this.completed.get(gesture.controller) ?? 0) <
          settings.repeatActionCooldownMs ||
        confidence < settings.confidenceThreshold ||
        now < manualOverrideUntil ||
        settings.blockedControllers.includes(gesture.controller)
      )
        continue
      if (mode === "assist") {
        apply(
          {
            command: {
              type: "cc",
              controller: gesture.controller,
              value: gesture.points[0].value,
            },
            confidence,
            neighborCount: gesture.points.length,
            distance: candidate.distance,
            temporal: true,
          },
          "curva de slider",
        )
        continue
      }
      this.active.set(gesture.controller, {
        gesture,
        confidence,
        startedAt: now,
        source,
      })
    }
    for (const [controller, playback] of this.active) {
      const elapsed = now - playback.startedAt
      apply(
        {
          command: {
            type: "cc",
            controller,
            value: sliderGestureValue(playback.gesture, elapsed),
          },
          confidence: playback.confidence,
          neighborCount: playback.gesture.points.length,
          distance: 0,
          temporal: true,
        },
        "curva de slider",
      )
      if (elapsed >= playback.gesture.points.at(-1)!.t) {
        this.active.delete(controller)
        this.completed.set(controller, now)
      }
    }
  }
}
