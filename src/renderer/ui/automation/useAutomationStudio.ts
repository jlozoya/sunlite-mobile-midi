import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AutomationMode,
  AutomationSettings,
  AutomationSocketCommand,
  AutomationStatus,
  AutomationTimelineEvent,
} from "../../../shared/automation-types"
import { useAutomationAudio } from "./useAutomationAudio"

type SendAutomationCommand = (command: AutomationSocketCommand) => boolean

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
  if (payload === null)
    throw new Error("El servidor no devolvió el estado de automatización.")
  return payload as T
}

export function useAutomationStudio(
  sendAutomationCommand: SendAutomationCommand,
  showLiveFrames: boolean,
) {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [timeline, setTimeline] = useState<AutomationTimelineEvent[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audio = useAutomationAudio(sendAutomationCommand, showLiveFrames, setError)
  const clearMessage = useCallback(() => setMessage(null), [])
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const statusRequestRef = useRef<AbortController | null>(null)
  const sessionRequestRef = useRef(0)
  const operationRef = useRef(false)

  const beginOperation = useCallback((operation: string) => {
    if (operationRef.current) return false
    operationRef.current = true
    statusRequestRef.current?.abort()
    statusRequestRef.current = null
    setBusy(operation)
    setMessage(null)
    setError(null)
    return true
  }, [])

  const endOperation = useCallback(() => {
    operationRef.current = false
    setBusy(null)
  }, [])

  const refreshStatus = useCallback(async () => {
    if (statusRequestRef.current || operationRef.current) return
    const request = new AbortController()
    statusRequestRef.current = request
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      request.abort()
    }, 8000)
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/status", {
        signal: request.signal,
      })
      if (statusRequestRef.current !== request || request.signal.aborted) return
      setStatus(next)
      setStatusError(null)
    } catch (error) {
      if (statusRequestRef.current !== request || (request.signal.aborted && !timedOut))
        return
      setStatusError(
        timedOut
          ? "El servidor tarda demasiado en responder. Comprueba la conexión y vuelve a intentarlo."
          : error instanceof Error
            ? error.message
            : "No se pudo leer Automation Studio",
      )
    } finally {
      window.clearTimeout(timeout)
      if (statusRequestRef.current === request) {
        statusRequestRef.current = null
        setStatusLoading(false)
      }
    }
  }, [])

  const applyMutationStatus = useCallback((next: AutomationStatus) => {
    // A poll started before the mutation may still contain the previous settings or mode.
    statusRequestRef.current?.abort()
    statusRequestRef.current = null
    setStatus(next)
    setStatusError(null)
    setStatusLoading(false)
  }, [])

  useEffect(() => {
    void refreshStatus()
    const timer = window.setInterval(() => void refreshStatus(), 1000)
    return () => {
      window.clearInterval(timer)
      statusRequestRef.current?.abort()
      statusRequestRef.current = null
    }
  }, [refreshStatus])

  const updateMode = useCallback(
    async (mode: AutomationMode) => {
      if (!beginOperation("mode")) return false
      try {
        applyMutationStatus(
          await requestJson<AutomationStatus>("/api/automation/mode", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode }),
          }),
        )
        return true
      } catch (error) {
        setError(error instanceof Error ? error.message : "No se pudo cambiar el modo")
        return false
      } finally {
        endOperation()
      }
    },
    [applyMutationStatus, beginOperation, endOperation],
  )

  const updateSettings = useCallback(
    async (settings: AutomationSettings) => {
      if (!beginOperation("settings")) return false
      try {
        applyMutationStatus(
          await requestJson<AutomationStatus>("/api/automation/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
          }),
        )
        setMessage("Reglas guardadas")
        return true
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "No se pudieron guardar las reglas",
        )
        return false
      } finally {
        endOperation()
      }
    },
    [applyMutationStatus, beginOperation, endOperation],
  )

  const startSession = useCallback(
    async (name: string) => {
      if (!beginOperation("session")) return false
      try {
        applyMutationStatus(
          await requestJson<AutomationStatus>("/api/automation/session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          }),
        )
        sessionRequestRef.current += 1
        setSelectedSessionId(null)
        setTimeline([])
        setMessage("Grabación de entrenamiento iniciada")
        return true
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "No se pudo iniciar la grabación",
        )
        return false
      } finally {
        endOperation()
      }
    },
    [applyMutationStatus, beginOperation, endOperation],
  )

  const stopSession = useCallback(async () => {
    if (!beginOperation("session")) return false
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/session/stop", {
        method: "POST",
      })
      applyMutationStatus(next)
      setMessage(`Sesión guardada · ${next.modelExampleCount} ejemplos entrenados`)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo finalizar la grabación",
      )
      return false
    } finally {
      endOperation()
    }
  }, [applyMutationStatus, beginOperation, endOperation])

  const train = useCallback(async () => {
    if (!beginOperation("train")) return false
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/train", {
        method: "POST",
      })
      applyMutationStatus(next)
      setMessage(`Modelo actualizado con ${next.modelExampleCount} ejemplos`)
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo reentrenar el modelo")
      return false
    } finally {
      endOperation()
    }
  }, [applyMutationStatus, beginOperation, endOperation])

  const loadSession = useCallback(
    async (id: string) => {
      if (!beginOperation("timeline")) return false
      const request = ++sessionRequestRef.current
      try {
        const payload = await requestJson<{ events: AutomationTimelineEvent[] }>(
          `/api/automation/sessions/${encodeURIComponent(id)}`,
        )
        if (request !== sessionRequestRef.current) return
        setSelectedSessionId(id)
        setTimeline(payload.events)
      } catch (error) {
        setError(error instanceof Error ? error.message : "No se pudo cargar la sesión")
        return false
      } finally {
        endOperation()
      }
    },
    [beginOperation, endOperation],
  )

  const showLiveTimeline = useCallback(() => {
    sessionRequestRef.current += 1
    setSelectedSessionId(null)
    setTimeline([])
  }, [])

  const renameSession = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      if (!beginOperation(`rename-${id}`)) return false
      try {
        applyMutationStatus(
          await requestJson<AutomationStatus>(
            `/api/automation/sessions/${encodeURIComponent(id)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            },
          ),
        )
        setMessage("Sesión renombrada")
        return true
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "No se pudo renombrar la sesión",
        )
        return false
      } finally {
        endOperation()
      }
    },
    [applyMutationStatus, beginOperation, endOperation],
  )

  const deleteSession = useCallback(
    async (id: string): Promise<boolean> => {
      if (!beginOperation(`delete-${id}`)) return false
      try {
        const next = await requestJson<AutomationStatus>(
          `/api/automation/sessions/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        )
        applyMutationStatus(next)
        if (selectedSessionId === id) {
          setSelectedSessionId(null)
          setTimeline([])
        }
        setMessage(
          `Sesión eliminada · el modelo conserva ${next.modelExampleCount} ejemplos`,
        )
        return true
      } catch (error) {
        setError(error instanceof Error ? error.message : "No se pudo eliminar la sesión")
        return false
      } finally {
        endOperation()
      }
    },
    [applyMutationStatus, selectedSessionId, beginOperation, endOperation],
  )

  const updateTrainingExamples = useCallback(
    async (
      edits: Array<{
        id: string
        t?: number
        value?: number
        delete?: boolean
        create?: boolean
        controller?: number
      }>,
      successMessage: string,
    ): Promise<boolean> => {
      if (!selectedSessionId || !edits.length) return false
      if (!beginOperation("edit-examples")) return false
      try {
        const payload = await requestJson<{
          status: AutomationStatus
          events: AutomationTimelineEvent[]
        }>(`/api/automation/sessions/${encodeURIComponent(selectedSessionId)}/examples`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edits }),
        })
        applyMutationStatus(payload.status)
        setTimeline(payload.events)
        setMessage(successMessage)
        return true
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "No se pudieron guardar los cambios",
        )
        return false
      } finally {
        endOperation()
      }
    },
    [applyMutationStatus, selectedSessionId, beginOperation, endOperation],
  )

  const excludeExample = useCallback(
    async (id: string) => {
      if (!beginOperation(`exclude-${id}`)) return false
      try {
        const next = await requestJson<AutomationStatus>(
          `/api/automation/examples/${encodeURIComponent(id)}/exclude`,
          { method: "POST" },
        )
        applyMutationStatus(next)
        setTimeline((current) =>
          current.filter((event) => event.kind !== "example" || event.example?.id !== id),
        )
        setMessage(
          `Ejemplo excluido · el modelo conserva ${next.modelExampleCount} ejemplos`,
        )
      } catch (error) {
        setError(error instanceof Error ? error.message : "No se pudo excluir el ejemplo")
        return false
      } finally {
        endOperation()
      }
    },
    [applyMutationStatus, beginOperation, endOperation],
  )

  const restartBridge = useCallback(async () => {
    if (!beginOperation("bridge")) return false
    try {
      applyMutationStatus(
        await requestJson<AutomationStatus>("/api/automation/prodj-link/restart", {
          method: "POST",
        }),
      )
      setMessage("Reiniciando listener PRO DJ LINK")
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo reiniciar PRO DJ LINK",
      )
      return false
    } finally {
      endOperation()
    }
  }, [applyMutationStatus, beginOperation, endOperation])

  return {
    status,
    statusError,
    statusLoading,
    refreshStatus,
    showLiveTimeline,
    ...audio,
    timeline,
    selectedSessionId,
    busy,
    message,
    error,
    clearMessage,
    updateMode,
    updateSettings,
    startSession,
    stopSession,
    train,
    loadSession,
    renameSession,
    deleteSession,
    updateTrainingExamples,
    excludeExample,
    restartBridge,
  }
}
export { SYSTEM_AUDIO_DEVICE_ID } from "./useAutomationAudio"
