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
  36: "Blackout",
  37: "Full On",
  38: "Scene 1",
  39: "Scene 2",
  40: "Scene 3",
  41: "Scene 4",
  42: "Strobe",
  43: "Move 1",
  44: "Move 2",
  45: "Chase",
}

const NAMED_PAD_COLORS: Record<number, PadColor> = {
  36: "red",
  37: "amber",
  38: "purple",
  39: "purple",
  40: "purple",
  41: "purple",
  42: "yellow",
  43: "cyan",
  44: "cyan",
  45: "green",
}

export const PAD_GRID: MidiPadConfig[] = Array.from({ length: 64 }, (_, index) => {
  const note = 36 + index
  return {
    id: `pad-${note}`,
    label: NAMED_PAD_LABELS[note] ?? `Pad ${index + 1}`,
    note,
    row: Math.floor(index / 8),
    column: index % 8,
    defaultColor: NAMED_PAD_COLORS[note] ?? "off",
  }
})

export const SCENE_BUTTONS: MidiSceneButtonConfig[] = Array.from({ length: 8 }, (_, index) => ({
  id: `scene-launch-${index + 1}`,
  label: `Scene ${index + 1}`,
  note: 100 + index,
}))

export const FADERS: MidiFaderConfig[] = [
  { id: "fader-1", label: "Dimmer", controller: 1, defaultValue: 127 },
  { id: "fader-2", label: "Speed", controller: 2, defaultValue: 64 },
  { id: "fader-3", label: "Red", controller: 3, defaultValue: 0 },
  { id: "fader-4", label: "Green", controller: 4, defaultValue: 0 },
  { id: "fader-5", label: "Blue", controller: 5, defaultValue: 0 },
  { id: "fader-6", label: "White", controller: 6, defaultValue: 0 },
  { id: "fader-7", label: "FX 1", controller: 7, defaultValue: 0 },
  { id: "fader-8", label: "FX 2", controller: 8, defaultValue: 0 },
  { id: "fader-9", label: "Master", controller: 9, defaultValue: 127 },
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
