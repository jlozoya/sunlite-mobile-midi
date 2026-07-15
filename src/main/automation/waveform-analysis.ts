import type { WaveformHD } from "prolink-connect"
import type { AudioFeatures, DjLinkWaveform } from "../../shared/automation-types.js"

const PREVIEW_SEGMENTS = 720
const WAVEFORM_SEGMENTS_PER_SECOND = 150

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function compactWaveform(
  segments: WaveformHD,
  targetSize = PREVIEW_SEGMENTS,
): Pick<DjLinkWaveform, "heights" | "colors"> {
  if (!segments.length) return { heights: [], colors: [] }

  const size = Math.max(1, Math.min(targetSize, segments.length))
  const heights: number[] = []
  const colors: Array<[number, number, number]> = []

  for (let index = 0; index < size; index += 1) {
    const start = Math.floor((index / size) * segments.length)
    const end = Math.max(start + 1, Math.floor(((index + 1) / size) * segments.length))
    let height = 0
    let red = 0
    let green = 0
    let blue = 0

    for (let segmentIndex = start; segmentIndex < end; segmentIndex += 1) {
      const segment = segments[segmentIndex]
      height += segment.height / 31
      red += clamp01(segment.color[0])
      green += clamp01(segment.color[1])
      blue += clamp01(segment.color[2])
    }

    const count = Math.max(1, end - start)
    heights.push(Math.round(clamp01(height / count) * 255))
    colors.push([
      Math.round((red / count) * 255),
      Math.round((green / count) * 255),
      Math.round((blue / count) * 255),
    ])
  }

  return { heights, colors }
}

export function waveformFeatures(
  segments: WaveformHD,
  positionMs: number,
): AudioFeatures {
  if (!segments.length) {
    return { rms: 0, bass: 0, mid: 0, high: 0, flux: 0, centroid: 0 }
  }

  const center = Math.round((positionMs / 1000) * WAVEFORM_SEGMENTS_PER_SECOND)
  const start = Math.max(0, center - WAVEFORM_SEGMENTS_PER_SECOND)
  const end = Math.min(segments.length, center + WAVEFORM_SEGMENTS_PER_SECOND * 3)
  const window = segments.slice(start, Math.max(start + 1, end))
  let rms = 0
  let bass = 0
  let mid = 0
  let high = 0
  let flux = 0
  let previousHeight = window[0]?.height ?? 0

  for (const segment of window) {
    const height = clamp01(segment.height / 31)
    rms += height
    bass += height * clamp01(segment.color[0])
    mid += height * clamp01(segment.color[1])
    high += height * clamp01(segment.color[2])
    flux += Math.max(0, height - previousHeight / 31)
    previousHeight = segment.height
  }

  const count = Math.max(1, window.length)
  rms = clamp01(rms / count)
  bass = clamp01((bass / count) * 1.8)
  mid = clamp01((mid / count) * 1.8)
  high = clamp01((high / count) * 1.8)
  flux = clamp01((flux / count) * 8)
  const totalBands = bass + mid + high
  const centroid =
    totalBands > 0 ? clamp01((bass * 0.15 + mid * 0.5 + high * 0.9) / totalBands) : 0

  return { rms, bass, mid, high, flux, centroid }
}
