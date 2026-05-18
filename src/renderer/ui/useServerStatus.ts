import { useCallback, useEffect, useState } from "react"
import type { ServerStatus } from "./types"

export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadStatus = useCallback(async () => {
    setIsLoading(true)

    try {
      const response = await fetch("/api/status")

      if (!response.ok) {
        throw new Error(`Failed to load server status: ${response.status}`)
      }

      const data = (await response.json()) as ServerStatus
      setStatus(data)
      setError(null)
      return data
    } catch (unknownError) {
      const message =
        unknownError instanceof Error ? unknownError.message : "Unknown status error"
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  return { status, error, isLoading, refreshStatus: loadStatus }
}
