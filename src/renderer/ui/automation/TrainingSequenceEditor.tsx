import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useRef, useState } from "react"
import type { AutomationTimelineEvent } from "../../../shared/automation-types"
import { ActionButton, ConfirmationDialog } from "../ui-kit"
import { formatDuration } from "./automation-format"
import { reviewActions, shiftedAction } from "./training-review"
import type { SliderGesture } from "./slider-curves"
import { reviewStyles as s } from "./TrainingSequenceEditor.styles"

type Props = {
  timeline: AutomationTimelineEvent[]
  duration: number
  disabled: boolean
  error: string | null
  onEditCurve: (gesture: SliderGesture) => void
  onUpdate: (
    edits: { id: string; t?: number; delete?: boolean }[],
    message: string,
  ) => Promise<boolean>
}

export function TrainingSequenceEditor({
  timeline,
  duration,
  disabled,
  error,
  onEditCurve,
  onUpdate,
}: Props) {
  const actions = useMemo(() => reviewActions(timeline), [timeline])
  const positioned = useRef(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [windowMs, setWindowMs] = useState(30000)
  const [offset, setOffset] = useState(() => Math.max(0, (actions[0]?.start ?? 0) - 1000))
  const [filter, setFilter] = useState("")
  const [time, setTime] = useState("")
  const [deleting, setDeleting] = useState(false)
  const selected = actions.find((action) => action.id === selectedId)
  const length = Math.max(1000, duration, ...actions.map((action) => action.end))
  const span = Math.min(windowMs || length, length)
  const start = Math.max(0, Math.min(offset, Math.max(0, length - span)))
  const end = Math.min(length, start + span)
  const lanes = [...new Set(actions.map((action) => action.lane))].sort(
    (a, b) =>
      Number(b.startsWith("Slider")) - Number(a.startsWith("Slider")) ||
      a.localeCompare(b, "es", { numeric: true }),
  )
  const visible = actions.filter(
    (action) =>
      (!filter || action.lane === filter) && action.end >= start && action.start <= end,
  )
  const shownLanes = lanes.filter((lane) => !filter || lane === filter)
  useEffect(() => {
    if (!positioned.current && actions.length) {
      setOffset(Math.max(0, actions[0].start - 1000))
      positioned.current = true
    }
  }, [actions])
  useEffect(() => {
    setTime(selected ? (selected.start / 1000).toFixed(3) : "")
    setDeleting(false)
  }, [selected?.id, selected?.start])
  const nextTime = Number(time)
  const latestStart = length - (selected ? selected.end - selected.start : 0)
  const invalidTime =
    !time.trim() ||
    !Number.isFinite(nextTime) ||
    nextTime < 0 ||
    nextTime * 1000 > latestStart

  function select(id: string) {
    setSelectedId(id)
  }
  return (
    <section {...stylex.props(s.editor)} aria-label="Editor de acciones de entrenamiento">
      <div {...stylex.props(s.toolbar)}>
        <div>
          <h3 {...stylex.props(s.title)}>Tus acciones, en el tiempo</h3>
          <p {...stylex.props(s.help)}>
            {actions.length} acciones · {lanes.length} controles ·{" "}
            {formatDuration(length)} de sesión
          </p>
        </div>
        <label {...stylex.props(s.field)}>
          Mostrar
          <select
            {...stylex.props(s.input)}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Todos los controles</option>
            {lanes.map((lane) => (
              <option key={lane}>{lane}</option>
            ))}
          </select>
        </label>
      </div>
      <div {...stylex.props(s.navigation)}>
        <div {...stylex.props(s.buttons)}>
          <ActionButton
            variant="secondary"
            size="small"
            aria-label="Tramo anterior"
            isDisabled={start === 0}
            onPress={() => setOffset(Math.max(0, start - span))}
          >
            ←
          </ActionButton>
          <strong>
            {formatDuration(start)} – {formatDuration(end)}
          </strong>
          <ActionButton
            variant="secondary"
            size="small"
            aria-label="Tramo siguiente"
            isDisabled={end >= length}
            onPress={() => setOffset(Math.min(length - span, start + span))}
          >
            →
          </ActionButton>
        </div>
        <label {...stylex.props(s.field)}>
          Tramo
          <select
            {...stylex.props(s.input)}
            value={windowMs}
            onChange={(e) => {
              setWindowMs(Number(e.target.value))
              setOffset(0)
            }}
          >
            <option value={10000}>10 segundos</option>
            <option value={30000}>30 segundos</option>
            <option value={60000}>1 minuto</option>
            <option value={0}>Toda la sesión</option>
          </select>
        </label>
      </div>
      <label {...stylex.props(s.field)}>
        Recorrer la sesión · {formatDuration(start)}
        <input
          type="range"
          min={0}
          max={Math.max(0, length - span)}
          step={1000}
          value={start}
          onChange={(e) => setOffset(Number(e.target.value))}
          aria-label="Inicio del tramo visible"
        />
      </label>
      <p {...stylex.props(s.help)}>
        Cada fila es un control. Las acciones alineadas ocurrieron al mismo tiempo.
        Selecciona un bloque para editarlo.
      </p>
      <div {...stylex.props(s.tracks)}>
        <div {...stylex.props(s.row, s.ruler)}>
          <span>Control</span>
          <div {...stylex.props(s.ticks)}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i}>{formatDuration(start + (span * i) / 4)}</span>
            ))}
          </div>
        </div>
        {shownLanes.map((lane) => (
          <div key={lane} {...stylex.props(s.row)}>
            <strong {...stylex.props(s.laneName)}>{lane}</strong>
            <div {...stylex.props(s.track)}>
              {visible
                .filter((action) => action.lane === lane)
                .map((action) => {
                  const left = Math.max(0, ((action.start - start) / span) * 100)
                  const width = Math.min(
                    100 - left,
                    Math.max(
                      1.5,
                      ((Math.min(action.end, end) - Math.max(action.start, start)) /
                        span) *
                        100,
                    ),
                  )
                  const gesture = action.gesture
                  return (
                    <button
                      key={action.id}
                      type="button"
                      aria-pressed={selectedId === action.id}
                      aria-label={`${action.label}, ${formatDuration(action.start)}${gesture ? ` a ${formatDuration(action.end)}` : ""}`}
                      title={`${action.label} · ${formatDuration(action.start)}`}
                      {...stylex.props(
                        s.clip,
                        gesture ? s.slider : s.note,
                        selectedId === action.id && s.selected,
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      onClick={() => select(action.id)}
                    >
                      {gesture ? (
                        <svg
                          viewBox="0 0 300 48"
                          preserveAspectRatio="none"
                          {...stylex.props(s.curve)}
                          aria-hidden="true"
                        >
                          <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            points={gesture.points
                              .map(
                                (p) =>
                                  `${((p.t - Math.max(action.start, start)) / Math.max(1, Math.min(action.end, end) - Math.max(action.start, start))) * 300},${44 - (p.value / 127) * 40}`,
                              )
                              .join(" ")}
                          />
                        </svg>
                      ) : (
                        <span aria-hidden="true">◆</span>
                      )}
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
      {!visible.length ? (
        <p {...stylex.props(s.empty)}>
          No hay acciones en este tramo. Avanza con las flechas o selecciona toda la
          sesión.
        </p>
      ) : null}
      <div {...stylex.props(s.bottom)}>
        <div {...stylex.props(s.list)} aria-label="Acciones del tramo">
          {visible.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => select(action.id)}
              aria-pressed={selectedId === action.id}
              {...stylex.props(s.listItem, selectedId === action.id && s.listSelected)}
            >
              <span {...stylex.props(s.time)}>{formatDuration(action.start)}</span>
              <strong>{action.label}</strong>
              <span {...stylex.props(s.help)}>
                {action.gesture
                  ? `${action.gesture.points[0].value} → ${action.gesture.points.at(-1)!.value}`
                  : action.value !== undefined
                    ? `Valor ${action.value}`
                    : "Pulsación"}
              </span>
            </button>
          ))}
        </div>
        <aside
          {...stylex.props(s.inspector)}
          aria-label="Acción seleccionada"
          aria-live="polite"
        >
          {selected ? (
            <>
              <span {...stylex.props(s.eyebrow)}>ACCIÓN SELECCIONADA</span>
              <h4 {...stylex.props(s.title)}>{selected.label}</h4>
              <p {...stylex.props(s.help)}>
                {selected.gesture
                  ? `Movimiento de ${((selected.end - selected.start) / 1000).toFixed(2)} s. Los mensajes MIDI se editan como una sola curva.`
                  : "Acción puntual. Cambia el segundo en que ocurre o elimínala del entrenamiento."}
              </p>
              <label {...stylex.props(s.field)}>
                Inicio en segundos
                <input
                  type="number"
                  min={0}
                  max={latestStart / 1000}
                  step="0.001"
                  value={time}
                  disabled={disabled}
                  aria-invalid={invalidTime}
                  {...stylex.props(s.input)}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <ActionButton
                variant="secondary"
                isDisabled={disabled || invalidTime || nextTime * 1000 === selected.start}
                onPress={async () => {
                  const target = nextTime * 1000
                  if (await onUpdate(shiftedAction(selected, target), "Acción movida"))
                    setOffset(Math.max(0, target - span / 4))
                }}
              >
                Mover acción
              </ActionButton>
              {selected.gesture ? (
                <ActionButton
                  isDisabled={disabled}
                  onPress={() => onEditCurve(selected.gesture!)}
                >
                  Editar curva
                </ActionButton>
              ) : null}
              <ActionButton
                variant="danger"
                isDisabled={disabled}
                onPress={() => setDeleting(true)}
              >
                Eliminar acción
              </ActionButton>
            </>
          ) : (
            <div {...stylex.props(s.empty)}>
              <strong>Selecciona una acción</strong>
              <p>
                Haz clic en una curva o en una pulsación para ver sus detalles y
                ajustarla.
              </p>
            </div>
          )}
        </aside>
      </div>
      {deleting && selected ? (
        <ConfirmationDialog
          title="Eliminar acción del entrenamiento"
          confirmLabel="Eliminar acción"
          isConfirmDisabled={disabled}
          error={error}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const saved = await onUpdate(
              selected.points.map(({ id }) => ({ id, delete: true })),
              "Acción eliminada",
            )
            if (saved) setSelectedId(null)
            return saved
          }}
        >
          Se eliminará {selected.label} en {formatDuration(selected.start)}
          {selected.gesture ? ", con su curva completa" : ""}. Esta acción no se puede
          deshacer.
        </ConfirmationDialog>
      ) : null}
    </section>
  )
}
