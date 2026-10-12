import type { AudioFeatures, MusicalContext, MusicalPhase } from "./automation-types.js"

type Sample = { at: number; features: AudioFeatures }
const clip = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
const ratio = (features: AudioFeatures, band: "bass" | "mid" | "high") =>
  features[band] / Math.max(0.001, features.bass + features.mid + features.high)

/** Causal, tempo-relative descriptors. Song identity and absolute track time never enter the model. */
export class MusicalContextTracker {
  private samples: Sample[] = []
  private lastTransitionAt = -Infinity
  private lastBuildAt = -Infinity
  private phaseStartedAt = 0
  private current: MusicalContext | null = null

  reset() {
    this.samples = []
    this.current = null
    this.lastBuildAt = -Infinity
    this.lastTransitionAt = -Infinity
    this.phaseStartedAt = 0
  }

  push(features: AudioFeatures, at: number, bpm = 120): MusicalContext | null {
    const last = this.samples.at(-1)
    if (last && (at < last.at || at - last.at > 2500)) this.reset()
    if (last?.at === at) return this.current
    this.samples.push({ at, features: { ...features } })
    const beatMs = 60000 / clip(bpm || 120, 50, 240)
    this.samples = this.samples
      .filter((sample) => at - sample.at <= Math.max(12000, beatMs * 24))
      .slice(-720)
    if (this.samples.length < 8 || at - this.samples[0].at < 1500) return null
    const recent = this.samples.filter((sample) => at - sample.at <= beatMs)
    const previous = this.samples.filter(
      (sample) => at - sample.at > beatMs && at - sample.at <= beatMs * 4,
    )
    const history = this.samples.filter((sample) => at - sample.at <= beatMs * 16)
    const levels = history.map((sample) => sample.features.rms).sort((a, b) => a - b)
    const baseline = Math.max(
      0.015,
      levels[Math.floor((levels.length - 1) * 0.9)] ?? features.rms,
    )
    const energyNow = mean(recent.map((sample) => sample.features.rms))
    const energyBefore = mean(previous.map((sample) => sample.features.rms))
    const old = history.slice(0, Math.max(1, Math.floor(history.length / 3)))
    const energyTrend = clip(
      (energyNow - mean(old.map((sample) => sample.features.rms))) / baseline,
      -1,
      1,
    )
    const brightness = ratio(features, "high")
    const brightnessTrend = clip(
      brightness - mean(old.map((sample) => ratio(sample.features, "high"))),
      -1,
      1,
    )
    const bassChange = clip(
      ratio(features, "bass") -
        mean(previous.map((sample) => ratio(sample.features, "bass"))),
      -1,
      1,
    )
    const fluxBaseline = Math.max(0.01, ...history.map((sample) => sample.features.flux))
    const jump = (energyNow - energyBefore) / baseline
    const buildStrength = clip(
      Math.max(0, energyTrend) * 1.5 * (jump > 0.02 ? 1 : 0) +
        Math.max(0, brightnessTrend) +
        Math.max(0, -bassChange) * 0.4,
    )
    const dropStrength = clip(Math.max(0, jump) + Math.max(0, bassChange))
    let phase: MusicalPhase = features.rms < 0.01 ? "silence" : "steady"
    if (phase !== "silence") {
      if (jump < -0.3) phase = "break"
      else if (
        dropStrength > 0.35 &&
        at - this.lastBuildAt < beatMs * 12 &&
        at - this.lastTransitionAt > beatMs * 2
      ) {
        phase = "drop"
        this.lastTransitionAt = at
      } else if (
        this.current?.phase === "drop" &&
        at - this.lastTransitionAt < beatMs * 2
      )
        phase = "drop"
      else if (buildStrength > 0.3) phase = "build"
    }
    if (buildStrength > 0.3) this.lastBuildAt = at
    if (phase !== this.current?.phase) this.phaseStartedAt = at
    this.current = {
      version: 1,
      phase,
      energy: clip(energyNow / baseline),
      bassRatio: ratio(features, "bass"),
      midRatio: ratio(features, "mid"),
      highRatio: brightness,
      brightness,
      flux: clip(features.flux / fluxBaseline),
      energyTrend,
      brightnessTrend,
      bassChange,
      pulseDensity: mean(
        recent.map((sample) => (sample.features.flux > fluxBaseline * 0.55 ? 1 : 0)),
      ),
      buildStrength,
      dropStrength,
      historyBeats: clip((at - history[0].at) / beatMs / 16),
      phaseProgress: clip((at - this.phaseStartedAt) / beatMs / 8),
    }
    return this.current
  }

  get(at: number): MusicalContext | null {
    return this.samples.length && at - this.samples.at(-1)!.at <= 2500
      ? this.current
      : null
  }
}

export function isMusicalContext(value: unknown): value is MusicalContext {
  if (!value || typeof value !== "object") return false
  const context = value as MusicalContext
  if (
    context.version !== 1 ||
    !["silence", "steady", "build", "drop", "break"].includes(context.phase)
  )
    return false
  return [
    "energy",
    "bassRatio",
    "midRatio",
    "highRatio",
    "brightness",
    "flux",
    "energyTrend",
    "brightnessTrend",
    "bassChange",
    "pulseDensity",
    "buildStrength",
    "dropStrength",
    "historyBeats",
    "phaseProgress",
  ].every(
    (key) =>
      Number.isFinite(context[key as keyof MusicalContext]) &&
      Math.abs(Number(context[key as keyof MusicalContext])) <= 1,
  )
}
