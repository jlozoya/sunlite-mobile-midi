import type { AutomationAudioFrame } from "../../shared/automation-types.js"
import { clamp } from "./values.js"

export function normalizeAudioFrame(
  frame: AutomationAudioFrame,
  now: number,
): AutomationAudioFrame {
  return {
    capturedAt: clamp(frame.capturedAt, now - 10000, now + 1000, now),
    sampleRate: clamp(frame.sampleRate, 8000, 192000, 48000),
    features: {
      rms: clamp(frame.features?.rms, 0, 1, 0),
      bass: clamp(frame.features?.bass, 0, 1, 0),
      mid: clamp(frame.features?.mid, 0, 1, 0),
      high: clamp(frame.features?.high, 0, 1, 0),
      flux: clamp(frame.features?.flux, 0, 1, 0),
      centroid: clamp(frame.features?.centroid, 0, 1, 0),
    },
    spectrum: Array.isArray(frame.spectrum)
      ? frame.spectrum.slice(0, 96).map((value) => clamp(value, 0, 1, 0))
      : [],
  }
}
