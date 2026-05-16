export type PadColor = "off" | "red" | "amber" | "yellow" | "green" | "cyan" | "blue" | "purple" | "white"
export type MidiButtonMessageType = "note" | "cc" | "program"
export type MidiButtonMode = "trigger" | "momentary" | "toggle"

export type MidiPadConfig = {
  id: string
  label: string
  note: number
  row: number
  column: number
  defaultColor?: PadColor
}

export type MidiSceneButtonConfig = {
  id: string
  label: string
  note: number
}

export type MidiFaderConfig = {
  id: string
  label: string
  controller: number
  defaultValue: number
}

export type ButtonCustomization = {
  label: string
  offColor: PadColor
  onColor: PadColor
  messageType: MidiButtonMessageType
  midiNumber: number
  onValue: number
  offValue: number
  mode: MidiButtonMode
  offDelayMs: number
  initialActive: boolean
}

export type SceneButtonCustomization = ButtonCustomization

export type FaderCustomization = {
  label: string
  controller: number
  minValue: number
  maxValue: number
  defaultValue: number
}

export type ControllerCustomization = {
  pads: Record<string, ButtonCustomization>
  sceneButtons: Record<string, SceneButtonCustomization>
  faders: Record<string, FaderCustomization>
}

const NAMED_PAD_LABELS: Record<number, string> = {
  56: "Blackout",
  57: "Full On",
  58: "Scene 1",
  59: "Scene 2",
  60: "Scene 3",
  61: "Scene 4",
  62: "Strobe",
  63: "Move 1",
  48: "Move 2",
  49: "Chase",
}

