import type { AutomationAudioFrame } from "../../../shared/automation-types"

function averageRange(
  frequencyData: Uint8Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): number {
  const nyquist = sampleRate / 2
  const start = Math.max(0, Math.floor((minHz / nyquist) * frequencyData.length))
  const end = Math.min(
    frequencyData.length - 1,
    Math.ceil((maxHz / nyquist) * frequencyData.length),
  )
  let total = 0
  let count = 0
  for (let index = start; index <= end; index += 1) {
    total += frequencyData[index] / 255
    count += 1
  }
  return count ? total / count : 0
}

function compactSpectrum(frequencyData: Uint8Array, sampleRate: number): number[] {
  const nyquist = sampleRate / 2
  const bands = 64
  const minHz = 35
  const maxHz = Math.min(18000, nyquist)
  const result: number[] = []

  for (let band = 0; band < bands; band += 1) {
    const lowRatio = band / bands
    const highRatio = (band + 1) / bands
    const lowHz = minHz * Math.pow(maxHz / minHz, lowRatio)
    const highHz = minHz * Math.pow(maxHz / minHz, highRatio)
    result.push(averageRange(frequencyData, sampleRate, lowHz, highHz))
  }
  return result
}

function makeFrame(
  analyser: AnalyserNode,
  previousSpectrum: number[],
): AutomationAudioFrame {
  const frequencyData = new Uint8Array(analyser.frequencyBinCount)
  const timeData = new Float32Array(analyser.fftSize)
  analyser.getByteFrequencyData(frequencyData)
  analyser.getFloatTimeDomainData(timeData)

  let squared = 0
  for (const sample of timeData) squared += sample * sample
  const rms = Math.sqrt(squared / Math.max(1, timeData.length))
  const spectrum = compactSpectrum(frequencyData, analyser.context.sampleRate)

  let flux = 0
  let weighted = 0
  let magnitude = 0
  for (let index = 0; index < spectrum.length; index += 1) {
    flux += Math.max(0, spectrum[index] - (previousSpectrum[index] ?? spectrum[index]))
    weighted += spectrum[index] * (index / Math.max(1, spectrum.length - 1))
    magnitude += spectrum[index]
  }

  return {
    capturedAt: Date.now(),
    sampleRate: analyser.context.sampleRate,
    spectrum,
    features: {
      rms: Math.min(1, rms * 3.5),
      bass: averageRange(frequencyData, analyser.context.sampleRate, 35, 250),
      mid: averageRange(frequencyData, analyser.context.sampleRate, 250, 2500),
      high: averageRange(frequencyData, analyser.context.sampleRate, 2500, 14000),
      flux: Math.min(1, (flux / Math.max(1, spectrum.length)) * 5),
      centroid: magnitude > 0 ? weighted / magnitude : 0,
    },
  }
}
export { makeFrame }
