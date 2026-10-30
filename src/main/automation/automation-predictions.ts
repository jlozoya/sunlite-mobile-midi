import type { AudioFeatures, MusicalContext } from "../../shared/automation-types.js"
import type { ExamplePolicyEngine } from "./policy-engine.js"

/** Each independent note group can act on its demonstrated beat. */
export function predictTriggeredActions(
  policy: Pick<ExamplePolicyEngine, "predictActions">,
  features: AudioFeatures,
  beatWithinBar: number,
  bpm: number,
  context: MusicalContext | null,
  trigger: "audio" | "pro-dj-link",
) {
  return policy
    .predictActions(features, beatWithinBar, bpm, context)
    .filter(
      (prediction) =>
        !(
          prediction.temporal &&
          trigger === "pro-dj-link" &&
          prediction.beatWithinBar &&
          beatWithinBar !== prediction.beatWithinBar
        ),
    )
}
