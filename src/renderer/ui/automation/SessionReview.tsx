import * as stylex from "@stylexjs/stylex"
import { useEffect, useId, useState } from "react"
import { AnimatedCollapse } from "../components/AnimatedDisclosure"
import { ActionButton } from "../ui-kit"
import { SliderCurveEditor } from "./SliderCurveEditor"
import { SpectrogramTimeline } from "./SpectrogramTimeline"
import { detectSliderGestures } from "./slider-curves"
import { styles } from "./AutomationStudio.styles"
import { formatDuration, formatCommand } from "./automation-format"
import type { AutomationStudioState } from "./types"

export function SessionReview({
  automation,
  controlsDisabled,
  analysisOpen,
  setAnalysisOpen,
}: {
  automation: AutomationStudioState
  controlsDisabled: boolean
  analysisOpen: boolean
  setAnalysisOpen: (value: boolean | ((previous: boolean) => boolean)) => void
}) {
  const status = automation.status
  const analysisPanelId = useId()
  useEffect(() => {
    if (!automation.selectedSessionId) return
    let frame = 0
    function focusWhenVisible() {
      const panel = document.getElementById("automation-session-review")
      if (!panel || panel.closest("[inert]")) {
        frame = requestAnimationFrame(focusWhenVisible)
        return
      }
      panel.focus({ preventScroll: true })
      panel.scrollIntoView({ block: "start" })
    }
    frame = requestAnimationFrame(focusWhenVisible)
    return () => cancelAnimationFrame(frame)
  }, [automation.selectedSessionId])

  const [editingSliderGestureId, setEditingSliderGestureId] = useState<string | null>(
    null,
  )

  const selectedSession = status?.sessions.find(
    (session) => session.id === automation.selectedSessionId,
  )

  const showSpectrogram = Boolean(
    status?.audioConnected ||
    automation.liveFrames.length > 0 ||
    automation.timeline.length > 0 ||
    automation.selectedSessionId,
  )

  const sliderGestures = detectSliderGestures(automation.timeline)

  const groupedSliderExamples = new Set(
    sliderGestures.flatMap((gesture) => gesture.points.map((point) => point.id)),
  )

  const standaloneExamples = automation.timeline.filter(
    (event) =>
      event.kind === "example" &&
      event.example &&
      !groupedSliderExamples.has(event.example.id),
  )

  const editingSliderGesture = sliderGestures.find(
    (gesture) => gesture.id === editingSliderGestureId,
  )

  async function removeSliderGesture(controller: number, pointIds: string[]) {
    if (
      !window.confirm(
        `¿Eliminar el movimiento completo del slider CC ${controller}? Se quitarán ${pointIds.length} puntos del modelo.`,
      )
    ) {
      return
    }
    await automation.updateTrainingExamples(
      pointIds.map((id) => ({ id, delete: true })),
      `Movimiento CC ${controller} eliminado`,
    )
  }
  return (
    <>
      {showSpectrogram && !automation.selectedSessionId ? (
        <div {...stylex.props(styles.analysisToggle)}>
          <button
            type="button"
            aria-expanded={analysisOpen}
            aria-controls={analysisPanelId}
            {...stylex.props(styles.analysisButton)}
            onClick={() => setAnalysisOpen((open) => !open)}
          >
            {analysisOpen ? "Ocultar detalles de audio" : "Ver detalles de audio"}
          </button>
        </div>
      ) : null}

      <AnimatedCollapse
        id={analysisPanelId}
        open={Boolean(showSpectrogram && (analysisOpen || automation.selectedSessionId))}
        unmountOnExit
      >
        <div
          id="automation-session-review"
          tabIndex={-1}
          {...stylex.props(styles.timelinePanel)}
        >
          <div {...stylex.props(styles.timelineHeading)}>
            <strong>
              {automation.selectedSessionId
                ? `Sesión: ${selectedSession?.name ?? "guardada"}`
                : "Audio en vivo"}
            </strong>
            {automation.selectedSessionId ? (
              <ActionButton
                variant="secondary"
                size="small"
                isDisabled={Boolean(automation.busy)}
                onPress={() => {
                  setEditingSliderGestureId(null)
                  automation.showLiveTimeline()
                }}
              >
                Volver al directo
              </ActionButton>
            ) : null}
          </div>
          {automation.selectedSessionId ? (
            <p {...stylex.props(styles.cardDetail)}>
              Arrastra los marcadores para ajustar tus acciones en la sesión.
            </p>
          ) : null}
          <SpectrogramTimeline
            key={automation.selectedSessionId ?? "live"}
            liveFrames={automation.selectedSessionId ? [] : automation.liveFrames}
            timeline={automation.timeline}
            editable={Boolean(automation.selectedSessionId)}
            busy={controlsDisabled}
            onMoveExample={(id, t) =>
              automation.updateTrainingExamples(
                [{ id, t }],
                `Acción movida a ${formatDuration(t)}`,
              )
            }
          />
        </div>

        {automation.timeline.some((event) => event.kind === "example") ? (
          <div {...stylex.props(styles.exampleEditor)}>
            <div {...stylex.props(styles.cardHeading)}>
              <strong>Ajustar ejemplos de la sesión</strong>
              <span {...stylex.props(styles.cardDetail)}>
                Arrastra acciones en la línea de tiempo o edita los sliders como curvas
              </span>
            </div>
            {sliderGestures.length ? (
              <div {...stylex.props(styles.sliderGestureList)}>
                {sliderGestures.map((gesture) => (
                  <div key={gesture.id} {...stylex.props(styles.sliderGestureRow)}>
                    <div {...stylex.props(styles.sliderGestureCopy)}>
                      <strong>Slider CC {gesture.controller}</strong>
                      <span {...stylex.props(styles.cardDetail)}>
                        {gesture.points.length} mensajes · {formatDuration(gesture.start)}
                        –{formatDuration(gesture.end)}
                      </span>
                    </div>
                    <div {...stylex.props(styles.sliderGestureActions)}>
                      <ActionButton
                        variant="secondary"
                        size="small"
                        {...stylex.props(styles.curveButton)}
                        isDisabled={controlsDisabled || Boolean(status?.recording)}
                        onPress={() => setEditingSliderGestureId(gesture.id)}
                      >
                        Editar curva
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        size="small"
                        {...stylex.props(styles.curveButton)}
                        isDisabled={controlsDisabled}
                        onPress={() =>
                          void removeSliderGesture(
                            gesture.controller,
                            gesture.points.map((point) => point.id),
                          )
                        }
                      >
                        Eliminar
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div {...stylex.props(styles.exampleList)}>
              {standaloneExamples
                .slice(-12)
                .reverse()
                .map((event) => (
                  <div key={event.example?.id} {...stylex.props(styles.exampleRow)}>
                    <span>{formatDuration(event.t)}</span>
                    <strong>{formatCommand(event.command)}</strong>
                    <small>
                      beat {event.beatWithinBar || "—"} · {event.bpm?.toFixed(1) || "—"}{" "}
                      BPM
                    </small>
                    <ActionButton
                      variant="danger"
                      size="small"
                      {...stylex.props(styles.excludeButton)}
                      isDisabled={controlsDisabled}
                      onPress={() =>
                        event.example && void automation.excludeExample(event.example.id)
                      }
                    >
                      Excluir
                    </ActionButton>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </AnimatedCollapse>

      {editingSliderGesture ? (
        <SliderCurveEditor
          gesture={editingSliderGesture}
          busy={controlsDisabled}
          onClose={() => setEditingSliderGestureId(null)}
          onSave={({ points, deletedIds }) =>
            automation.updateTrainingExamples(
              [
                ...points.map((point) => ({
                  id: point.id,
                  t: point.t,
                  value: point.value,
                  create: Boolean(point.isNew),
                  controller: point.isNew ? editingSliderGesture.controller : undefined,
                })),
                ...deletedIds.map((id) => ({ id, delete: true })),
              ],
              `Curva CC ${editingSliderGesture.controller} actualizada`,
            )
          }
        />
      ) : null}
    </>
  )
}
