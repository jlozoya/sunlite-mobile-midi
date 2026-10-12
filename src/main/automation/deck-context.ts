import type {
  AudioFeatures,
  DjLinkBeat,
  DjLinkWaveform,
} from "../../shared/automation-types.js"

type DeckState = {
  features: AudioFeatures
  receivedAt: number
  isPlaying: boolean
  isOnAir: boolean
  isMaster: boolean
}

export function activeDeck(
  decks: ReadonlyMap<number, DeckState>,
  preferred: number | null,
  now: number,
): number | undefined {
  const candidates = [...decks.entries()].filter(
    ([device, entry]) =>
      device >= 1 &&
      device <= 6 &&
      entry.isPlaying &&
      now - entry.receivedAt < 2500 &&
      (!preferred || device === preferred),
  )
  candidates.sort(
    ([leftId, left], [rightId, right]) =>
      Number(right.isOnAir) * 4 +
        Number(right.isMaster) * 2 -
        (Number(left.isOnAir) * 4 + Number(left.isMaster) * 2) || leftId - rightId,
  )
  return candidates[0]?.[0]
}

export function contextBeat(
  decks: ReadonlyMap<number, DeckState>,
  beats: ReadonlyMap<number, DjLinkBeat>,
  waveforms: ReadonlyMap<number, DjLinkWaveform>,
  preferred: number | null,
  now: number,
) {
  const selected = activeDeck(decks, preferred, now) ?? preferred
  if (selected) {
    const beat = beats.get(selected)
    return beat && now - beat.receivedAt < 2200 ? beat : undefined
  }
  return [...beats.values()]
    .filter(
      (beat) =>
        beat.deviceNumber >= 1 &&
        beat.deviceNumber <= 6 &&
        now - beat.receivedAt < 2200 &&
        decks.get(beat.deviceNumber)?.isPlaying !== false,
    )
    .sort(
      (a, b) =>
        Number(Boolean(waveforms.get(b.deviceNumber)?.isMaster)) -
          Number(Boolean(waveforms.get(a.deviceNumber)?.isMaster)) ||
        a.deviceNumber - b.deviceNumber,
    )[0]
}