const NAMED_PAD_COLORS: Record<number, PadColor> = {
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

function getApcPadNote(row: number, column: number): number {
  return (7 - row) * 8 + column
}

export const PAD_GRID: MidiPadConfig[] = Array.from({ length: 64 }, (_, index) => {
  const row = Math.floor(index / 8)
  const column = index % 8
  const note = getApcPadNote(row, column)

  return {
    id: `pad-r${row + 1}-c${column + 1}`,
    label: NAMED_PAD_LABELS[note] ?? `Pad ${note}`,
    note,
    row,
    column,
    defaultColor: NAMED_PAD_COLORS[note] ?? "off",
  }
})

export const SCENE_BUTTONS: MidiSceneButtonConfig[] = Array.from({ length: 8 }, (_, index) => ({
  id: `scene-launch-${index + 1}`,
  label: `Scene ${index + 1}`,
  note: 112 + index,
}))

export const FADERS: MidiFaderConfig[] = [
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

export const PAD_COLOR_OPTIONS: PadColor[] = ["off", "red", "amber", "yellow", "green", "cyan", "blue", "purple", "white"]
export const MIDI_BUTTON_MESSAGE_TYPES: MidiButtonMessageType[] = ["note", "cc", "program"]
export const MIDI_BUTTON_MODES: MidiButtonMode[] = ["trigger", "momentary", "toggle"]

function defaultButtonCustomization(label: string, midiNumber: number, offColor: PadColor, onColor: PadColor): ButtonCustomization {
  return {
    label,
    offColor,
    onColor,
    messageType: "note",
    midiNumber,
    onValue: 127,
    offValue: 0,
    mode: "trigger",
    offDelayMs: 0,
    initialActive: false,
  }
}

export const DEFAULT_CONTROLLER_CUSTOMIZATION: ControllerCustomization = {
  pads: Object.fromEntries(
    PAD_GRID.map((pad) => [
      String(pad.note),
      defaultButtonCustomization(
        pad.label,
        pad.note,
        pad.defaultColor ?? "off",
        pad.defaultColor && pad.defaultColor !== "off" ? pad.defaultColor : "green",
      ),
    ]),
  ),
  sceneButtons: Object.fromEntries(
    SCENE_BUTTONS.map((button) => [String(button.note), defaultButtonCustomization(button.label, button.note, "blue", "white")]),
  ),
  faders: Object.fromEntries(
    FADERS.map((fader) => [
      String(fader.controller),
      {
        label: fader.label,
        controller: fader.controller,
        minValue: 0,
        maxValue: 127,
        defaultValue: fader.defaultValue,
      },
    ]),
  ),
}

export function mergeControllerCustomization(value: unknown): ControllerCustomization {
  const partial = value && typeof value === "object" ? (value as Partial<ControllerCustomization>) : {}

  const pads = { ...DEFAULT_CONTROLLER_CUSTOMIZATION.pads }
  for (const [key, customization] of Object.entries(partial.pads ?? {})) {
    if (!customization || typeof customization !== "object") continue
    const current = pads[key] ?? defaultButtonCustomization(`Pad ${key}`, clampMidiNumber(key), "off", "green")
    pads[key] = mergeButtonCustomization(customization, current)
  }

  const sceneButtons = { ...DEFAULT_CONTROLLER_CUSTOMIZATION.sceneButtons }
  for (const [key, customization] of Object.entries(partial.sceneButtons ?? {})) {
    if (!customization || typeof customization !== "object") continue
    const current = sceneButtons[key] ?? defaultButtonCustomization(`Scene ${key}`, clampMidiNumber(key), "blue", "white")
    sceneButtons[key] = mergeButtonCustomization(customization, current)
  }

  const faders = { ...DEFAULT_CONTROLLER_CUSTOMIZATION.faders }
  for (const [key, customization] of Object.entries(partial.faders ?? {})) {
    if (!customization || typeof customization !== "object") continue
    const current = faders[key] ?? { label: `CC ${key}`, controller: clampMidiNumber(key), minValue: 0, maxValue: 127, defaultValue: 0 }
    faders[key] = {
      label: typeof customization.label === "string" ? customization.label : current.label,
      controller: clampMidiNumber(customization.controller ?? current.controller),
      minValue: clampMidiNumber(customization.minValue ?? current.minValue),
      maxValue: clampMidiNumber(customization.maxValue ?? current.maxValue),
      defaultValue: clampMidiNumber(customization.defaultValue ?? current.defaultValue),
    }
  }

  return { pads, sceneButtons, faders }
}

function mergeButtonCustomization(customization: Partial<ButtonCustomization>, current: ButtonCustomization): ButtonCustomization {
  const legacyMidiNumber = "midiNumber" in customization ? customization.midiNumber : undefined

  return {
    label: typeof customization.label === "string" ? customization.label : current.label,
    offColor: isPadColor(customization.offColor) ? customization.offColor : current.offColor,
    onColor: isPadColor(customization.onColor) ? customization.onColor : current.onColor,
    messageType: isMidiButtonMessageType(customization.messageType) ? customization.messageType : current.messageType,
    midiNumber: clampMidiNumber(legacyMidiNumber ?? current.midiNumber),
    onValue: clampMidiNumber(customization.onValue ?? current.onValue),
    offValue: clampMidiNumber(customization.offValue ?? current.offValue),
    mode: isMidiButtonMode(customization.mode) ? customization.mode : current.mode,
    offDelayMs: clampDelay(customization.offDelayMs ?? current.offDelayMs),
    initialActive: typeof customization.initialActive === "boolean" ? customization.initialActive : current.initialActive,
  }
}

function isPadColor(value: unknown): value is PadColor {
  return typeof value === "string" && (PAD_COLOR_OPTIONS as string[]).includes(value)
}

function isMidiButtonMessageType(value: unknown): value is MidiButtonMessageType {
  return typeof value === "string" && (MIDI_BUTTON_MESSAGE_TYPES as string[]).includes(value)
}

function isMidiButtonMode(value: unknown): value is MidiButtonMode {
  return typeof value === "string" && (MIDI_BUTTON_MODES as string[]).includes(value)
}

function clampMidiNumber(value: unknown): number {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 0
  return Math.max(0, Math.min(127, Math.round(numeric)))
}

function clampDelay(value: unknown): number {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 0
  return Math.max(0, Math.min(5000, Math.round(numeric)))
}
