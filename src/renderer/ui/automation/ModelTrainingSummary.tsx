import * as stylex from "@stylexjs/stylex"
import type { AutomationStatus, MusicalPhase } from "../../../shared/automation-types"
import { MIN_TRAINING_EXAMPLES } from "../../../shared/automation-learning"
import { InfoTooltip, StatusBadge } from "../ui-kit"
import { styles } from "./AutomationStudio.styles"

const labels: Record<MusicalPhase, string> = {
  silence: "Silencio",
  steady: "Energía estable",
  build: "Subida de energía",
  drop: "Entrada de energía",
  break: "Bajada de energía",
}

export function ModelTrainingSummary({ status }: { status: AutomationStatus | null }) {
  const info = status?.modelInfo
  if (!info) return null
  const validation = info.validation
  const curves = validation?.sliderGestures
  return (
    <div {...stylex.props(styles.learningSummary)}>
      <div {...stylex.props(styles.labelWithHelp)}>
        <StatusBadge
          tone={info.temporalExampleCount >= MIN_TRAINING_EXAMPLES ? "info" : "neutral"}
        >
          {info.temporalExampleCount} ejemplos temporales · {info.sessionCount} sesiones
        </StatusBadge>
        {status?.musicalContext ? (
          <StatusBadge tone="neutral">{labels[status.musicalContext.phase]}</StatusBadge>
        ) : null}
        <InfoTooltip
          label="Aprendizaje del contexto musical"
          content="Aprende tus notas y faders a partir de la evolución de la energía y del ritmo. Los nombres y la posición de la canción no forman parte de la predicción. Graba varias canciones y usa Asistido para comprobar tus decisiones."
          detail="Las fases describen tendencias del audio; no garantizan anticipar cada drop."
        />
      </div>
      <span {...stylex.props(styles.cardDetail)}>
        {info.temporalExampleCount < MIN_TRAINING_EXAMPLES
          ? "Graba nuevas acciones con la música sonando para aprender contexto temporal. Las sesiones anteriores se conservan."
          : validation
            ? `Validación dejando fuera ${validation.heldOutSessions} sesiones · ${validation.testedExamples} notas evaluadas · cobertura de notas ${Math.round(validation.coverage * 100)} %${validation.noteAccuracy !== null ? ` · acierto de notas ${Math.round(validation.noteAccuracy * 100)} %` : ""}${validation.idleFalsePositiveRate !== null && validation.idleFalsePositiveRate !== undefined ? ` · disparos en momentos sin acción ${Math.round(validation.idleFalsePositiveRate * 100)} %` : ""}.`
            : "Graba otra canción en una sesión separada para evaluar el modelo con datos que no haya usado para entrenar."}
      </span>
      {info.sliderGestureCount !== undefined ? (
        <span {...stylex.props(styles.cardDetail)}>
          {info.sliderGestureCount} curvas disponibles ·{" "}
          {info.rejectedSliderGestureCount ?? 0} descartadas por falta de contexto
          musical.
        </span>
      ) : null}
      {info.controllersAwaitingSupport?.length ? (
        <span {...stylex.props(styles.cardDetail)}>
          CC {info.controllersAwaitingSupport.join(", ")} sin automatizar: necesitan
          movimientos claros parecidos en al menos dos sesiones distintas. Muchas muestras
          de una sola pasada no cuentan como varias demostraciones.
        </span>
      ) : null}
      {curves?.testedGestures ? (
        <span {...stylex.props(styles.cardDetail)}>
          Validación de curvas con el umbral y el intervalo de faders actuales ·{" "}
          {curves.testedGestures} movimientos · cobertura{" "}
          {Math.round(curves.coverage * 100)} %
          {curves.meanValueError !== null
            ? ` · error de recorrido ${curves.meanValueError.toFixed(1)}/127`
            : ""}
          {curves.meanDurationErrorMs !== null
            ? ` · diferencia de duración ${Math.round(curves.meanDurationErrorMs)} ms`
            : ""}
          . Se evalúan selección y emisión del movimiento; las pausas manuales y
          desconexiones se comprueban por separado.
        </span>
      ) : validation ? (
        <span {...stylex.props(styles.cardDetail)}>
          Sin curvas completas evaluables entre sesiones. Los CC aislados no cuentan como
          curvas validadas.
        </span>
      ) : null}
    </div>
  )
}
