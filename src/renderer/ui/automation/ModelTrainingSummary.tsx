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
            ? `Validación dejando fuera ${validation.heldOutSessions} sesiones · ${validation.testedExamples} ejemplos · cobertura ${Math.round(validation.coverage * 100)} %${validation.noteAccuracy !== null ? ` · acierto de notas ${Math.round(validation.noteAccuracy * 100)} %` : ""}${validation.controllerMeanError !== null ? ` · error de faders ${validation.controllerMeanError.toFixed(1)}/127` : ""}${validation.idleFalsePositiveRate !== null && validation.idleFalsePositiveRate !== undefined ? ` · disparos en momentos sin acción ${Math.round(validation.idleFalsePositiveRate * 100)} %` : ""}.`
            : "Graba otra canción en una sesión separada para evaluar el modelo con datos que no haya usado para entrenar."}
      </span>
    </div>
  )
}
