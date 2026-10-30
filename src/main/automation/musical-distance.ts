import type { MusicalContext } from "../../shared/automation-types.js"

const contextFields: Array<[keyof MusicalContext, number]> = [
  ["energy", 2],
  ["bassRatio", 1],
  ["midRatio", 0.5],
  ["highRatio", 1],
  ["flux", 0.5],
  ["energyTrend", 3],
  ["brightnessTrend", 1.5],
  ["bassChange", 2],
  ["pulseDensity", 1],
  ["buildStrength", 2],
  ["dropStrength", 2],
  ["phaseProgress", 2],
]

export function temporalDistance(a: MusicalContext, b: MusicalContext): number {
  let sum = 0,
    weights = 0
  for (const [field, weight] of contextFields) {
    sum += Math.pow(Number(a[field]) - Number(b[field]), 2) * weight
    weights += weight
  }
  return Math.sqrt(sum / weights) + (a.phase === b.phase ? 0 : 0.35)
}
