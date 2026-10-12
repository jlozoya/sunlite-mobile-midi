import { useCallback, useEffect, useRef, useState } from "react"
import { websocketUrlForPage } from "../../../shared/websocket-url"
import { createReconnectingSocket } from "../socket-connection"
import type {
  RouterConfig,
  RouterMonitorEvent,
  RouterState,
} from "../../../shared/router-types"

type RouterPayload = RouterState & { monitor: RouterMonitorEvent[] }
export type RouterSaveResult = { state: RouterState; started: boolean }
const MONITOR_LIMIT = 200

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null
  if (!response.ok)
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? (payload.message ?? `Error HTTP ${response.status}`)
        : `Error HTTP ${response.status}`,
    )
  return payload as T
}

export function useRouterPanel() {
  const [state, setState] = useState<RouterState | null>(null)
  const [monitor, setMonitor] = useState<RouterMonitorEvent[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<"start" | "stop" | "save" | null>(null)
  const operationRef = useRef(false)
  const requestRef = useRef<AbortController | null>(null)

  const accept = useCallback((payload: RouterPayload) => {
    requestRef.current?.abort()
    requestRef.current = null
    setRefreshing(false)
    const { monitor: events, ...next } = payload
    setState(next)
    setMonitor(events ?? [])
    setError(null)
    return next
  }, [])

  const refresh = useCallback(async () => {
    if (operationRef.current) return
    requestRef.current?.abort()
    const request = new AbortController()
    requestRef.current = request
    setRefreshing(true)
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      request.abort()
    }, 8000)
    try {
      const payload = await requestJson<RouterPayload>("/api/router/state", {
        signal: request.signal,
      })
      if (requestRef.current !== request || request.signal.aborted) return
      accept(payload)
    } catch (cause) {
      if (requestRef.current !== request) return
      setError(
        timedOut
          ? "El router tarda demasiado en responder. Vuelve a actualizar los dispositivos."
          : request.signal.aborted
            ? "Se perdió la conexión con el router. Vuelve a actualizar los dispositivos."
            : cause instanceof Error
              ? cause.message
              : "No se pudo leer el router.",
      )
    } finally {
      window.clearTimeout(timeout)
      if (requestRef.current === request) {
        requestRef.current = null
        setRefreshing(false)
      }
    }
  }, [accept])

  useEffect(() => {
    void refresh()
    const disconnect = createReconnectingSocket(
      websocketUrlForPage(window.location.href),
      {
        onOpen: () => void refresh(),
        onClose: () => requestRef.current?.abort(),
        onMessage(event) {
          try {
            const payload = JSON.parse(String(event.data)) as Record<string, unknown>
            if (payload.event === "router-state") void refresh()
            if (payload.event === "router-overload") setError(String(payload.message))
            if (payload.event === "router-monitor")
              setMonitor((current) =>
                [...current, ...(payload.events as RouterMonitorEvent[])].slice(
                  -MONITOR_LIMIT,
                ),
              )
          } catch {
            /* Ignore events belonging to other features. */
          }
        },
      },
    )
    return () => {
      disconnect()
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [refresh])

  const saveConfig = useCallback(
    async (
      config: RouterConfig,
      startAfterSave = false,
    ): Promise<RouterSaveResult | null> => {
      if (operationRef.current) return null
      operationRef.current = true
      requestRef.current?.abort()
      requestRef.current = null
      setRefreshing(false)
      setError(null)
      setMessage(null)
      let saved: RouterState | null = null
      try {
        if (startAfterSave && state?.running) {
          setBusy("stop")
          accept(await requestJson<RouterPayload>("/api/router/stop", { method: "POST" }))
        }
        setBusy("save")
        saved = accept(
          await requestJson<RouterPayload>("/api/router/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
          }),
        )
        if (startAfterSave) {
          setBusy("start")
          const next = accept(
            await requestJson<RouterPayload>("/api/router/start", { method: "POST" }),
          )
          const started = next.running && next.provisioning?.ok !== false
          if (started) setMessage("Configuración guardada. Router iniciado.")
          else
            setError(
              next.provisioning?.message ??
                "La configuración se guardó, pero el router no pudo arrancar. Revisa las conexiones y vuelve a intentarlo.",
            )
          return { state: next, started }
        }
        setMessage(
          saved.errors.length
            ? "Borrador guardado. Corrige los pendientes antes de arrancar."
            : saved.running
              ? "Cambios aplicados al router."
              : "Configuración guardada.",
        )
        return { state: saved, started: false }
      } catch (cause) {
        const reason =
          cause instanceof Error ? cause.message : "No se pudo preparar la configuración."
        setError(
          saved ? `La configuración se guardó, pero no pudo arrancar: ${reason}` : reason,
        )
        return saved ? { state: saved, started: false } : null
      } finally {
        operationRef.current = false
        setBusy(null)
      }
    },
    [accept, state?.running],
  )

  const run = useCallback(
    async (action: "start" | "stop") => {
      if (operationRef.current) return
      operationRef.current = true
      requestRef.current?.abort()
      requestRef.current = null
      setRefreshing(false)
      setBusy(action)
      setError(null)
      setMessage(null)
      try {
        const next = accept(
          await requestJson<RouterPayload>(`/api/router/${action}`, { method: "POST" }),
        )
        if (action === "start" && (!next.running || next.provisioning?.ok === false))
          setError(next.provisioning?.message ?? "No se pudo arrancar el router.")
        else setMessage(action === "start" ? "Router iniciado." : "Router detenido.")
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado.")
      } finally {
        operationRef.current = false
        setBusy(null)
      }
    },
    [accept],
  )

  return {
    state,
    monitor,
    message,
    error,
    refreshing,
    busy,
    refresh,
    saveConfig,
    start: () => run("start"),
    stop: () => run("stop"),
    clearError: () => setError(null),
    clearMessage: () => setMessage(null),
    clearMonitor: () => setMonitor([]),
  }
}
