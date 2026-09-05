import { useEffect, useState } from "react"
import type { UpdateStatus } from "../../../shared/update-types"
import { ActionButton, Notice, SectionHeader, Surface } from "../ui-kit"

export function AppUpdates() {
  const api = window.desktopUpdates
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!api) return
    let active = true
    const refresh = () =>
      api
        .status()
        .then((next) => {
          if (active) setStatus(next)
        })
        .catch(() => {
          if (active) setError("No se pudo consultar el actualizador.")
        })
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [api])

  if (!api) return null

  async function act(action: "check" | "download" | "install") {
    if (!api) return
    setPending(true)
    setError(null)
    try {
      setStatus(await api[action]())
    } catch {
      setError("No se pudo completar la operación. Inténtalo otra vez.")
    } finally {
      setPending(false)
    }
  }

  const busy =
    pending ||
    !status ||
    ["checking", "downloading", "installing", "disabled"].includes(status.phase)
  return (
    <Surface aria-label="Actualizaciones de la aplicación">
      <SectionHeader
        title="Actualizaciones"
        description={
          status ? `Versión instalada: ${status.currentVersion}` : "Consultando versión…"
        }
      />
      <Notice
        layout="stack"
        tone={error || status?.phase === "error" ? "warning" : "info"}
      >
        <span role="status">{error ?? status?.message ?? "Cargando…"}</span>
        {status?.phase === "downloading" && (
          <>
            <progress
              aria-label="Descarga de actualización"
              value={status.percent ?? 0}
              max={100}
            />
            <span>{Math.round(status.percent ?? 0)} %</span>
          </>
        )}
        {status?.checkedAt && (
          <small>
            Última comprobación: {new Date(status.checkedAt).toLocaleString()}
          </small>
        )}
      </Notice>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <ActionButton
          variant="secondary"
          isDisabled={busy || status?.phase === "downloaded"}
          onPress={() => void act("check")}
        >
          {status?.phase === "checking" ? "Buscando…" : "Buscar actualizaciones"}
        </ActionButton>
        {status?.availableVersion && ["available", "error"].includes(status.phase) && (
          <ActionButton isDisabled={busy} onPress={() => void act("download")}>
            Descargar {status.availableVersion}
          </ActionButton>
        )}
        {status?.phase === "downloaded" && (
          <ActionButton isDisabled={busy} onPress={() => void act("install")}>
            Instalar y reiniciar
          </ActionButton>
        )}
      </div>
      <p>
        Las actualizaciones se instalan cuando eliges reiniciar. Termina la grabación y
        cambia a modo Manual antes de instalar.
      </p>
    </Surface>
  )
}
