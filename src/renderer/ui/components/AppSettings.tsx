import * as stylex from "@stylexjs/stylex"
import { useRef, useState } from "react"
import type { ServerStatus } from "../types"
import { ActionButton, SectionHeader, Surface } from "../ui-kit"
import { styles } from "./AppSettings.styles"
import { AppUpdates } from "./AppUpdates"
import { ConnectionPanel } from "./ConnectionPanel"
import type { useConnectionSetup } from "../hooks/useConnectionSetup"

export function AppSettings({
  status,
  statusError,
  setup,
}: {
  status: ServerStatus | null
  statusError: string | null
  setup: ReturnType<typeof useConnectionSetup>
}) {
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
    <section
      aria-label="Configuración de la aplicación"
      {...stylex.props(styles.settings)}
    >
      <ConnectionPanel status={status} setup={setup} />
      <div {...stylex.props(styles.grid)}>
        <Surface as="article">
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
            <label htmlFor="settings-controller-url" {...stylex.props(styles.label)}>
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
          {status?.networkUrlCandidates && status.networkUrlCandidates.length > 1 ? (
            <div {...stylex.props(styles.networkList)}>
              <strong>Otras direcciones de red</strong>
              {status.networkUrlCandidates.slice(1).map((candidate) => (
                <span key={`${candidate.interfaceName}-${candidate.address}`}>
                  {candidate.url} · {candidate.interfaceName} · {candidate.note}
                </span>
              ))}
            </div>
          ) : null}
        </Surface>
        {window.desktopUpdates ? (
          <AppUpdates />
        ) : (
          <Surface as="article">
            <SectionHeader
              title="Actualizaciones"
              description="Mantén la aplicación al día."
            />
            <p {...stylex.props(styles.detail)}>
              Las actualizaciones están disponibles desde la aplicación de escritorio.
            </p>
          </Surface>
        )}
      </div>
    </section>
  )
}
