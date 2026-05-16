import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useState } from "react"
import { Button, Input, Label, TextField } from "react-aria-components"
import { FADERS, PAD_GRID, SCENE_BUTTONS, type ButtonCustomization, type ControllerCustomization, type FaderCustomization } from "../../../shared/controller-config.ts"
import { styles } from "../styles"
import type { EditableControl } from "../types"

export type ControllerConfigModalProps = {
  control: EditableControl
  customization: ControllerCustomization
  midiChannel: number
  onClose: () => void
  onSave: (customization: ControllerCustomization) => void
}

export function ControllerConfigModal({ control, customization, midiChannel, onClose, onSave }: ControllerConfigModalProps) {
  const target = useMemo(() => getEditableControlTarget(control, customization), [control, customization])
  const [buttonDraft, setButtonDraft] = useState<ButtonCustomization | null>(target.kind === "button" ? target.config : null)
  const [faderDraft, setFaderDraft] = useState<FaderCustomization | null>(target.kind === "fader" ? target.config : null)

  useEffect(() => {
    setButtonDraft(target.kind === "button" ? target.config : null)
    setFaderDraft(target.kind === "fader" ? target.config : null)
  }, [target])

  function save() {
    if (control.kind === "pad" && buttonDraft) {
      const current = customization.pads[String(control.note)] ?? buttonDraft
      onSave({
        ...customization,
        pads: {
          ...customization.pads,
          [String(control.note)]: normalizeStandardButtonCustomization(current, buttonDraft.label, control.note),
        },
      })
      return
    }

    if (control.kind === "scene" && buttonDraft) {
      const current = customization.sceneButtons[String(control.note)] ?? buttonDraft
      onSave({
        ...customization,
        sceneButtons: {
          ...customization.sceneButtons,
          [String(control.note)]: normalizeStandardButtonCustomization(current, buttonDraft.label, control.note),
        },
      })
      return
    }

    if (control.kind === "fader" && faderDraft) {
      const current = customization.faders[String(control.controller)] ?? faderDraft
      onSave({
        ...customization,
        faders: {
          ...customization.faders,
          [String(control.controller)]: {
            ...current,
            label: faderDraft.label,
            controller: control.controller,
            minValue: 0,
            maxValue: 127,
          },
        },
      })
    }
  }

  return (
    <div {...stylex.props(styles.modalBackdrop)} onMouseDown={onClose}>
      <section {...stylex.props(styles.modalPanel)} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="MIDI control configuration">
        <div {...stylex.props(styles.modalHeader)}>
          <div>
            <h2 {...stylex.props(styles.modalTitle)}>MIDI control configuration</h2>
            <p {...stylex.props(styles.sectionDescription)}>Right-click editing · Global MIDI channel {midiChannel}</p>
          </div>
          <Button {...stylex.props(styles.iconButton)} onPress={onClose}>×</Button>
        </div>

        {target.kind === "button" && buttonDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextField {...stylex.props(styles.fieldGroup)} value={buttonDraft.label} onChange={(label) => setButtonDraft({ ...buttonDraft, label })}>
              <Label>Button text</Label>
              <Input {...stylex.props(styles.textInput)} />
            </TextField>

            <div {...stylex.props(styles.helpBox)}>
              <strong>Standard APC Mini mapping</strong>
              <span>This app uses the fixed APC-style note for this button. Color and lit/off state are controlled only by MIDI OUT feedback from Sunlite. Configure Sunlite to send feedback to <strong>Sunlite Mobile Out</strong>.</span>
            </div>
          </div>
        ) : null}

        {target.kind === "fader" && faderDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextField {...stylex.props(styles.fieldGroup)} value={faderDraft.label} onChange={(label) => setFaderDraft({ ...faderDraft, label })}>
              <Label>Fader text</Label>
              <Input {...stylex.props(styles.textInput)} />
            </TextField>
            <div {...stylex.props(styles.helpBox)}>
              <strong>Standard APC Mini mapping</strong>
              <span>This fader keeps its fixed APC-style CC number. Only the displayed text is editable here.</span>
            </div>
          </div>
        ) : null}

        <div {...stylex.props(styles.modalActions)}>
          <Button {...stylex.props(styles.setupButton, styles.setupButtonSecondary)} onPress={onClose}>Cancel</Button>
          <Button {...stylex.props(styles.setupButton)} onPress={save}>Save configuration</Button>
        </div>
      </section>
    </div>
  )
}

function getEditableControlTarget(control: EditableControl, customization: ControllerCustomization) {
  if (control.kind === "pad") {
    const pad = PAD_GRID.find((item) => item.note === control.note)
    return {
      kind: "button" as const,
      config: customization.pads[String(control.note)] ?? {
        label: pad?.label ?? `Pad ${control.note}`,
        offColor: pad?.defaultColor ?? "off",
        onColor: "green" as const,
        messageType: "note" as const,
        midiNumber: control.note,
        onValue: 127,
        offValue: 0,
        mode: "trigger" as const,
        offDelayMs: 0,
        initialActive: false,
      },
    }
  }

  if (control.kind === "scene") {
    const scene = SCENE_BUTTONS.find((item) => item.note === control.note)
    return {
      kind: "button" as const,
      config: customization.sceneButtons[String(control.note)] ?? {
        label: scene?.label ?? `Scene ${control.note}`,
        offColor: "blue" as const,
        onColor: "white" as const,
        messageType: "note" as const,
        midiNumber: control.note,
        onValue: 127,
        offValue: 0,
        mode: "trigger" as const,
        offDelayMs: 0,
        initialActive: false,
      },
    }
  }

  const fader = FADERS.find((item) => item.controller === control.controller)
  return {
    kind: "fader" as const,
    config: customization.faders[String(control.controller)] ?? {
      label: fader?.label ?? `CC ${control.controller}`,
      controller: control.controller,
      minValue: 0,
      maxValue: 127,
      defaultValue: fader?.defaultValue ?? 0,
    },
  }
}

function normalizeStandardButtonCustomization(current: ButtonCustomization, label: string, note: number): ButtonCustomization {
  return {
    ...current,
    label,
    messageType: "note",
    midiNumber: note,
    onValue: 127,
    offValue: 0,
    mode: "momentary",
    offDelayMs: 0,
    initialActive: false,
  }
}
