import * as stylex from "@stylexjs/stylex"
import type { AutomationMode } from "../../../shared/automation-types"
import { InfoTooltip, StatusBadge } from "../ui-kit"
import { styles } from "./AutomationStudio.styles"
import { automationReadiness } from "./automation-readiness"
import type { AutomationStudioState } from "./types"

export function AutomationModeControls({
  automation,
  disabled,
}: {
  automation: AutomationStudioState
  disabled: boolean
}) {
  const { modeBlockReason, modelReady } = automationReadiness(
    automation.status,
    automation.audioRunning,
  )
  return (
    <div {...stylex.props(styles.modeSection)}>
      <div {...stylex.props(styles.modeRow)}>
        <div {...stylex.props(styles.labelWithHelp)}>
          <strong>3. Usa el modelo</strong>
          <StatusBadge tone={modelReady ? "success" : "neutral"}>
            {automation.status?.modelExampleCount ?? 0}{" "}
            {automation.status?.modelExampleCount === 1 ? "ejemplo" : "ejemplos"}
          </StatusBadge>
          <InfoTooltip
            label="Modos de automatización"
            content="Manual deja el control en tus manos. Asistido muestra sugerencias sin enviar MIDI. Auto ejecuta las sugerencias que cumplen las reglas de seguridad."
            detail="Empieza por Asistido para revisar lo aprendido antes de activar Auto."
          />
        </div>
        <div
          {...stylex.props(styles.modeGroup)}
          role="group"
          aria-label="Modo de automatización"
          aria-describedby="automation-mode-help"
        >
          {(["manual", "assist", "auto"] as AutomationMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              {...stylex.props(
                styles.modeButton,
                automation.status?.mode === mode && styles.modeButtonActive,
                mode === "auto" &&
                  automation.status?.mode === mode &&
                  styles.modeButtonAuto,
              )}
              disabled={disabled || (mode !== "manual" && modeBlockReason !== null)}
              aria-pressed={automation.status?.mode === mode}
              onClick={() => void automation.updateMode(mode)}
            >
              {automation.busy === "mode" && automation.status?.mode !== mode
                ? "…"
                : mode === "manual"
                  ? "Manual"
                  : mode === "assist"
                    ? "Asistido"
                    : "Auto"}
            </button>
          ))}
        </div>
      </div>
      <span id="automation-mode-help" {...stylex.props(styles.cardDetail)} role="status">
        {modeBlockReason && automation.status?.mode !== "manual" && automation.status
          ? `${automation.status.mode === "auto" ? "Auto" : "Asistido"} está en espera. `
          : ""}
        {modeBlockReason ??
          (automation.status?.mode === "auto"
            ? "Auto envía acciones MIDI. Puedes volver a Manual en cualquier momento."
            : automation.status?.mode === "assist"
              ? "Asistido muestra sugerencias; tú decides las acciones."
              : "Modelo listo. Prueba Asistido antes de activar Auto.")}
      </span>
    </div>
  )
}
