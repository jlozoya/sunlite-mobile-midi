import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import {
  getModelButtons,
  type ButtonCustomization,
  type ControllerCustomization,
  type FaderCustomization,
  type MidiControllerModel,
} from "../../../shared/controller-config.ts"
import type { EditableControl } from "../types"
import { ActionButton, Notice, SectionHeader, Surface, TextInputField } from "../ui-kit"

export type ControllerConfigModalProps = {
  control: EditableControl
  model: MidiControllerModel
  customization: ControllerCustomization
  midiChannel: number
  onClose: () => void
  onSave: (customization: ControllerCustomization) => void
}

export function ControllerConfigModal({
  control,
  model,
  customization,
  midiChannel,
  onClose,
  onSave,
}: ControllerConfigModalProps) {
  const target = useMemo(
    () => getEditableControlTarget(control, model, customization),
    [control, model, customization],
  )
  const [buttonDraft, setButtonDraft] = useState<ButtonCustomization | null>(
    target.kind === "button" ? target.config : null,
  )
  const [faderDraft, setFaderDraft] = useState<FaderCustomization | null>(
    target.kind === "fader" ? target.config : null,
  )

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
          [String(control.note)]: normalizeStandardButtonCustomization(
            current,
            buttonDraft.label,
            control.note,
          ),
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
          [String(control.note)]: normalizeStandardButtonCustomization(
            current,
            buttonDraft.label,
            control.note,
          ),
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

  function handleSaveOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return

    event.preventDefault()
    event.stopPropagation()
    save()
  }

  return (
    <div {...stylex.props(styles.modalBackdrop)} onMouseDown={onClose}>
      <Surface
        variant="solid"
        {...stylex.props(styles.modalPanel)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="MIDI control configuration"
      >
        <div {...stylex.props(styles.modalHeader)}>
          <SectionHeader
            title="MIDI control configuration"
            description={`Right-click editing · Global MIDI channel ${midiChannel}`}
          />
          <ActionButton
            variant="ghost"
            size="small"
            aria-label="Close configuration"
            onPress={onClose}
          >
            ×
          </ActionButton>
        </div>

        {target.kind === "button" && buttonDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextInputField
              label="Button text"
              value={buttonDraft.label}
              onChange={(label) => setButtonDraft({ ...buttonDraft, label })}
              inputProps={{ onKeyDown: handleSaveOnEnter }}
            />

            <Notice tone="info" layout="stack" {...stylex.props(styles.helpBox)}>
              <strong>Standard {model.name} mapping</strong>
              <span>
                This app uses the fixed {model.name} note for this button. Color and
                lit/off state are controlled only by MIDI OUT feedback from your lighting
                software. Configure Sunlite or FreeStyler to send feedback to{" "}
                <strong>Sunlite Mobile Out</strong>.
              </span>
            </Notice>
          </div>
        ) : null}

        {target.kind === "fader" && faderDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextInputField
              label="Fader text"
              value={faderDraft.label}
              onChange={(label) => setFaderDraft({ ...faderDraft, label })}
              inputProps={{ onKeyDown: handleSaveOnEnter }}
            />
            <Notice tone="info" layout="stack" {...stylex.props(styles.helpBox)}>
              <strong>Standard {model.name} mapping</strong>
              <span>
                This fader keeps its fixed {model.name} CC number. Only the displayed text
                is editable here.
              </span>
            </Notice>
          </div>
        ) : null}

        <div {...stylex.props(styles.modalActions)}>
          <ActionButton variant="secondary" onPress={onClose}>
            Cancel
          </ActionButton>
          <ActionButton onPress={save}>Save configuration</ActionButton>
        </div>
      </Surface>
    </div>
  )
}

function getEditableControlTarget(
  control: EditableControl,
  model: MidiControllerModel,
  customization: ControllerCustomization,
) {
  if (control.kind === "pad") {
    const pad = model.padGrid.find((item) => item.note === control.note)
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
    const scene = getModelButtons(model).find((item) => item.note === control.note)
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

  const fader = model.faders.find((item) => item.controller === control.controller)
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

function normalizeStandardButtonCustomization(
  current: ButtonCustomization,
  label: string,
  note: number,
): ButtonCustomization {
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

const styles = stylex.create({
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "grid",
    placeItems: "center",
    backgroundColor: "rgba(2, 6, 23, 0.74)",
    padding: "20px",
  },
  modalPanel: {
    width: "min(100%, 720px)",
    maxHeight: "min(92vh, 760px)",
    overflow: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    marginBottom: "16px",
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 720px)": "repeat(2, minmax(0, 1fr))",
    },
    gap: "12px",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "18px",
  },
  helpBox: {
    gridColumn: "1 / -1",
  },
})
