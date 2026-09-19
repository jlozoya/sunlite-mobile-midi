import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AutomationAudioFrame,
  AutomationMode,
  AutomationSettings,
  AutomationSocketCommand,
  AutomationStatus,
  AutomationTimelineEvent,
} from "../../../shared/automation-types"

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
  return payload as T
}

function averageRange(
  frequencyData: Uint8Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): number {
  const nyquist = sampleRate / 2
  const start = Math.max(0, Math.floor((minHz / nyquist) * frequencyData.length))
  const end = Math.min(
    frequencyData.length - 1,
    Math.ceil((maxHz / nyquist) * frequencyData.length),
  )
  let total = 0
  let count = 0
  for (let index = start; index <= end; index += 1) {
    total += frequencyData[index] / 255
    count += 1
  }
  return count ? total / count : 0
}

function compactSpectrum(frequencyData: Uint8Array, sampleRate: number): number[] {
  const nyquist = sampleRate / 2
  const bands = 64
  const minHz = 35
  const maxHz = Math.min(18000, nyquist)
  const result: number[] = []

  for (let band = 0; band < bands; band += 1) {
    const lowRatio = band / bands
    const highRatio = (band + 1) / bands
    const lowHz = minHz * Math.pow(maxHz / minHz, lowRatio)
    const highHz = minHz * Math.pow(maxHz / minHz, highRatio)
    result.push(averageRange(frequencyData, sampleRate, lowHz, highHz))
  }
  return result
}

function makeFrame(
  analyser: AnalyserNode,
  previousSpectrum: number[],
): AutomationAudioFrame {
  const frequencyData = new Uint8Array(analyser.frequencyBinCount)
  const timeData = new Float32Array(analyser.fftSize)
  analyser.getByteFrequencyData(frequencyData)
  analyser.getFloatTimeDomainData(timeData)

  let squared = 0
  for (const sample of timeData) squared += sample * sample
  const rms = Math.sqrt(squared / Math.max(1, timeData.length))
  const spectrum = compactSpectrum(frequencyData, analyser.context.sampleRate)

  let flux = 0
  let weighted = 0
  let magnitude = 0
  for (let index = 0; index < spectrum.length; index += 1) {
    flux += Math.max(0, spectrum[index] - (previousSpectrum[index] ?? spectrum[index]))
    weighted += spectrum[index] * (index / Math.max(1, spectrum.length - 1))
    magnitude += spectrum[index]
  }

  return {
    capturedAt: Date.now(),
    sampleRate: analyser.context.sampleRate,
    spectrum,
    features: {
      rms: Math.min(1, rms * 3.5),
      bass: averageRange(frequencyData, analyser.context.sampleRate, 35, 250),
      mid: averageRange(frequencyData, analyser.context.sampleRate, 250, 2500),
      high: averageRange(frequencyData, analyser.context.sampleRate, 2500, 14000),
      flux: Math.min(1, (flux / Math.max(1, spectrum.length)) * 5),
      centroid: magnitude > 0 ? weighted / magnitude : 0,
    },
  }
}

