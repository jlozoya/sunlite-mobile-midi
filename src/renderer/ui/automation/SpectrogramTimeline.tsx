import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useRef, useState } from "react"
import type {
  AutomationAudioFrame,
  AutomationTimelineEvent,
} from "../../../shared/automation-types"

type Props = {
  liveFrames: AutomationAudioFrame[]
  timeline: AutomationTimelineEvent[]
  editable?: boolean
  busy?: boolean
  onMoveExample?: (id: string, t: number) => Promise<boolean>
}

type DragState = {
  id: string
  t: number
}

function heatColor(value: number): string {
  const normalized = Math.max(0, Math.min(1, value))
  const hue = 255 - normalized * 230
  const lightness = 10 + normalized * 55
  return `hsl(${hue} 88% ${lightness}%)`
}

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function SpectrogramTimeline({
  liveFrames,
  timeline,
  editable = false,
  busy = false,
  onMoveExample,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const duration = useMemo(
    () => Math.max(1, ...timeline.map((event) => event.t)),
    [timeline],
  )
  const examples = useMemo(
    () => timeline.filter((event) => event.kind === "example" && event.example),
    [timeline],
  )
  const canvasWidth = Math.round(1200 * zoom)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const width = canvas.width
    const height = canvas.height
    const rulerHeight = 36
    const spectrumHeight = height - rulerHeight
    context.fillStyle = "#070a12"
    context.fillRect(0, 0, width, height)

    const recordedFrames = timeline
      .filter((event) => event.kind === "audio" && event.frame)
      .map((event) => ({ t: event.t, frame: event.frame as AutomationAudioFrame }))
    const frames = recordedFrames.length
      ? recordedFrames
      : liveFrames.map((frame, index) => ({ t: index, frame }))

    if (frames.length) {
      for (let column = 0; column < frames.length; column += 1) {
        const spectrum = frames[column].frame.spectrum
        const nextT = frames[column + 1]?.t ?? duration
        const x = recordedFrames.length
          ? (frames[column].t / duration) * width
          : (column / frames.length) * width
        const nextX = recordedFrames.length
          ? (nextT / duration) * width
          : ((column + 1) / frames.length) * width
        const rowHeight = spectrumHeight / Math.max(1, spectrum.length)
        for (let row = 0; row < spectrum.length; row += 1) {
          context.fillStyle = heatColor(spectrum[row])
          context.fillRect(
            x,
            spectrumHeight - (row + 1) * rowHeight,
            Math.max(1, nextX - x + 0.5),
            Math.max(1, rowHeight + 0.5),
          )
        }
      }
    } else {
      context.fillStyle = "#64748b"
      context.font = "600 15px system-ui"
      context.fillText("No hay espectrograma de audio en esta sesión", 24, 72)
    }

    for (const event of timeline) {
      const x = (event.t / duration) * width
      if (event.kind === "beat") {
        context.strokeStyle =
          event.beat?.beatWithinBar === 1
            ? "rgba(255,255,255,0.58)"
            : "rgba(255,255,255,0.14)"
        context.lineWidth = event.beat?.beatWithinBar === 1 ? 2 : 1
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, spectrumHeight)
        context.stroke()
      }
      if (event.kind === "midi" && event.source === "automatic") {
        context.fillStyle = "#22d3ee"
        context.fillRect(Math.max(0, x - 2), 0, 4, spectrumHeight)
      }
    }

    const ccByController = new Map<number, AutomationTimelineEvent[]>()
    for (const event of examples) {
      const command = event.example?.command
      if (command?.type !== "cc") continue
      const values = ccByController.get(command.controller) ?? []
      values.push(event)
      ccByController.set(command.controller, values)
    }
    for (const values of ccByController.values()) {
      values.sort((left, right) => left.t - right.t)
      context.strokeStyle = "rgba(167,139,250,0.88)"
      context.lineWidth = 3
      context.beginPath()
      values.forEach((event, index) => {
        const command = event.example?.command
        if (command?.type !== "cc") return
        const displayT = drag && drag.id === event.example?.id ? drag.t : event.t
        const x = (displayT / duration) * width
        const y = spectrumHeight - 12 - (command.value / 127) * 72
        if (index) context.lineTo(x, y)
        else context.moveTo(x, y)
      })
      context.stroke()
    }

    for (const event of examples) {
      if (!event.example) continue
      const displayT = drag?.id === event.example.id ? drag.t : event.t
      const x = (displayT / duration) * width
      const isCc = event.example.command.type === "cc"
      const isHovered = hoveredId === event.example.id || drag?.id === event.example.id
      context.fillStyle = isCc ? "#a78bfa" : "#f59e0b"
      context.fillRect(
        Math.max(0, x - (isHovered ? 3 : 2)),
        0,
        isHovered ? 6 : 4,
        spectrumHeight,
      )
      context.beginPath()
      context.moveTo(x - 7, 0)
      context.lineTo(x + 7, 0)
      context.lineTo(x, 12)
      context.closePath()
      context.fill()
    }

    context.fillStyle = "rgba(7,10,18,0.94)"
    context.fillRect(0, spectrumHeight, width, rulerHeight)
    context.fillStyle = "#94a3b8"
    context.font = "600 12px system-ui"
    const markerCount = Math.max(4, Math.round(zoom * 4))
    for (let marker = 0; marker <= markerCount; marker += 1) {
      const x = (marker / markerCount) * width
      context.fillText(formatTime((marker / markerCount) * duration), x + 5, height - 11)
    }
  }, [canvasWidth, drag, duration, examples, hoveredId, liveFrames, timeline, zoom])

  function pointerTime(clientX: number): number {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    return Math.max(
      0,
      Math.min(duration, ((clientX - rect.left) / rect.width) * duration),
    )
  }

  function closestExample(t: number): AutomationTimelineEvent | undefined {
    const threshold = (14 / canvasWidth) * duration
    return examples.reduce<AutomationTimelineEvent | undefined>((closest, event) => {
      if (Math.abs(event.t - t) > threshold) return closest
      if (!closest || Math.abs(event.t - t) < Math.abs(closest.t - t)) return event
      return closest
    }, undefined)
  }

  function setZoomKeepingCenter(nextZoom: number) {
    const container = scrollRef.current
    const previousZoom = zoom
    const clamped = Math.max(1, Math.min(8, nextZoom))
    setZoom(clamped)
    if (!container) return
    const centerRatio =
      (container.scrollLeft + container.clientWidth / 2) /
      Math.max(1, container.scrollWidth)
    requestAnimationFrame(() => {
      container.scrollLeft =
        centerRatio * container.scrollWidth - container.clientWidth / 2
    })
    if (previousZoom === clamped) return
  }

  return (
    <div>
      <div {...stylex.props(styles.toolbar)}>
        <span>
          {editable ? "Arrastra una acción para cambiar su posición" : "Vista en vivo"}
        </span>
        <div {...stylex.props(styles.zoomControls)}>
          <button
            type="button"
            {...stylex.props(styles.zoomButton)}
            disabled={zoom <= 1}
            onClick={() => setZoomKeepingCenter(zoom / 1.5)}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            {...stylex.props(styles.zoomButton)}
            disabled={zoom >= 8}
            onClick={() => setZoomKeepingCenter(zoom * 1.5)}
          >
            +
          </button>
          <button
            type="button"
            {...stylex.props(styles.zoomButton, styles.resetButton)}
            onClick={() => setZoomKeepingCenter(1)}
          >
            Ajustar
          </button>
        </div>
      </div>
      <div ref={scrollRef} {...stylex.props(styles.scroller)}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={300}
          aria-label="Espectrograma y acciones MIDI editables"
          {...stylex.props(styles.canvas, editable && styles.canvasEditable)}
          onPointerDown={(event) => {
            if (!editable || busy) return
            const example = closestExample(pointerTime(event.clientX))
            if (!example?.example) return
            event.currentTarget.setPointerCapture(event.pointerId)
            setDrag({ id: example.example.id, t: example.t })
          }}
          onPointerMove={(event) => {
            const t = pointerTime(event.clientX)
            if (drag) setDrag({ ...drag, t })
            else setHoveredId(closestExample(t)?.example?.id ?? null)
          }}
          onPointerLeave={() => {
            if (!drag) setHoveredId(null)
          }}
          onPointerUp={(event) => {
            if (!drag) return
            const completed = { ...drag, t: pointerTime(event.clientX) }
            setDrag(null)
            void onMoveExample?.(completed.id, completed.t)
          }}
          onPointerCancel={() => setDrag(null)}
        />
      </div>
    </div>
  )
}

const styles = stylex.create({
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "0 3px 8px",
    color: "#64748b",
    fontSize: "0.72rem",
  },
  zoomControls: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  zoomButton: {
    minWidth: "28px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: "7px",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#cbd5e1",
    cursor: "pointer",
    padding: "4px 7px",
    fontWeight: 800,
  },
  resetButton: { minWidth: "auto" },
  scroller: {
    width: "100%",
    overflowX: "auto",
    borderRadius: "14px",
  },
  canvas: {
    display: "block",
    minWidth: "100%",
    maxWidth: "none",
    height: "auto",
    borderRadius: "14px",
  },
  canvasEditable: {
    cursor: "grab",
    touchAction: "none",
  },
})
