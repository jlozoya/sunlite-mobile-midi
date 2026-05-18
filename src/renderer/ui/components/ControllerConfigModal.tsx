import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { Button, Input, Label, TextField } from "react-aria-components"
import {
  FADERS,
  PAD_GRID,
  SCENE_BUTTONS,
  type ButtonCustomization,
  type ControllerCustomization,
  type FaderCustomization,
} from "../../../shared/controller-config.ts"
import type { EditableControl } from "../types"

export type ControllerConfigModalProps = {
  control: EditableControl
  customization: ControllerCustomization
  midiChannel: number
  onClose: () => void
  onSave: (customization: ControllerCustomization) => void
}

export function ControllerConfigModal({
  control,
  customization,
  midiChannel,
  onClose,
  onSave,
}: ControllerConfigModalProps) {
  const target = useMemo(
    () => getEditableControlTarget(control, customization),
    [control, customization],
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
      <section
        {...stylex.props(styles.modalPanel)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="MIDI control configuration"
      >
        <div {...stylex.props(styles.modalHeader)}>
          <div>
            <h2 {...stylex.props(styles.modalTitle)}>MIDI control configuration</h2>
            <p {...stylex.props(styles.sectionDescription)}>
              Right-click editing · Global MIDI channel {midiChannel}
            </p>
          </div>
          <Button {...stylex.props(styles.iconButton)} onPress={onClose}>
            ×
          </Button>
        </div>

        {target.kind === "button" && buttonDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextField
              {...stylex.props(styles.fieldGroup)}
              value={buttonDraft.label}
              onChange={(label) => setButtonDraft({ ...buttonDraft, label })}
            >
              <Label>Button text</Label>
              <Input {...stylex.props(styles.textInput)} onKeyDown={handleSaveOnEnter} />
            </TextField>

            <div {...stylex.props(styles.helpBox)}>
              <strong>Standard APC Mini mapping</strong>
              <span>
                This app uses the fixed APC-style note for this button. Color and lit/off
                state are controlled only by MIDI OUT feedback from Sunlite. Configure
                Sunlite to send feedback to <strong>Sunlite Mobile Out</strong>.
              </span>
            </div>
          </div>
        ) : null}

        {target.kind === "fader" && faderDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextField
              {...stylex.props(styles.fieldGroup)}
              value={faderDraft.label}
              onChange={(label) => setFaderDraft({ ...faderDraft, label })}
            >
              <Label>Fader text</Label>
              <Input {...stylex.props(styles.textInput)} onKeyDown={handleSaveOnEnter} />
            </TextField>
            <div {...stylex.props(styles.helpBox)}>
              <strong>Standard APC Mini mapping</strong>
              <span>
                This fader keeps its fixed APC-style CC number. Only the displayed text is
                editable here.
              </span>
            </div>
          </div>
        ) : null}

        <div {...stylex.props(styles.modalActions)}>
          <Button
            {...stylex.props(styles.setupButton, styles.setupButtonSecondary)}
            onPress={onClose}
          >
            Cancel
          </Button>
          <Button {...stylex.props(styles.setupButton)} onPress={save}>
            Save configuration
          </Button>
        </div>
      </section>
    </div>
  )
}

function getEditableControlTarget(
  control: EditableControl,
  customization: ControllerCustomization,
) {
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
  fieldGroup: {
    display: "grid",
    gap: "6px",
    color: "#cbd5e1",
    fontSize: "0.84rem",
    fontWeight: 800,
  },
  textInput: {
    width: "100%",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: "12px",
    backgroundColor: "#050814",
    color: "#f8fafc",
    padding: "10px 11px",
    outline: "none",
  },
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
    borderRadius: "24px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "#111827",
    boxShadow: "0 30px 80px rgba(0, 0, 0, 0.5)",
    padding: "18px",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    marginBottom: "16px",
  },
  modalTitle: {
    margin: 0,
    fontSize: "1.25rem",
  },
  iconButton: {
    width: "36px",
    height: "36px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: "12px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#f8fafc",
    cursor: "pointer",
    fontSize: "1.3rem",
    lineHeight: 1,
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
    display: "grid",
    gap: "6px",
    borderRadius: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(14, 165, 233, 0.28)",
    backgroundColor: "rgba(14, 165, 233, 0.08)",
    color: "#bae6fd",
    padding: "12px",
    fontSize: "0.86rem",
    lineHeight: 1.45,
  },
  sectionDescription: {
    margin: 0,
    color: "#94a3b8",
    fontSize: "0.9rem",
    lineHeight: 1.5,
  },
  setupButton: {
    borderWidth: 0,
    borderRadius: "14px",
    backgroundColor: "#8b5cf6",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 800,
    padding: "12px 14px",
  },
  setupButtonSecondary: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(167, 139, 250, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
})
