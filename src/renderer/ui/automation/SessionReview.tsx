import * as stylex from "@stylexjs/stylex"
import { useEffect, useId, useState } from "react"
import { AnimatedCollapse } from "../components/AnimatedDisclosure"
import { ActionButton } from "../ui-kit"
import { SliderCurveEditor } from "./SliderCurveEditor"
import { SpectrogramTimeline } from "./SpectrogramTimeline"
import { TrainingSequenceEditor } from "./TrainingSequenceEditor"
import { detectSliderGestures } from "./slider-curves"
import { styles } from "./AutomationStudio.styles"
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  useEffect(() => {
    setEditingId(null)
    setDetailsOpen(false)
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

  const session = status?.sessions.find(
    (item) => item.id === automation.selectedSessionId,
  )
  const saved = Boolean(automation.selectedSessionId)
  const disabled = controlsDisabled || Boolean(status?.recording) || !saved
  const gesture = detectSliderGestures(automation.timeline).find(
    (item) => item.id === editingId,
  )
  const show = Boolean(
    status?.audioConnected ||
    status?.waveformConnected ||
    automation.liveFrames.length ||
    automation.timeline.length ||
    saved,
  )

  return (
    <>
      {show && !saved ? (
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
        open={Boolean(show && (analysisOpen || saved))}
        unmountOnExit
      >
        <div
          id="automation-session-review"
          tabIndex={-1}
          {...stylex.props(styles.timelinePanel)}
        >
          <div {...stylex.props(styles.timelineHeading)}>
            <strong>
              {saved
                ? `Revisar entrenamiento · ${session?.name ?? "Sesión guardada"}`
                : status?.waveformConnected
                  ? "Análisis CDJ por Ethernet"
                  : "Audio en vivo"}
            </strong>
            {saved ? (
              <ActionButton
                variant="secondary"
                size="small"
                isDisabled={Boolean(automation.busy)}
                onPress={() => automation.showLiveTimeline()}
              >
                Volver al directo
              </ActionButton>
            ) : null}
          </div>
          {saved ? (
            <>
              {status?.recording ? (
                <p {...stylex.props(styles.cardDetail)}>
                  Finaliza la grabación para editar las acciones de esta sesión.
                </p>
              ) : null}
              <TrainingSequenceEditor
                key={automation.selectedSessionId}
                timeline={automation.timeline}
                duration={session?.durationMs ?? 0}
                disabled={disabled}
                error={automation.error}
                onEditCurve={(item) => setEditingId(item.id)}
                onUpdate={(edits, message) =>
                  automation.updateTrainingExamples(edits, message)
                }
              />
              <details
                open={detailsOpen}
                onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
              >
                <summary {...stylex.props(styles.analysisButton)}>
                  Análisis de audio de referencia
                </summary>
                <p {...stylex.props(styles.cardDetail)}>
                  Estas bandas describen la música. Las curvas y pulsaciones que enseñaste
                  están en las pistas de arriba.
                </p>
                {detailsOpen ? (
                  <SpectrogramTimeline
                    timeline={automation.timeline}
                    liveFrames={[]}
                    editable={false}
                  />
                ) : null}
              </details>
            </>
          ) : (
            <SpectrogramTimeline
              liveFrames={automation.liveFrames}
              analysisInput={status?.analysisInput}
              timeline={automation.timeline}
              editable={false}
            />
          )}
        </div>
      </AnimatedCollapse>
      {gesture && saved ? (
        <SliderCurveEditor
          gesture={gesture}
          busy={disabled}
          onClose={() => setEditingId(null)}
          onSave={({ points, deletedIds }) =>
            automation.updateTrainingExamples(
              [
                ...points.map((point) => ({
                  id: point.id,
                  t: point.t,
                  value: point.value,
                  create: Boolean(point.isNew),
                  controller: point.isNew ? gesture.controller : undefined,
                })),
                ...deletedIds.map((id) => ({ id, delete: true })),
              ],
              `Curva CC ${gesture.controller} actualizada`,
            )
          }
        />
      ) : null}
    </>
  )
}
