import * as stylex from "@stylexjs/stylex"
import { useRef, useState } from "react"
import {
  Dialog,
  Modal,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "react-aria-components"
import type { ServerStatus } from "../types"
import { ActionButton, SectionHeader } from "../ui-kit"
import { tokens } from "../ui-kit/tokens.stylex"
import { AppUpdates } from "./AppUpdates"

export function AppSettings({
  status,
  statusError,
}: {
  status: ServerStatus | null
  statusError: string | null
}) {
  const [open, setOpen] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  async function copyControllerUrl() {
    if (!status?.preferredLanUrl || copyBusy) return
    setCopyBusy(true)
    setCopyMessage(null)
    try {
      await navigator.clipboard.writeText(status.preferredLanUrl)
      setCopyMessage(
        "Enlace copiado. Ábrelo en un dispositivo conectado a la misma red Wi-Fi.",
      )
    } catch {
      urlRef.current?.focus()
      urlRef.current?.select()
      setCopyMessage(
        "No se pudo copiar automáticamente. El enlace está seleccionado para copiarlo manualmente.",
      )
    } finally {
      setCopyBusy(false)
    }
  }

  return (
    <>
      <ActionButton
        variant="secondary"
        aria-label="Abrir configuración"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPress={() => setOpen(true)}
        {...stylex.props(styles.trigger)}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9.5 3-.6 2.3-1.6.9L5 5.6 2.5 10l1.7 1.7v1.8L2.5 15 5 19.4l2.3-.6 1.6.9.6 2.3h5l.6-2.3 1.6-.9 2.3.6 2.5-4.4-1.7-1.5v-1.8L21.5 10 19 5.6l-2.3.6-1.6-.9L14.5 3Z" />
          <circle cx="12" cy="12.5" r="3.2" />
        </svg>
      </ActionButton>
      <ModalOverlay
        isOpen={open}
        onOpenChange={setOpen}
        isDismissable
        {...stylex.props(styles.overlay)}
      >
        <Modal {...stylex.props(styles.modal)}>
          <Dialog aria-label="Configuración" {...stylex.props(styles.dialog)}>
            <div {...stylex.props(styles.heading)}>
              <h2 {...stylex.props(styles.title)}>Configuración</h2>
              <ActionButton
                variant="ghost"
                size="small"
                aria-label="Cerrar configuración"
                onPress={() => setOpen(false)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </ActionButton>
            </div>
            <Tabs defaultSelectedKey="mobile">
              <TabList
                aria-label="Opciones de configuración"
                {...stylex.props(styles.tabs)}
              >
                <Tab id="mobile" {...stylex.props(styles.tab)}>
                  Conexión móvil
                </Tab>
                <Tab id="updates" {...stylex.props(styles.tab)}>
                  Actualizaciones
                </Tab>
              </TabList>
              <TabPanel id="mobile" {...stylex.props(styles.content)}>
                <SectionHeader
                  title="Conecta tu teléfono"
                  description="Escanea el código QR desde un dispositivo conectado a la misma red Wi-Fi."
                />
                {status?.qrDataUrl ? (
                  <div {...stylex.props(styles.qrWrap)}>
                    <img
                      src={status.qrDataUrl}
                      alt="Código QR para abrir el controlador en tu teléfono"
                      {...stylex.props(styles.qrImage)}
                    />
                  </div>
                ) : (
                  <p role="status" {...stylex.props(styles.detail)}>
                    {statusError ? "Código QR no disponible" : "Preparando código QR…"}
                  </p>
                )}
                <div {...stylex.props(styles.shareLink)}>
                  <label
                    htmlFor="settings-controller-url"
                    {...stylex.props(styles.label)}
                  >
                    Enlace del controlador
                  </label>
                  <input
                    id="settings-controller-url"
                    ref={urlRef}
                    readOnly
                    value={status?.preferredLanUrl ?? ""}
                    placeholder="Detectando dirección de red…"
                    onFocus={(event) => event.currentTarget.select()}
                    {...stylex.props(styles.urlBox)}
                  />
                  <ActionButton
                    variant="secondary"
                    stretch
                    isDisabled={!status?.preferredLanUrl || copyBusy}
                    onPress={() => void copyControllerUrl()}
                  >
                    {copyBusy ? "Copiando…" : "Copiar enlace"}
                  </ActionButton>
                </div>
                {copyMessage ? (
                  <p role="status" {...stylex.props(styles.detail)}>
                    {copyMessage}
                  </p>
                ) : null}
                {status?.networkUrlCandidates &&
                status.networkUrlCandidates.length > 1 ? (
                  <div {...stylex.props(styles.networkList)}>
                    <strong>Otras direcciones de red</strong>
                    {status.networkUrlCandidates.slice(1).map((candidate) => (
                      <span key={`${candidate.interfaceName}-${candidate.address}`}>
                        {candidate.url} · {candidate.interfaceName} · {candidate.note}
                      </span>
                    ))}
                  </div>
                ) : null}
              </TabPanel>
              <TabPanel id="updates" {...stylex.props(styles.content)}>
                {window.desktopUpdates ? (
                  <AppUpdates />
                ) : (
                  <p {...stylex.props(styles.detail)}>
                    Las actualizaciones están disponibles desde la aplicación de
                    escritorio.
                  </p>
                )}
              </TabPanel>
            </Tabs>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  )
}

const styles = stylex.create({
  trigger: { minWidth: "42px", width: "42px", height: "42px", padding: "10px" },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    backgroundColor: tokens.colorOverlay,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    boxSizing: "border-box",
  },
  modal: {
    width: "min(100%, 560px)",
    maxHeight: "calc(100dvh - 32px)",
    overflowY: "auto",
    borderRadius: tokens.radiusPanel,
    backgroundColor: tokens.colorSurfaceSolid,
    border: `1px solid ${tokens.borderDefault}`,
    boxShadow: tokens.shadowDialog,
  },
  dialog: { padding: "20px", outline: "none" },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  },
  title: { margin: 0, color: tokens.colorText, fontSize: "1.15rem" },
  tabs: {
    display: "flex",
    gap: "8px",
    borderBottom: `1px solid ${tokens.borderSubtle}`,
    paddingBottom: "12px",
  },
  tab: {
    flex: 1,
    padding: "10px 8px",
    textAlign: "center",
    borderRadius: tokens.radiusMd,
    color: tokens.colorTextMuted,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.86rem",
    outline: "none",
    backgroundColor: "transparent",
    ":is([data-selected])": {
      color: tokens.colorText,
      backgroundColor: tokens.colorVioletSoft,
    },
    ":is([data-focus-visible])": { outline: `2px solid ${tokens.colorViolet}` },
  },
  content: { paddingTop: "18px", outline: "none" },
  qrWrap: {
    width: "min(100%, 230px)",
    margin: "16px auto",
    padding: "12px",
    boxSizing: "border-box",
    backgroundColor: "#fff",
    borderRadius: "18px",
  },
  qrImage: { display: "block", width: "100%", height: "auto" },
  shareLink: { display: "grid", gap: "10px" },
  label: { fontSize: "0.78rem", fontWeight: 800, color: tokens.colorTextSubtle },
  urlBox: {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${tokens.borderViolet}`,
    borderRadius: tokens.radiusMd,
    backgroundColor: tokens.colorSurfaceInset,
    padding: "12px",
    color: tokens.colorTextSubtle,
    fontFamily: "Consolas, monospace",
    fontSize: "0.86rem",
    textAlign: "center",
    ":focus-visible": { outline: `2px solid ${tokens.colorViolet}` },
  },
  detail: { color: tokens.colorTextMuted, fontSize: "0.86rem", lineHeight: 1.5 },
  networkList: {
    display: "grid",
    gap: "6px",
    marginTop: "12px",
    color: tokens.colorTextMuted,
    fontSize: "0.76rem",
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
})
