import { useEffect, useState, type ReactNode } from "react"
import type { UpdateStatus } from "../../../shared/update-types"
import { ActionButton, Notice, SectionHeader, Surface, tokens } from "../ui-kit"

const DISABLED_HINT_ID = "updates-disabled-reason"

/**
 * A tooltip of our own instead of the platform `title`, which draws a light box with a
 * long delay in the middle of a dark interface.
 *
 * It hangs off the wrapper rather than the control because a disabled button fires no
 * mouse events, and it stays in the DOM so `aria-describedby` can reach it: the reason
 * a button cannot be pressed should not be hover-only.
 */
function Hint({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      <span
        id={DISABLED_HINT_ID}
        role="tooltip"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: 0,
          zIndex: 20,
          width: "max-content",
          maxWidth: 260,
          padding: "8px 10px",
          borderRadius: tokens.radiusSm,
          border: `1px solid ${tokens.borderStrong}`,
          backgroundColor: tokens.colorSurfaceSolid,
          boxShadow: tokens.shadowPanel,
          color: tokens.colorTextSubtle,
          fontSize: "0.78rem",
          lineHeight: 1.4,
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
          transition: "opacity 120ms ease",
          pointerEvents: "none",
        }}
      >
        {text}
      </span>
    </span>
  )
}

export function AppUpdates() {
  const api = window.desktopUpdates
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

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

  useEffect(() => {
    if (!confirming) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(false)
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [confirming])

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
  const isDisabled = status?.phase === "disabled"
  const check = (
    <ActionButton
      variant="secondary"
      isDisabled={busy || status?.phase === "downloaded"}
      aria-describedby={isDisabled ? DISABLED_HINT_ID : undefined}
      onPress={() => void act("check")}
    >
      {status?.phase === "checking" ? "Buscando…" : "Buscar actualizaciones"}
    </ActionButton>
  )

  return (
    <Surface aria-label="Actualizaciones de la aplicación">
      <SectionHeader
        title="Actualizaciones"
        description={
          status ? `Versión instalada: ${status.currentVersion}` : "Consultando versión…"
        }
      />
      {/* The reason lives on the button that cannot be pressed; repeating it here said
          the same sentence twice. An error still has to be shown either way. */}
      {(!isDisabled || error) && (
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
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        {isDisabled && status ? <Hint text={status.message}>{check}</Hint> : check}
        {status?.availableVersion && ["available", "error"].includes(status.phase) && (
          <ActionButton isDisabled={busy} onPress={() => void act("download")}>
            Descargar {status.availableVersion}
          </ActionButton>
        )}
        {status?.phase === "downloaded" && (
          <ActionButton isDisabled={busy} onPress={() => setConfirming(true)}>
            Instalar y reiniciar
          </ActionButton>
        )}
      </div>

      {confirming && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            backgroundColor: "rgba(2, 6, 23, 0.74)",
            padding: 20,
          }}
          onMouseDown={() => setConfirming(false)}
        >
          <Surface
            variant="solid"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar la instalación"
            style={{ width: "min(100%, 460px)" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <SectionHeader
              title="Instalar y reiniciar"
              description={
                status?.availableVersion
                  ? `Versión ${status.availableVersion}`
                  : "La aplicación se cerrará para actualizarse."
              }
            />
            <Notice tone="warning" layout="stack">
              Las actualizaciones se instalan cuando eliges reiniciar. Termina la
              grabación y cambia a modo Manual antes de instalar.
            </Notice>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 16,
              }}
            >
              <ActionButton variant="secondary" onPress={() => setConfirming(false)}>
                Cancelar
              </ActionButton>
              <ActionButton
                isDisabled={busy}
                onPress={() => {
                  setConfirming(false)
                  void act("install")
                }}
              >
                Instalar y reiniciar
              </ActionButton>
            </div>
          </Surface>
        </div>
      )}
    </Surface>
  )
}
