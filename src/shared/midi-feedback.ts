type MidiPadFeedback = {
  velocity: number
  behaviorChannel: number
}

type MidiFeedbackState = {
  padStates: Record<number, MidiPadFeedback>
  ccValues: Record<number, number>
}
export type { MidiPadFeedback, MidiFeedbackState }
