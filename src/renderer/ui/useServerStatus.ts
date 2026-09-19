import { useCallback, useEffect, useRef, useState } from "react"
import type { ServerStatus } from "./types"

export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const requestRef = useRef<AbortController | null>(null)

  const loadStatus = useCallback(async () => {
    requestRef.current?.abort()
    const request = new AbortController()
    requestRef.current = request
    setIsLoading(true)
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      request.abort()
    }, 8000)

    try {
      const response = await fetch("/api/status", { signal: request.signal })
      if (!response.ok) {
        throw new Error(`No se pudo consultar el servidor (HTTP ${response.status}).`)
      }
      const data = (await response.json()) as ServerStatus
      if (requestRef.current !== request || request.signal.aborted) return null
      setStatus(data)
      setError(null)
      return data
    } catch (unknownError) {
      if (requestRef.current !== request || (request.signal.aborted && !timedOut)) {
        return null
      }
      setError(
        timedOut
          ? "El servidor tarda demasiado en responder. Comprueba la conexión e inténtalo de nuevo."
          : unknownError instanceof Error && unknownError.message.startsWith("No se pudo")
            ? unknownError.message
            : "No se pudo conectar con el servidor. Comprueba que la aplicación esté abierta en la computadora.",
      )
      return null
    } finally {
      window.clearTimeout(timeout)
      if (requestRef.current === request) {
        requestRef.current = null
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let timer: number | undefined
    async function poll() {
      await loadStatus()
      if (!disposed) timer = window.setTimeout(() => void poll(), 5000)
    }
    void poll()
    return () => {
      disposed = true
      window.clearTimeout(timer)
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [loadStatus])

  return { status, error, isLoading, refreshStatus: loadStatus }
}
