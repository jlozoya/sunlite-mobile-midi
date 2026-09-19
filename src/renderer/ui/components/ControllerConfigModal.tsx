import * as stylex from "@stylexjs/stylex"
import { useMemo, useRef, useState, type FormEvent } from "react"
import { Dialog, Modal, ModalOverlay } from "react-aria-components"
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
  onSave: (customization: ControllerCustomization) => void | Promise<void>
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
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveInProgress = useRef(false)

  async function save() {
    if (saveInProgress.current) return

    let nextCustomization: ControllerCustomization

    if (control.kind === "pad" && buttonDraft) {
      const current = customization.pads[String(control.note)] ?? buttonDraft
      nextCustomization = {
        ...customization,
        pads: {
          ...customization.pads,
          [String(control.note)]: normalizeStandardButtonCustomization(
            current,
            buttonDraft.label,
            control.note,
          ),
        },
      }
    } else if (control.kind === "scene" && buttonDraft) {
      const current = customization.sceneButtons[String(control.note)] ?? buttonDraft
      nextCustomization = {
        ...customization,
        sceneButtons: {
          ...customization.sceneButtons,
          [String(control.note)]: normalizeStandardButtonCustomization(
            current,
            buttonDraft.label,
            control.note,
          ),
        },
      }
    } else if (control.kind === "fader" && faderDraft) {
      const current = customization.faders[String(control.controller)] ?? faderDraft
      nextCustomization = {
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
      }
    } else {
      return
    }

    saveInProgress.current = true
    setIsSaving(true)
    setSaveError(null)

    try {
      await onSave(nextCustomization)
      onClose()
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "Comprueba la conexión e inténtalo de nuevo.",
      )
    } finally {
      saveInProgress.current = false
      setIsSaving(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save()
  }

  return (
    <ModalOverlay
      isOpen
      isDismissable={!isSaving}
      isKeyboardDismissDisabled={isSaving}
      onOpenChange={(isOpen) => {
        if (!isOpen && !saveInProgress.current) onClose()
      }}
      {...stylex.props(styles.modalBackdrop)}
    >
      <Modal {...stylex.props(styles.modalPanel)}>
        <Dialog
          aria-label="Configuración del control MIDI"
          {...stylex.props(styles.dialog)}
        >
          <Surface variant="solid">
            <form onSubmit={handleSubmit} aria-busy={isSaving}>
              <div {...stylex.props(styles.modalHeader)}>
                <SectionHeader
                  title="Configuración del control MIDI"
                  description={`${model.name} · Canal MIDI ${midiChannel} · ${
                    control.kind === "fader"
                      ? `CC ${control.controller}`
                      : `Nota ${control.note}`
                  }`}
                />
                <ActionButton
                  variant="ghost"
                  size="small"
                  aria-label="Cerrar configuración"
                  isDisabled={isSaving}
                  onPress={onClose}
                >
                  ×
                </ActionButton>
              </div>

              {target.kind === "button" && buttonDraft ? (
                <div {...stylex.props(styles.modalGrid)}>
                  <TextInputField
                    label="Texto del botón"
                    value={buttonDraft.label}
                    onChange={(label) => setButtonDraft({ ...buttonDraft, label })}
                    isReadOnly={isSaving}
                    inputProps={{ autoFocus: true }}
                  />

                  <Notice tone="info" layout="stack" {...stylex.props(styles.helpBox)}>
                    <strong>Asignación estándar de {model.name}</strong>
                    <span>
                      Este botón conserva su nota MIDI. Su color y estado encendido o
                      apagado dependen de la respuesta MIDI de tu software de iluminación.
                      Configura Sunlite o FreeStyler para enviar esa respuesta a{" "}
                      <strong>Sunlite Mobile Out</strong>.
                    </span>
                  </Notice>
                </div>
              ) : null}

              {target.kind === "fader" && faderDraft ? (
                <div {...stylex.props(styles.modalGrid)}>
                  <TextInputField
                    label="Texto del fader"
                    value={faderDraft.label}
                    onChange={(label) => setFaderDraft({ ...faderDraft, label })}
                    isReadOnly={isSaving}
                    inputProps={{ autoFocus: true }}
                  />
                  <Notice tone="info" layout="stack" {...stylex.props(styles.helpBox)}>
                    <strong>Asignación estándar de {model.name}</strong>
                    <span>
                      Este fader conserva su número CC. Aquí puedes cambiar el texto que
                      aparece en la consola.
                    </span>
                  </Notice>
                </div>
              ) : null}

              {saveError ? (
                <Notice
                  tone="danger"
                  layout="stack"
                  role="alert"
                  {...stylex.props(styles.saveError)}
                >
                  <strong>No se pudo guardar la configuración.</strong>
                  <span>{saveError}</span>
                  <span>
                    Tus cambios siguen en el formulario para volver a intentarlo.
                  </span>
                </Notice>
              ) : null}

              <div {...stylex.props(styles.modalActions)}>
                <ActionButton variant="secondary" isDisabled={isSaving} onPress={onClose}>
                  Cancelar
                </ActionButton>
                <ActionButton type="submit" isPending={isSaving}>
                  {isSaving ? "Guardando…" : "Guardar configuración"}
                </ActionButton>
              </div>
            </form>
          </Surface>
        </Dialog>
      </Modal>
    </ModalOverlay>
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
        label: scene?.label ?? `Escena ${control.note}`,
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
    boxSizing: "border-box",
    overflowY: "auto",
  },
  modalPanel: {
    width: "min(100%, 560px)",
    maxHeight: "min(92vh, 760px)",
    overflow: "auto",
  },
  dialog: {
    outline: "none",
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
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "12px",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
  },
  saveError: {
    marginTop: "12px",
  },
  helpBox: {
    gridColumn: "1 / -1",
  },
})
