import type { AudioFeatures } from "../../shared/automation-types.js"
import { MusicalContextTracker } from "../../shared/musical-context.js"
import { AudioRhythmTracker } from "./audio-rhythm.js"

export class AutomationInputContext {
  private histories = new Map<string, MusicalContextTracker>()
  private rhythm = new AudioRhythmTracker()
  private positions = new Map<number, { at: number; position: number }>()
  audioBpm = 0

  private push(source: string, features: AudioFeatures, at: number, bpm: number) {
    const history = this.histories.get(source) ?? new MusicalContextTracker()
    this.histories.set(source, history)
    return history.push(features, at, bpm)
  }

  audio(features: AudioFeatures, at: number, deckBpm: number) {
    const rhythm = this.rhythm.observe(features, at)
    this.audioBpm = rhythm.confidence >= 0.7 ? rhythm.bpm : 0
    return {
      rhythm,
      context: this.push("audio", features, at, deckBpm || this.audioBpm || 120),
    }
  }

  deck(
    device: number,
    features: AudioFeatures,
    at: number,
    bpm: number,
    positionMs?: number,
  ) {
    const previous = this.positions.get(device)
    if (positionMs !== undefined) {
      if (
        previous &&
        (positionMs < previous.position - 100 ||
          Math.abs(positionMs - previous.position - (at - previous.at)) > 2000)
      )
        this.clearDeck(device)
      this.positions.set(device, { at, position: positionMs })
    }
    return this.push(`deck:${device}`, features, at, bpm)
  }
  get(source: string, at: number) {
    return this.histories.get(source)?.get(at) ?? null
  }
  clearAudio() {
    this.histories.delete("audio")
    this.rhythm.reset()
    this.audioBpm = 0
  }
  clearDeck(device: number) {
    this.histories.delete(`deck:${device}`)
    this.positions.delete(device)
  }
}
