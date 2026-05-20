import { CONTROLLER_MODELS, DEFAULT_CONTROLLER_MODEL } from "./controller-models.js"

export type PadColor =
  | "off"
  | "red"
  | "amber"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "white"
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

export type MidiButtonConfig = MidiSceneButtonConfig

export type MidiFaderConfig = {
  id: string
  label: string
  controller: number
  defaultValue: number
}

export type MidiControllerModel = {
  id: string
  name: string
  description: string
  padColumns: number
  bottomButtonColumns: number
  faderColumns: number
  padGrid: MidiPadConfig[]
  sideButtons: MidiButtonConfig[]
  bottomButtons: MidiButtonConfig[]
  cornerButton: MidiButtonConfig | null
  faders: MidiFaderConfig[]
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
  modelId: string
  pads: Record<string, ButtonCustomization>
  sceneButtons: Record<string, SceneButtonCustomization>
  faders: Record<string, FaderCustomization>
}

export { CONTROLLER_MODELS, DEFAULT_CONTROLLER_MODEL }
export const DEFAULT_CONTROLLER_MODEL_ID = DEFAULT_CONTROLLER_MODEL.id

export function getControllerModel(modelId: string | undefined): MidiControllerModel {
  return (
    CONTROLLER_MODELS.find((model) => model.id === modelId) ?? DEFAULT_CONTROLLER_MODEL
  )
}

export function getModelButtons(model: MidiControllerModel): MidiButtonConfig[] {
  return [
    ...model.sideButtons,
    ...model.bottomButtons,
    ...(model.cornerButton ? [model.cornerButton] : []),
  ]
}

export const PAD_COLOR_OPTIONS: PadColor[] = [
  "off",
  "red",
  "amber",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "white",
]
export const MIDI_BUTTON_MESSAGE_TYPES: MidiButtonMessageType[] = [
  "note",
  "cc",
  "program",
]
export const MIDI_BUTTON_MODES: MidiButtonMode[] = ["trigger", "momentary", "toggle"]

function defaultButtonCustomization(
  label: string,
  midiNumber: number,
  offColor: PadColor,
  onColor: PadColor,
): ButtonCustomization {
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
  modelId: DEFAULT_CONTROLLER_MODEL.id,
  pads: Object.fromEntries(
    DEFAULT_CONTROLLER_MODEL.padGrid.map((pad) => [
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
    getModelButtons(DEFAULT_CONTROLLER_MODEL).map((button) => [
      String(button.note),
      defaultButtonCustomization(button.label, button.note, "blue", "white"),
    ]),
  ),
  faders: Object.fromEntries(
    DEFAULT_CONTROLLER_MODEL.faders.map((fader) => [
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
  const partial =
    value && typeof value === "object" ? (value as Partial<ControllerCustomization>) : {}
  const model = getControllerModel(partial.modelId)
  const defaultCustomization =
    model.id === DEFAULT_CONTROLLER_CUSTOMIZATION.modelId
      ? DEFAULT_CONTROLLER_CUSTOMIZATION
      : createDefaultControllerCustomization(model)

  const pads = { ...defaultCustomization.pads }
  for (const [key, customization] of Object.entries(partial.pads ?? {})) {
    if (!customization || typeof customization !== "object") continue
    const current =
      pads[key] ??
      defaultButtonCustomization(`Pad ${key}`, clampMidiNumber(key), "off", "green")
    pads[key] = mergeButtonCustomization(
      refreshLegacyApcMiniPadLabel(customization, current),
      current,
    )
  }

  const sceneButtons = { ...defaultCustomization.sceneButtons }
  for (const [key, customization] of Object.entries(partial.sceneButtons ?? {})) {
    if (!customization || typeof customization !== "object") continue
    const current =
      sceneButtons[key] ??
      defaultButtonCustomization(`Scene ${key}`, clampMidiNumber(key), "blue", "white")
    sceneButtons[key] = mergeButtonCustomization(customization, current)
  }

  const faders = { ...defaultCustomization.faders }
  for (const [key, customization] of Object.entries(partial.faders ?? {})) {
    if (!customization || typeof customization !== "object") continue
    const current = faders[key] ?? {
      label: `CC ${key}`,
      controller: clampMidiNumber(key),
      minValue: 0,
      maxValue: 127,
      defaultValue: 0,
    }
    faders[key] = {
      label:
        typeof customization.label === "string" ? customization.label : current.label,
      controller: clampMidiNumber(customization.controller ?? current.controller),
      minValue: clampMidiNumber(customization.minValue ?? current.minValue),
      maxValue: clampMidiNumber(customization.maxValue ?? current.maxValue),
      defaultValue: clampMidiNumber(customization.defaultValue ?? current.defaultValue),
    }
  }

  return { modelId: model.id, pads, sceneButtons, faders }
}

function refreshLegacyApcMiniPadLabel(
  customization: Partial<ButtonCustomization>,
  current: ButtonCustomization,
): Partial<ButtonCustomization> {
  if (
    typeof customization.label !== "string" ||
    current.label === customization.label ||
    customization.label === `Pad ${current.midiNumber}` ||
    LEGACY_APC_MINI_PAD_LABELS.has(customization.label)
  ) {
    return { ...customization, label: current.label }
  }

  return customization
}

const LEGACY_APC_MINI_PAD_LABELS = new Set([
  "Blackout",
  "Full On",
  "Scene 1",
  "Scene 2",
  "Scene 3",
  "Scene 4",
  "Strobe",
  "Move 1",
  "Move 2",
  "Chase",
])

function createDefaultControllerCustomization(
  model: MidiControllerModel,
): ControllerCustomization {
  return {
    modelId: model.id,
    pads: Object.fromEntries(
      model.padGrid.map((pad) => [
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
      getModelButtons(model).map((button) => [
        String(button.note),
        defaultButtonCustomization(button.label, button.note, "blue", "white"),
      ]),
    ),
    faders: Object.fromEntries(
      model.faders.map((fader) => [
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
}

function mergeButtonCustomization(
  customization: Partial<ButtonCustomization>,
  current: ButtonCustomization,
): ButtonCustomization {
  const legacyMidiNumber =
    "midiNumber" in customization ? customization.midiNumber : undefined

  return {
    label: typeof customization.label === "string" ? customization.label : current.label,
    offColor: isPadColor(customization.offColor)
      ? customization.offColor
      : current.offColor,
    onColor: isPadColor(customization.onColor) ? customization.onColor : current.onColor,
    messageType: isMidiButtonMessageType(customization.messageType)
      ? customization.messageType
      : current.messageType,
    midiNumber: clampMidiNumber(legacyMidiNumber ?? current.midiNumber),
    onValue: clampMidiNumber(customization.onValue ?? current.onValue),
    offValue: clampMidiNumber(customization.offValue ?? current.offValue),
    mode: isMidiButtonMode(customization.mode) ? customization.mode : current.mode,
    offDelayMs: clampDelay(customization.offDelayMs ?? current.offDelayMs),
    initialActive:
      typeof customization.initialActive === "boolean"
        ? customization.initialActive
        : current.initialActive,
  }
}

function isPadColor(value: unknown): value is PadColor {
  return typeof value === "string" && (PAD_COLOR_OPTIONS as string[]).includes(value)
}

function isMidiButtonMessageType(value: unknown): value is MidiButtonMessageType {
  return (
    typeof value === "string" && (MIDI_BUTTON_MESSAGE_TYPES as string[]).includes(value)
  )
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