export function useAutomationStudio(sendAutomationCommand: SendAutomationCommand) {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [audioRunning, setAudioRunning] = useState(false)
  const [audioBusy, setAudioBusy] = useState(false)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    () => window.localStorage.getItem("sunlite-automation-audio-device") ?? "",
  )
  const [liveFrames, setLiveFrames] = useState<AutomationAudioFrame[]>([])
  const [timeline, setTimeline] = useState<AutomationTimelineEvent[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const clearMessage = useCallback(() => setMessage(null), [])
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const statusRequestRef = useRef<AbortController | null>(null)
  const sessionRequestRef = useRef(0)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const previousSpectrumRef = useRef<number[]>([])
  const audioRequestRef = useRef(0)

  const refreshStatus = useCallback(async () => {
    if (statusRequestRef.current) return
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

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "audioinput",
      )
      setAudioDevices(devices)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron listar las entradas de audio",
      )
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const timer = window.setInterval(() => void refreshStatus(), 1000)
    void refreshAudioDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioDevices)
    return () => {
      window.clearInterval(timer)
      statusRequestRef.current?.abort()
      statusRequestRef.current = null
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshAudioDevices)
    }
  }, [refreshAudioDevices, refreshStatus])

  useEffect(() => {
    window.localStorage.setItem("sunlite-automation-audio-device", selectedDeviceId)
  }, [selectedDeviceId])

  const stopAudio = useCallback(() => {
    audioRequestRef.current += 1
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close().catch(() => undefined)
    contextRef.current = null
    previousSpectrumRef.current = []
    setAudioRunning(false)
    sendAutomationCommand({ type: "automation-audio-disconnected" })
  }, [sendAutomationCommand])

  const startAudio = useCallback(async () => {
    setAudioBusy(true)
    setMessage(null)
    try {
      stopAudio()
      const request = audioRequestRef.current
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "La captura de audio necesita abrir la app en este equipo o usar HTTPS.",
        )
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        },
      })
      if (request !== audioRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const context = new AudioContext({ latencyHint: "interactive" })
      contextRef.current = context
      await context.resume()
      if (request !== audioRequestRef.current) return
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.35
      context.createMediaStreamSource(stream).connect(analyser)

      stream.getAudioTracks().forEach((track) => {
        track.addEventListener(
          "ended",
          () => {
            if (streamRef.current !== stream) return
            stopAudio()
            setMessage(
              "La entrada de audio se desconectó. Revisa el dispositivo y vuelve a activarla.",
            )
          },
          { once: true },
        )
      })
      setAudioRunning(true)
      await refreshAudioDevices()
      if (request !== audioRequestRef.current) return

      timerRef.current = window.setInterval(() => {
        const frame = makeFrame(analyser, previousSpectrumRef.current)
        previousSpectrumRef.current = frame.spectrum
        sendAutomationCommand({ type: "automation-audio-frame", frame })
        setLiveFrames((current) => [...current.slice(-179), frame])
      }, 120)
    } catch (error) {
      stopAudio()
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo abrir la entrada de audio del mixer",
      )
    } finally {
      setAudioBusy(false)
    }
  }, [refreshAudioDevices, selectedDeviceId, sendAutomationCommand, stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  const updateMode = useCallback(
    async (mode: AutomationMode) => {
      setBusy("mode")
      setMessage(null)
      try {
        applyMutationStatus(
          await requestJson<AutomationStatus>("/api/automation/mode", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode }),
          }),
        )
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo cambiar el modo")
        return false
      } finally {
        setBusy(null)
      }
    },
    [applyMutationStatus],
  )

  const updateSettings = useCallback(
    async (settings: AutomationSettings) => {
      setBusy("settings")
      setMessage(null)
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
        setMessage(
          error instanceof Error ? error.message : "No se pudieron guardar las reglas",
        )
        return false
      } finally {
        setBusy(null)
      }
    },
    [applyMutationStatus],
  )

  const startSession = useCallback(
    async (name: string) => {
      setBusy("session")
      setMessage(null)
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
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "No se pudo iniciar la grabación",
        )
        return false
      } finally {
        setBusy(null)
      }
    },
    [applyMutationStatus],
  )

  const stopSession = useCallback(async () => {
    setBusy("session")
    setMessage(null)
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/session/stop", {
        method: "POST",
      })
      applyMutationStatus(next)
      setMessage(`Sesión guardada · ${next.modelExampleCount} ejemplos entrenados`)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo finalizar la grabación",
      )
      return false
    } finally {
      setBusy(null)
    }
  }, [applyMutationStatus])

  const train = useCallback(async () => {
    setBusy("train")
    setMessage(null)
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/train", {
        method: "POST",
      })
      applyMutationStatus(next)
      setMessage(`Modelo actualizado con ${next.modelExampleCount} ejemplos`)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo reentrenar el modelo",
      )
      return false
    } finally {
      setBusy(null)
    }
  }, [applyMutationStatus])

  const loadSession = useCallback(async (id: string) => {
    const request = ++sessionRequestRef.current
    setBusy("timeline")
    setMessage(null)
    try {
      const payload = await requestJson<{ events: AutomationTimelineEvent[] }>(
        `/api/automation/sessions/${encodeURIComponent(id)}`,
      )
      if (request !== sessionRequestRef.current) return
      setSelectedSessionId(id)
      setTimeline(payload.events)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la sesión")
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  const showLiveTimeline = useCallback(() => {
    sessionRequestRef.current += 1
    setSelectedSessionId(null)
    setTimeline([])
  }, [])

  const renameSession = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      setBusy(`rename-${id}`)
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
        setMessage(
          error instanceof Error ? error.message : "No se pudo renombrar la sesión",
        )
        return false
      } finally {
        setBusy(null)
      }
    },
    [applyMutationStatus],
  )

  const deleteSession = useCallback(
    async (id: string): Promise<boolean> => {
      setBusy(`delete-${id}`)
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
        setMessage(
          error instanceof Error ? error.message : "No se pudo eliminar la sesión",
        )
        return false
      } finally {
        setBusy(null)
      }
    },
    [applyMutationStatus, selectedSessionId],
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
      setBusy("edit-examples")
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
        setMessage(
          error instanceof Error ? error.message : "No se pudieron guardar los cambios",
        )
        return false
      } finally {
        setBusy(null)
      }
    },
    [applyMutationStatus, selectedSessionId],
  )

  const excludeExample = useCallback(
    async (id: string) => {
      setBusy(`exclude-${id}`)
      setMessage(null)
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
        setMessage(
          error instanceof Error ? error.message : "No se pudo excluir el ejemplo",
        )
        return false
      } finally {
        setBusy(null)
      }
    },
    [applyMutationStatus],
  )

  const restartBridge = useCallback(async () => {
    setBusy("bridge")
    setMessage(null)
    try {
      applyMutationStatus(
        await requestJson<AutomationStatus>("/api/automation/prodj-link/restart", {
          method: "POST",
        }),
      )
      setMessage("Reiniciando listener PRO DJ LINK")
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo reiniciar PRO DJ LINK",
      )
      return false
    } finally {
      setBusy(null)
    }
  }, [applyMutationStatus])

  return {
    status,
    statusError,
    statusLoading,
    refreshStatus,
    showLiveTimeline,
    audioRunning,
    audioBusy,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    liveFrames,
    timeline,
    selectedSessionId,
    busy,
    message,
    clearMessage,
    startAudio,
    stopAudio,
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
