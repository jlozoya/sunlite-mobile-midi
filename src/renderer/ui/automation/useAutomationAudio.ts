import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AutomationAudioFrame,
  AutomationSocketCommand,
} from "../../../shared/automation-types"
import { makeFrame } from "./audio-analysis"
import { audioErrorMessage } from "./automation-readiness"

export const SYSTEM_AUDIO_DEVICE_ID = "system-loopback"
export function useAutomationAudio(
  sendAutomationCommand: (command: AutomationSocketCommand) => boolean,
  showLiveFrames: boolean,
  setError: (message: string | null) => void,
) {
  const [audioRunning, setAudioRunning] = useState(false)

  const [audioBusy, setAudioBusy] = useState(false)

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])

  const [selectedDeviceId, setSelectedDeviceId] = useState(
    () =>
      window.localStorage.getItem("sunlite-automation-audio-device") ??
      (window.rekordboxCapture ? SYSTEM_AUDIO_DEVICE_ID : ""),
  )

  const [liveFrames, setLiveFrames] = useState<AutomationAudioFrame[]>([])

  const showLiveFramesRef = useRef(showLiveFrames)

  const streamRef = useRef<MediaStream | null>(null)

  const contextRef = useRef<AudioContext | null>(null)

  const timerRef = useRef<number | null>(null)

  const previousSpectrumRef = useRef<number[]>([])

  const audioRequestRef = useRef(0)
  const audioStartingRef = useRef(false)

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "audioinput",
      )
      setAudioDevices(devices)
    } catch (error) {
      setError(audioErrorMessage(error))
    }
  }, [setError])

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

  const startAudio = useCallback(
    async (deviceIdOverride?: string) => {
      if (audioStartingRef.current) return false
      audioStartingRef.current = true
      const deviceId = deviceIdOverride ?? selectedDeviceId
      if (deviceIdOverride) setSelectedDeviceId(deviceIdOverride)
      setAudioBusy(true)
      setError(null)
      try {
        stopAudio()
        const request = audioRequestRef.current
        if (!navigator.mediaDevices) {
          throw new Error(
            "La captura de audio necesita abrir la app en este equipo o usar HTTPS.",
          )
        }
        const systemAudio = deviceId === SYSTEM_AUDIO_DEVICE_ID
        if (systemAudio && !window.rekordboxCapture) {
          throw new Error(
            "El audio del PC solo se puede capturar desde la aplicación de escritorio.",
          )
        }
        const stream = systemAudio
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 2,
              },
            })
        if (systemAudio) {
          stream.getVideoTracks().forEach((track) => track.stop())
          if (!stream.getAudioTracks().length) {
            stream.getTracks().forEach((track) => track.stop())
            throw new Error(
              "Windows no entregó audio del sistema. Selecciona una entrada USB/REC OUT del mixer.",
            )
          }
        }
        if (request !== audioRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return false
        }
        streamRef.current = stream
        const context = new AudioContext({ latencyHint: "interactive" })
        contextRef.current = context
        await context.resume()
        if (request !== audioRequestRef.current) return false
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
              setError(
                "La entrada de audio se desconectó. Revisa el dispositivo y vuelve a activarla.",
              )
            },
            { once: true },
          )
        })
        setAudioRunning(true)
        await refreshAudioDevices()
        if (request !== audioRequestRef.current) return false

        const sendFrame = () => {
          const frame = makeFrame(analyser, previousSpectrumRef.current)
          previousSpectrumRef.current = frame.spectrum
          if (!sendAutomationCommand({ type: "automation-audio-frame", frame })) {
            stopAudio()
            setError("Se perdió la conexión con la app. Vuelve a iniciar el audio.")
            return false
          }
          if (showLiveFramesRef.current) {
            setLiveFrames((current) => [...current.slice(-179), frame])
          }
          return true
        }
        if (!sendFrame()) return false
        timerRef.current = window.setInterval(() => void sendFrame(), 120)
        return true
      } catch (error) {
        stopAudio()
        setError(audioErrorMessage(error))
        return false
      } finally {
        audioStartingRef.current = false
        setAudioBusy(false)
      }
    },
    [refreshAudioDevices, selectedDeviceId, sendAutomationCommand, stopAudio, setError],
  )
  showLiveFramesRef.current = showLiveFrames
  useEffect(() => {
    if (!showLiveFrames) setLiveFrames([])
  }, [showLiveFrames])
  useEffect(() => {
    window.localStorage.setItem("sunlite-automation-audio-device", selectedDeviceId)
  }, [selectedDeviceId])
  useEffect(() => stopAudio, [stopAudio])
  useEffect(() => {
    void refreshAudioDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioDevices)
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshAudioDevices)
  }, [refreshAudioDevices])
  return {
    audioRunning,
    audioBusy,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    liveFrames,
    startAudio,
    stopAudio,
    refreshAudioDevices,
  }
}
