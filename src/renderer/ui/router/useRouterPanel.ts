import { useCallback, useEffect, useRef, useState } from "react"
import type {
  RouterConfig,
  RouterMonitorEvent,
  RouterState,
} from "../../../shared/router-types"

type RouterPayload = RouterState & { monitor: RouterMonitorEvent[] }

const MONITOR_LIMIT = 200

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? (payload.message ?? `Request failed: ${response.status}`)
        : `Request failed: ${response.status}`,
    )
  }
  return payload as T
}

/**
 * Router state plus the live monitor.
 *
 * The panel opens its own WebSocket rather than threading router events through the
 * controller socket: the two share nothing, and the server broadcasts to every client.
 */
export function useRouterPanel() {
  const [state, setState] = useState<RouterState | null>(null)
  const [monitor, setMonitor] = useState<RouterMonitorEvent[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<"start" | "stop" | "save" | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  const refresh = useCallback(async () => {
    try {
      const payload = await requestJson<RouterPayload>("/api/router/state")
      const { monitor: events, ...rest } = payload
      setState(rest)
      setMonitor(events ?? [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo leer el router.")
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`)
    socketRef.current = socket

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as Record<string, unknown>
        if (payload.event === "router-state") void refresh()
        if (payload.event === "router-overload") setMessage(String(payload.message))
        if (payload.event === "router-monitor") {
          const events = payload.events as RouterMonitorEvent[]
          setMonitor((current) => [...current, ...events].slice(-MONITOR_LIMIT))
        }
      } catch {
        // Not our message.
      }
    }

    return () => socket.close()
  }, [refresh])

  const saveConfig = useCallback(async (config: RouterConfig) => {
    setBusy("save")
    try {
      const payload = await requestJson<RouterPayload>("/api/router/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const { monitor: events, ...rest } = payload
      setState(rest)
      setMonitor(events ?? [])
      setMessage("Configuración guardada.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.")
    } finally {
      setBusy(null)
    }
  }, [])

  const run = useCallback(async (action: "start" | "stop") => {
    setBusy(action)
    try {
      const payload = await requestJson<RouterPayload>(`/api/router/${action}`, {
        method: "POST",
      })
      const { monitor: events, ...rest } = payload
      setState(rest)
      setMonitor(events ?? [])
      setMessage(
        action === "start"
          ? (rest.provisioning?.message ?? "Router iniciado.")
          : "Router detenido.",
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado.")
    } finally {
      setBusy(null)
    }
  }, [])

  return {
    state,
    monitor,
    message,
    busy,
    refresh,
    saveConfig,
    start: () => run("start"),
    stop: () => run("stop"),
    clearMessage: () => setMessage(null),
    clearMonitor: () => setMonitor([]),
  }
}
