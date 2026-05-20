import type {
  MidiButtonConfig,
  MidiControllerModel,
  MidiFaderConfig,
  MidiPadConfig,
  PadColor,
} from "../controller-config.js"

const NAMED_APC_MINI_MK2_PAD_COLORS: Record<number, PadColor> = {
  56: "red",
  57: "amber",
  58: "purple",
  59: "purple",
  60: "purple",
  61: "purple",
  62: "yellow",
  63: "cyan",
  48: "cyan",
  49: "green",
}

function getApcMiniMk2PadNote(row: number, column: number): number {
  return (7 - row) * 8 + column
}

const APC_MINI_MK2_PAD_GRID: MidiPadConfig[] = Array.from({ length: 64 }, (_, index) => {
  const row = Math.floor(index / 8)
  const column = index % 8
  const note = getApcMiniMk2PadNote(row, column)

  return {
    id: `pad-r${row + 1}-c${column + 1}`,
    label: `Pad ${index + 1}`,
    note,
    row,
    column,
    defaultColor: NAMED_APC_MINI_MK2_PAD_COLORS[note] ?? "off",
  }
})

const APC_MINI_MK2_SIDE_BUTTONS: MidiButtonConfig[] = Array.from(
  { length: 8 },
  (_, index) => ({
    id: `scene-launch-${index + 1}`,
    label: `Scene ${index + 1}`,
    note: 112 + index,
  }),
)

const APC_MINI_MK2_BOTTOM_BUTTONS: MidiButtonConfig[] = Array.from(
  { length: 8 },
  (_, index) => ({
    id: `bottom-control-${index + 1}`,
    label: `Bottom ${index + 1}`,
    note: 100 + index,
  }),
)

const APC_MINI_MK2_CORNER_BUTTON: MidiButtonConfig = {
  id: "corner-control",
  label: "Corner",
  note: 122,
}

const APC_MINI_MK2_FADERS: MidiFaderConfig[] = [
  { id: "fader-1", label: "Fader 1", controller: 48, defaultValue: 0 },
  { id: "fader-2", label: "Fader 2", controller: 49, defaultValue: 0 },
  { id: "fader-3", label: "Fader 3", controller: 50, defaultValue: 0 },
  { id: "fader-4", label: "Fader 4", controller: 51, defaultValue: 0 },
  { id: "fader-5", label: "Fader 5", controller: 52, defaultValue: 0 },
  { id: "fader-6", label: "Fader 6", controller: 53, defaultValue: 0 },
  { id: "fader-7", label: "Fader 7", controller: 54, defaultValue: 0 },
  { id: "fader-8", label: "Fader 8", controller: 55, defaultValue: 0 },
  { id: "fader-9", label: "Master", controller: 56, defaultValue: 127 },
]

export const AKAI_APC_MINI_MK2_MODEL: MidiControllerModel = {
  id: "akai-apc-mini-mk2",
  name: "Akai APC Mini mk2",
  description: "8x8 RGB pad matrix with right-hand scene launch, bottom row, and faders.",
  padColumns: 8,
  bottomButtonColumns: 8,
  faderColumns: 9,
  padGrid: APC_MINI_MK2_PAD_GRID,
  sideButtons: APC_MINI_MK2_SIDE_BUTTONS,
  bottomButtons: APC_MINI_MK2_BOTTOM_BUTTONS,
  cornerButton: APC_MINI_MK2_CORNER_BUTTON,
  faders: APC_MINI_MK2_FADERS,
}
