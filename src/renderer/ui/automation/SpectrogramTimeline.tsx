import { useEffect, useRef } from "react"
import type {
  AutomationAudioFrame,
  AutomationTimelineEvent,
} from "../../../shared/automation-types"

type Props = {
  liveFrames: AutomationAudioFrame[]
  timeline: AutomationTimelineEvent[]
}

function heatColor(value: number): string {
  const normalized = Math.max(0, Math.min(1, value))
  const hue = 255 - normalized * 230
  const lightness = 10 + normalized * 55
  return `hsl(${hue} 88% ${lightness}%)`
}

export function SpectrogramTimeline({ liveFrames, timeline }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const width = canvas.width
    const height = canvas.height
    const rulerHeight = 34
    context.fillStyle = "#070a12"
    context.fillRect(0, 0, width, height)

    const recordedFrames = timeline
      .filter((event) => event.kind === "audio" && event.frame)
      .map((event) => ({ t: event.t, frame: event.frame as AutomationAudioFrame }))
    const frames = recordedFrames.length
      ? recordedFrames
      : liveFrames.map((frame, index) => ({ t: index, frame }))

    if (!frames.length) {
      context.fillStyle = "#64748b"
      context.font = "600 15px system-ui"
      context.fillText("Activa una entrada de audio para ver el espectrograma", 24, 72)
      return
    }

    const spectrumHeight = height - rulerHeight
    const columnWidth = width / Math.max(1, frames.length)
    for (let column = 0; column < frames.length; column += 1) {
      const spectrum = frames[column].frame.spectrum
      const rowHeight = spectrumHeight / Math.max(1, spectrum.length)
      for (let row = 0; row < spectrum.length; row += 1) {
        context.fillStyle = heatColor(spectrum[row])
        context.fillRect(
          column * columnWidth,
          spectrumHeight - (row + 1) * rowHeight,
          Math.max(1, columnWidth + 0.5),
          Math.max(1, rowHeight + 0.5),
        )
      }
    }

    if (timeline.length) {
      const duration = Math.max(1, ...timeline.map((event) => event.t))
      for (const event of timeline) {
        const x = (event.t / duration) * width
        if (event.kind === "beat") {
          context.strokeStyle =
            event.beat?.beatWithinBar === 1
              ? "rgba(255,255,255,0.62)"
              : "rgba(255,255,255,0.16)"
          context.lineWidth = event.beat?.beatWithinBar === 1 ? 2 : 1
          context.beginPath()
          context.moveTo(x, 0)
          context.lineTo(x, spectrumHeight)
          context.stroke()
        }
        if (event.kind === "midi") {
          context.fillStyle = event.source === "automatic" ? "#22d3ee" : "#f59e0b"
          context.fillRect(Math.max(0, x - 2), 0, 4, spectrumHeight)
        }
      }

      context.fillStyle = "rgba(7,10,18,0.92)"
      context.fillRect(0, spectrumHeight, width, rulerHeight)
      context.fillStyle = "#94a3b8"
      context.font = "600 12px system-ui"
      for (let marker = 0; marker <= 4; marker += 1) {
        const x = (marker / 4) * width
        const milliseconds = (marker / 4) * duration
        const minutes = Math.floor(milliseconds / 60000)
        const seconds = Math.floor((milliseconds % 60000) / 1000)
        context.fillText(
          `${minutes}:${String(seconds).padStart(2, "0")}`,
          x + 5,
          height - 11,
        )
      }
    }
  }, [liveFrames, timeline])

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={300}
      aria-label="Espectrograma y acciones MIDI"
      style={{ display: "block", width: "100%", height: "auto", borderRadius: 14 }}
    />
  )
}
