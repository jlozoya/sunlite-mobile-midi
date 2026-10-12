import * as stylex from "@stylexjs/stylex"
import { useId, useRef, useState, type ReactNode } from "react"
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components"
import { ActionButton, Notice } from "./components"
import { styles } from "./ConfirmationDialog.styles"

export function ConfirmationDialog({
  title,
  children,
  confirmLabel = "Eliminar",
  pendingLabel = "Eliminando…",
  isConfirmDisabled = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  confirmLabel?: string
  pendingLabel?: string
  isConfirmDisabled?: boolean
  error?: string | null
  onConfirm: () => Promise<boolean>
  onClose: () => void
}) {
  const descriptionId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null)
  const inProgress = useRef(false)

  async function confirm() {
    if (inProgress.current || isConfirmDisabled) return
    inProgress.current = true
    setBusy(true)
    setFailed(false)
    setUnexpectedError(null)
    try {
      if (await onConfirm()) onClose()
      else setFailed(true)
    } catch (cause) {
      setUnexpectedError(
        cause instanceof Error ? cause.message : "No se pudo completar la acción.",
      )
      setFailed(true)
    } finally {
      inProgress.current = false
      setBusy(false)
    }
  }

  return (
    <ModalOverlay
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(open) => {
        if (!open && !inProgress.current) onClose()
      }}
      {...stylex.props(styles.overlay)}
    >
      <Modal {...stylex.props(styles.modal)}>
        <Dialog
          role="alertdialog"
          aria-describedby={descriptionId}
          {...stylex.props(styles.dialog)}
        >
          <div aria-busy={busy} {...stylex.props(styles.content)}>
            <Heading slot="title" {...stylex.props(styles.title)}>
              {title}
            </Heading>
            <div id={descriptionId} {...stylex.props(styles.description)}>
              {children}
            </div>
            {failed ? (
              <Notice tone="danger" role="alert">
                {unexpectedError ??
                  error ??
                  "No se pudo completar la acción. Vuelve a intentarlo."}
              </Notice>
            ) : null}
            <div {...stylex.props(styles.actions)}>
              <ActionButton
                variant="secondary"
                autoFocus
                isDisabled={busy}
                onPress={onClose}
              >
                Cancelar
              </ActionButton>
              <ActionButton
                variant="danger"
                isDisabled={busy || isConfirmDisabled}
                onPress={() => void confirm()}
              >
                {busy ? pendingLabel : confirmLabel}
              </ActionButton>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
