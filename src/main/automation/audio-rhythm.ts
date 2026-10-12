import type { AudioFeatures } from "../../shared/automation-types.js"

/** Estimate pulse timing from observed onsets. Audio alone does not claim to know the bar's first beat. */
export class AudioRhythmTracker {
  private lastOnset = -Infinity
  private previousFlux = 0
  private fluxes: number[] = []
  private intervals: number[] = []
  private lastAt = 0
  reset() {
    this.lastOnset = -Infinity
    this.previousFlux = 0
    this.fluxes = []
    this.intervals = []
    this.lastAt = 0
  }
  observe(features: AudioFeatures, at: number) {
    if (this.lastAt && (at < this.lastAt || at - this.lastAt > 2500)) this.reset()
    this.lastAt = at
    const mean = this.fluxes.reduce((a, b) => a + b, 0) / Math.max(1, this.fluxes.length)
    const onset =
      features.rms > 0.015 &&
      features.flux > Math.max(0.015, mean * 1.4) &&
      features.flux > this.previousFlux &&
      at - this.lastOnset > 220
    this.fluxes.push(features.flux)
    this.fluxes = this.fluxes.slice(-80)
    this.previousFlux = features.flux
    if (onset) {
      const interval = at - this.lastOnset
      if (interval >= 250 && interval <= 1200) this.intervals.push(interval)
      else this.intervals = []
      this.intervals = this.intervals.slice(-12)
      this.lastOnset = at
    }
    const sorted = [...this.intervals].sort((a, b) => a - b)
    const period = sorted[Math.floor(sorted.length / 2)] ?? 500
    const consistent = sorted.filter(
      (value) => Math.abs(value - period) < period * 0.15,
    ).length
    const confidence =
      sorted.length >= 4 && at - this.lastOnset < period * 3
        ? consistent / sorted.length
        : 0
    return { bpm: 60000 / period, confidence, pulse: onset && confidence >= 0.7, onset }
  }
}
