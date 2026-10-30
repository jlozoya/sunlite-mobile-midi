import type {
  AutomationMode,
  AutomationSettings,
  MusicalContext,
} from "../../shared/automation-types.js"
import type { ExamplePolicyEngine, PolicyPrediction } from "./policy-engine.js"
import { sliderGestureValue, type LearnedSliderGesture } from "./slider-gestures.js"
import { temporalDistance } from "./musical-distance.js"

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
  private triggered = new Map<number, { gesture: LearnedSliderGesture; source: string }>()
  clear() {
    this.active.clear()
  }
  reset() {
    this.clear()
    this.completed.clear()
    this.triggered.clear()
  }
  get size() {
    return this.active.size
  }
  observeContext(
    source: string,
    context: MusicalContext | null,
    confidenceThreshold: number,
  ) {
    for (const [controller, previous] of this.triggered) {
      if (
        previous.source !== source ||
        !context ||
        context.phase === "silence" ||
        Math.max(0, 1 - temporalDistance(context, previous.gesture.context) / 0.65) <
          Math.max(0, confidenceThreshold - 0.1)
      )
        this.triggered.delete(controller)
    }
  }
  tick(
    now: number,
    source: string,
    context: MusicalContext,
    mode: AutomationMode,
    settings: AutomationSettings,
    manualOverrideUntil: number,
    policy: ExamplePolicyEngine,
    apply: (prediction: PolicyPrediction, trigger: string) => boolean | void,
  ) {
    this.observeContext(source, context, settings.confidenceThreshold)
    if (mode === "manual" || now < manualOverrideUntil || context.phase === "silence") {
      this.clear()
      return
    }
    for (const [controller, playback] of this.active) {
      if (playback.source !== source || settings.blockedControllers.includes(controller))
        this.active.delete(controller)
    }
    for (const candidate of policy.predictSliderGestures(context)) {
      const { gesture, confidence } = candidate
      if (
        this.active.has(gesture.controller) ||
        this.triggered.has(gesture.controller) ||
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
      this.triggered.set(gesture.controller, { gesture, source })
    }
    for (const [controller, playback] of this.active) {
      const elapsed = now - playback.startedAt
      const delivered = apply(
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
      if (delivered === false) {
        this.active.delete(controller)
        this.triggered.delete(controller)
        this.completed.set(controller, now)
        continue
      }
      if (elapsed >= playback.gesture.points.at(-1)!.t) {
        this.active.delete(controller)
        this.completed.set(controller, now)
      }
    }
  }
}
