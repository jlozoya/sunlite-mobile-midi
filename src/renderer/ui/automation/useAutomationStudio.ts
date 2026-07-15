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

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const previousSpectrumRef = useRef<number[]>([])

  const refreshStatus = useCallback(async () => {
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/status")
      setStatus(next)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo leer Automation Studio",
      )
    }
  }, [])

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "audioinput",
    )
    setAudioDevices(devices)
    if (!selectedDeviceId && devices[0]?.deviceId)
      setSelectedDeviceId(devices[0].deviceId)
  }, [selectedDeviceId])

  useEffect(() => {
    void refreshStatus()
    const timer = window.setInterval(() => void refreshStatus(), 1000)
    void refreshAudioDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioDevices)
    return () => {
      window.clearInterval(timer)
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshAudioDevices)
    }
  }, [refreshAudioDevices, refreshStatus])

  useEffect(() => {
    if (selectedDeviceId) {
      window.localStorage.setItem("sunlite-automation-audio-device", selectedDeviceId)
    }
  }, [selectedDeviceId])

  const stopAudio = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close()
    contextRef.current = null
    previousSpectrumRef.current = []
    setAudioRunning(false)
    sendAutomationCommand({ type: "automation-audio-disconnected" })
  }, [sendAutomationCommand])

  const startAudio = useCallback(async () => {
    setBusy("audio")
    setMessage(null)
    try {
      stopAudio()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        },
      })
      const context = new AudioContext({ latencyHint: "interactive" })
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.35
      context.createMediaStreamSource(stream).connect(analyser)

      streamRef.current = stream
      contextRef.current = context
      setAudioRunning(true)
      await refreshAudioDevices()

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
      setBusy(null)
    }
  }, [refreshAudioDevices, selectedDeviceId, sendAutomationCommand, stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  const updateMode = useCallback(async (mode: AutomationMode) => {
    setBusy("mode")
    try {
      setStatus(
        await requestJson<AutomationStatus>("/api/automation/mode", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        }),
      )
    } finally {
      setBusy(null)
    }
  }, [])

  const updateSettings = useCallback(async (settings: AutomationSettings) => {
    setBusy("settings")
    try {
      setStatus(
        await requestJson<AutomationStatus>("/api/automation/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }),
      )
      setMessage("Reglas guardadas")
    } finally {
      setBusy(null)
    }
  }, [])

  const startSession = useCallback(async (name: string) => {
    setBusy("session")
    try {
      setStatus(
        await requestJson<AutomationStatus>("/api/automation/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      )
      setTimeline([])
      setMessage("Grabación de entrenamiento iniciada")
    } finally {
      setBusy(null)
    }
  }, [])

  const stopSession = useCallback(async () => {
    setBusy("session")
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/session/stop", {
        method: "POST",
      })
      setStatus(next)
      setMessage(`Sesión guardada · ${next.modelExampleCount} ejemplos entrenados`)
    } finally {
      setBusy(null)
    }
  }, [])

  const train = useCallback(async () => {
    setBusy("train")
    try {
      const next = await requestJson<AutomationStatus>("/api/automation/train", {
        method: "POST",
      })
      setStatus(next)
      setMessage(`Modelo actualizado con ${next.modelExampleCount} ejemplos`)
    } finally {
      setBusy(null)
    }
  }, [])

  const loadSession = useCallback(async (id: string) => {
    setBusy("timeline")
    try {
      const payload = await requestJson<{ events: AutomationTimelineEvent[] }>(
        `/api/automation/sessions/${encodeURIComponent(id)}`,
      )
      setSelectedSessionId(id)
      setTimeline(payload.events)
    } finally {
      setBusy(null)
    }
  }, [])

  const excludeExample = useCallback(async (id: string) => {
    setBusy(`exclude-${id}`)
    try {
      const next = await requestJson<AutomationStatus>(
        `/api/automation/examples/${encodeURIComponent(id)}/exclude`,
        { method: "POST" },
      )
      setStatus(next)
      setTimeline((current) =>
        current.filter((event) => event.kind !== "example" || event.example?.id !== id),
      )
      setMessage(
        `Ejemplo excluido · el modelo conserva ${next.modelExampleCount} ejemplos`,
      )
    } finally {
      setBusy(null)
    }
  }, [])

  const restartBridge = useCallback(async () => {
    setBusy("bridge")
    try {
      setStatus(
        await requestJson<AutomationStatus>("/api/automation/prodj-link/restart", {
          method: "POST",
        }),
      )
      setMessage("Reiniciando listener PRO DJ LINK")
    } finally {
      setBusy(null)
    }
  }, [])

  return {
    status,
    audioRunning,
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
    excludeExample,
    restartBridge,
  }
}
