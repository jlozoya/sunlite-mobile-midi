import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  averageSliderCurve,
  type SliderCurvePoint,
  type SliderGesture,
} from "./slider-curves"

type Props = {
  gesture: SliderGesture
  busy: boolean
  onClose: () => void
  onSave: (changes: {
    points: SliderCurvePoint[]
    deletedIds: string[]
  }) => Promise<boolean>
}

const WIDTH = 760
const HEIGHT = 270
const PADDING = 38

function smoothPath(
  points: SliderCurvePoint[],
  xFor: (t: number) => number,
  yFor: (value: number) => number,
): string {
  if (!points.length) return ""
  if (points.length === 1) return `M${xFor(points[0].t)} ${yFor(points[0].value)}`
  let path = `M${xFor(points[0].t)} ${yFor(points[0].value)}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    const middleX = (xFor(point.t) + xFor(next.t)) / 2
    const middleY = (yFor(point.value) + yFor(next.value)) / 2
    path += ` Q${xFor(point.t)} ${yFor(point.value)} ${middleX} ${middleY}`
  }
  const last = points[points.length - 1]
  return `${path} L${xFor(last.t)} ${yFor(last.value)}`
}

export function SliderCurveEditor({ gesture, busy, onClose, onSave }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [points, setPoints] = useState(() =>
    gesture.points.map((point) => ({ ...point })),
  )
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [deletedIds, setDeletedIds] = useState<string[]>([])

  useEffect(() => {
    setPoints(gesture.points.map((point) => ({ ...point })))
    setDeletedIds([])
  }, [gesture.id])

  const start = Math.min(...gesture.points.map((point) => point.t))
  const end = Math.max(...gesture.points.map((point) => point.t))
  const duration = Math.max(100, end - start)
  const xFor = (t: number) => PADDING + ((t - start) / duration) * (WIDTH - PADDING * 2)
  const yFor = (value: number) => PADDING + (1 - value / 127) * (HEIGHT - PADDING * 2)
  const path = smoothPath(points, xFor, yFor)
  const originalPath = smoothPath(gesture.points, xFor, yFor)
  const average = useMemo(
    () =>
      points.length
        ? Math.round(points.reduce((sum, point) => sum + point.value, 0) / points.length)
        : 0,
    [points],
  )

  function updateDraggedPoint(clientX: number, clientY: number) {
    if (dragIndex === null || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * WIDTH
    const y = ((clientY - rect.top) / rect.height) * HEIGHT
    setPoints((current) => {
      const previous = current[dragIndex - 1]
      const next = current[dragIndex + 1]
      const rawT = start + ((x - PADDING) / (WIDTH - PADDING * 2)) * duration
      const minimumT = previous ? previous.t + 1 : start
      const maximumT = next ? next.t - 1 : end
      const value = Math.round((1 - (y - PADDING) / (HEIGHT - PADDING * 2)) * 127)
      return current.map((point, index) =>
        index === dragIndex
          ? {
              ...point,
              t: Math.max(minimumT, Math.min(maximumT, rawT)),
              value: Math.max(0, Math.min(127, value)),
            }
          : point,
      )
    })
  }

  function addPoint(clientX: number, clientY: number) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * WIDTH
    const y = ((clientY - rect.top) / rect.height) * HEIGHT
    const t = Math.max(
      start,
      Math.min(end, start + ((x - PADDING) / (WIDTH - PADDING * 2)) * duration),
    )
    const value = Math.max(
      0,
      Math.min(127, Math.round((1 - (y - PADDING) / (HEIGHT - PADDING * 2)) * 127)),
    )
    const id = `curve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setPoints((current) =>
      [...current, { id, t, value, isNew: true }].sort((left, right) => left.t - right.t),
    )
  }

  return (
    <div {...stylex.props(styles.overlay)} role="presentation" onMouseDown={onClose}>
      <section
        {...stylex.props(styles.dialog)}
        role="dialog"
        aria-modal="true"
        aria-label={`Editar curva CC ${gesture.controller}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div {...stylex.props(styles.heading)}>
          <div>
            <span {...stylex.props(styles.eyebrow)}>Movimiento de slider</span>
            <h3 {...stylex.props(styles.title)}>CC {gesture.controller}</h3>
            <p {...stylex.props(styles.description)}>
              Arrastra para editar · doble clic para agregar · clic derecho para eliminar.
              El promedio suave reduce el ruido de los mensajes MIDI intermedios.
            </p>
          </div>
          <button type="button" {...stylex.props(styles.closeButton)} onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div {...stylex.props(styles.chartWrap)}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            {...stylex.props(styles.chart)}
            onPointerMove={(event) => updateDraggedPoint(event.clientX, event.clientY)}
            onPointerUp={() => setDragIndex(null)}
            onPointerCancel={() => setDragIndex(null)}
            onDoubleClick={(event) => {
              if ((event.target as Element).tagName.toLowerCase() === "circle") return
              event.preventDefault()
              addPoint(event.clientX, event.clientY)
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            {[0, 32, 64, 96, 127].map((value) => (
              <g key={value}>
                <line
                  x1={PADDING}
                  x2={WIDTH - PADDING}
                  y1={yFor(value)}
                  y2={yFor(value)}
                  stroke="rgba(148,163,184,0.18)"
                />
                <text x="5" y={yFor(value) + 4} fill="#64748b" fontSize="11">
                  {value}
                </text>
              </g>
            ))}
            <path d={originalPath} fill="none" stroke="#475569" strokeWidth="3" />
            <path d={path} fill="none" stroke="#22d3ee" strokeWidth="4" />
            {points.map((point, index) => (
              <circle
                key={point.id}
                cx={xFor(point.t)}
                cy={yFor(point.value)}
                r="7"
                fill="#a5f3fc"
                stroke="#0e7490"
                strokeWidth="3"
                onPointerDown={(event) => {
                  event.preventDefault()
                  setDragIndex(index)
                  svgRef.current?.setPointerCapture(event.pointerId)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setDragIndex(null)
                  if (!point.isNew) {
                    setDeletedIds((current) => [...new Set([...current, point.id])])
                  }
                  setPoints((current) => current.filter((item) => item.id !== point.id))
                }}
                style={{ cursor: "grab" }}
              />
            ))}
          </svg>
        </div>

        <div {...stylex.props(styles.summary)}>
          <span>{points.length} mensajes agrupados</span>
          {deletedIds.length ? <span>{deletedIds.length} eliminados</span> : null}
          <span>Promedio: {average}</span>
          <span>Duración: {Math.round(duration)} ms</span>
        </div>
        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            {...stylex.props(styles.secondaryButton)}
            onClick={() => setPoints(averageSliderCurve(points))}
          >
            Suavizar curva
          </button>
          <button
            type="button"
            {...stylex.props(styles.secondaryButton)}
            onClick={() => {
              setPoints(gesture.points.map((point) => ({ ...point })))
              setDeletedIds([])
            }}
          >
            Restaurar
          </button>
          <button
            type="button"
            {...stylex.props(styles.primaryButton)}
            disabled={busy}
            onClick={async () => {
              if (await onSave({ points, deletedIds })) onClose()
            }}
          >
            {busy ? "Guardando..." : "Guardar curva"}
          </button>
        </div>
      </section>
    </div>
  )
}

const styles = stylex.create({
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "grid",
    placeItems: "center",
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    backdropFilter: "blur(8px)",
    padding: "18px",
    userSelect: "none",
  },
  dialog: {
    width: "min(900px, 100%)",
    maxHeight: "calc(100vh - 36px)",
    overflowY: "auto",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34, 211, 238, 0.3)",
    borderRadius: "22px",
    backgroundColor: "#0b1120",
    boxShadow: "0 30px 100px rgba(0,0,0,0.65)",
    padding: "18px",
    userSelect: "none",
  },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
  },
  eyebrow: {
    color: "#22d3ee",
    fontSize: "0.68rem",
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  title: { margin: "4px 0", fontSize: "1.25rem" },
  description: { margin: 0, color: "#94a3b8", fontSize: "0.82rem" },
  closeButton: {
    alignSelf: "flex-start",
    borderWidth: 0,
    borderRadius: "9px",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#cbd5e1",
    cursor: "pointer",
    padding: "8px 10px",
  },
  chartWrap: {
    marginTop: "16px",
    borderRadius: "14px",
    backgroundColor: "#060912",
    padding: "8px",
  },
  chart: {
    display: "block",
    width: "100%",
    touchAction: "none",
    cursor: "crosshair",
    userSelect: "none",
  },
  summary: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    marginTop: "10px",
    color: "#94a3b8",
    fontSize: "0.76rem",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "15px",
  },
  primaryButton: {
    borderWidth: 0,
    borderRadius: "10px",
    backgroundColor: "#0891b2",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    padding: "9px 12px",
  },
  secondaryButton: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 750,
    padding: "9px 12px",
  },
})
