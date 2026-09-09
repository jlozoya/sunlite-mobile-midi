import { useCallback, useEffect, useRef, useState } from "react"
import { websocketUrlForPage } from "../../../shared/websocket-url"
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
  const operationRef = useRef(false)
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
    const socket = new WebSocket(websocketUrlForPage(window.location.href))
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

  const saveConfig = useCallback(
    async (config: RouterConfig, startAfterSave = false) => {
      if (operationRef.current) return false
      operationRef.current = true
      setBusy("save")
      const accept = (payload: RouterPayload) => {
        const { monitor: events, ...rest } = payload
        setState(rest)
        setMonitor(events ?? [])
        return rest
      }
      try {
        // Re-provision when rebuilding a running setup, including newly added programs.
        if (startAfterSave && state?.running) {
          accept(await requestJson<RouterPayload>("/api/router/stop", { method: "POST" }))
        }
        accept(
          await requestJson<RouterPayload>("/api/router/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
          }),
        )
        if (startAfterSave) {
          const next = accept(
            await requestJson<RouterPayload>("/api/router/start", { method: "POST" }),
          )
          setMessage(
            next.provisioning?.ok === false
              ? next.provisioning.message
              : "Configuración guardada. Router iniciado.",
          )
        } else {
          setMessage("Configuración guardada.")
        }
        return true
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo preparar la configuración.",
        )
        return false
      } finally {
        operationRef.current = false
        setBusy(null)
      }
    },
    [state?.running],
  )

  const run = useCallback(async (action: "start" | "stop") => {
    if (operationRef.current) return
    operationRef.current = true
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
      operationRef.current = false
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
