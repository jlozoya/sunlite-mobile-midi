import { useEffect, useState } from "react"
import type { AutomationStatus } from "../../../shared/automation-types"
import { Notice } from "../ui-kit"
import { DeckWaveforms } from "./DeckWaveforms"
import { RekordboxWaveforms } from "./RekordboxWaveforms"

export function MobileWaveforms() {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [rekordboxAvailable, setRekordboxAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let request: AbortController | null = null
    const refresh = async () => {
      if (request) return
      const controller = new AbortController()
      request = controller
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      try {
        const response = await fetch("/api/automation/status", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Automation status unavailable")
        const next = (await response.json()) as AutomationStatus
        if (!active) return
        setStatus(next)
        setError(false)
        const hasCdjs = next.devices.some(
          (device) => device.deviceNumber >= 1 && device.deviceNumber <= 6,
        )
        if (hasCdjs) {
          setRekordboxAvailable(false)
        } else {
          const capture = await fetch("/api/automation/rekordbox/status", {
            cache: "no-store",
            signal: controller.signal,
          })
          const available = capture.ok && Boolean((await capture.json()).available)
          if (active) setRekordboxAvailable(available)
        }
      } catch {
        if (active) {
          setError(true)
          setRekordboxAvailable(false)
        }
      } finally {
        window.clearTimeout(timeout)
        request = null
        if (active) setLoading(false)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1000)
    return () => {
      active = false
      window.clearInterval(timer)
      request?.abort()
    }
  }, [])

  if (loading)
    return (
      <Notice tone="info" role="status">
        Buscando CDJs y waveforms…
      </Notice>
    )
  if (error)
    return (
      <Notice tone="info" role="status">
        No se pudieron actualizar los waveforms. Reintentando la conexión con la
        computadora…
      </Notice>
    )
  const connectedDecks = new Set(
    status?.devices
      .filter((device) => device.deviceNumber >= 1 && device.deviceNumber <= 6)
      .map((device) => device.deviceNumber),
  )
  if (connectedDecks.size)
    return (
      <DeckWaveforms
        connectedDecks={[...connectedDecks]}
        waveforms={Object.values(status?.waveforms ?? {}).filter((waveform) =>
          connectedDecks.has(waveform.deviceNumber),
        )}
      />
    )
  if (rekordboxAvailable) return <RekordboxWaveforms />
  return (
    <Notice tone="info" role="status">
      No hay CDJs conectados ni una captura de Rekordbox disponible. Conecta los CDJs a la
      red de la computadora y carga una pista para ver sus waveforms.
    </Notice>
  )
}
