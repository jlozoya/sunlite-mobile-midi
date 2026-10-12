import { useState } from "react"
import { type LightingSoftware } from "../../../shared/lighting-software"

export function useConnectionSetup(refreshStatus: () => Promise<unknown>) {
  const [setupMessage, setSetupMessage] = useState<string | null>(null)

  const [setupBusy, setSetupBusy] = useState<"install" | "refresh" | null>(null)

  const [softwareBusy, setSoftwareBusy] = useState(false)

  async function changeLightingSoftware(next: LightingSoftware) {
    setSoftwareBusy(true)
    try {
      const response = await fetch("/api/lighting-software", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ software: next }),
      })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.message ?? "No se pudo cambiar de software")
      }
      await refreshStatus()
      setSetupMessage(
        "Perfil cargado en modo Manual. Revisa el mapeo antes de activar Auto.",
      )
    } catch (error) {
      setSetupMessage(
        error instanceof Error ? error.message : "Error al cambiar de software",
      )
    } finally {
      setSoftwareBusy(false)
    }
  }

  async function runSetupAction(action: "install" | "refresh") {
    setSetupBusy(action)
    setSetupMessage(null)

    try {
      const endpoint =
        action === "install" ? "/api/loopmidi/install" : "/api/midi/refresh"
      const response = await fetch(endpoint, { method: "POST" })
      const payload = (await response.json()) as {
        ok?: boolean
        message?: string
        code?: number | null
        skipped?: boolean
      }

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message ?? `Setup action failed: ${response.status}`)
      }

      await refreshStatus()

      if (action === "install") {
        setSetupMessage(
          payload.code === 0 || payload.skipped
            ? "El puente MIDI quedó configurado automáticamente."
            : "Windows no pudo terminar la preparación del puente MIDI.",
        )
      } else {
        setSetupMessage("Puertos MIDI actualizados.")
      }
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : "Unknown setup error")
    } finally {
      setSetupBusy(null)
    }
  }
  return {
    setupMessage,
    setSetupMessage,
    setupBusy,
    softwareBusy,
    changeLightingSoftware,
    runSetupAction,
  }
}
