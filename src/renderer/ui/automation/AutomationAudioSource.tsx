import * as stylex from "@stylexjs/stylex"
import { useId } from "react"
import { ActionButton, InfoTooltip, StatusBadge } from "../ui-kit"
import { SYSTEM_AUDIO_DEVICE_ID } from "./useAutomationAudio"
import { automationReadiness } from "./automation-readiness"
import { styles } from "./AutomationStudio.styles"
import type { AutomationStudioState } from "./types"

export function AutomationAudioSource({
  automation,
  disabled,
}: {
  automation: AutomationStudioState
  disabled: boolean
}) {
  const id = useId()
  const { sourceReady } = automationReadiness(automation.status, automation.audioRunning)
  const recording = Boolean(automation.status?.recording)
  return (
    <div {...stylex.props(styles.audioSource)}>
      <div {...stylex.props(styles.cardHeading)}>
        <div {...stylex.props(styles.labelWithHelp)}>
          <label htmlFor={id}>
            <strong>1. Fuente de audio</strong>
          </label>
          <InfoTooltip
            label="Fuente de audio"
            content="Inicia el audio para comprobar la fuente o usar un modelo ya entrenado. No hace falta grabar otra sesión. Un CDJ reproduciendo música también puede aportar la señal para automatizar."
            detail="El audio del PC se captura desde la app de escritorio; las entradas USB o del mixer se eligen en esta lista."
          />
        </div>
        <StatusBadge tone={sourceReady ? "success" : "neutral"} dot>
          {automation.status?.waveformConnected
            ? "CDJ listo"
            : automation.audioRunning || automation.status?.audioConnected
              ? "Audio activo"
              : "Sin señal"}
        </StatusBadge>
      </div>
      <div {...stylex.props(styles.sourceControls)}>
        <select
          id={id}
          {...stylex.props(styles.select)}
          value={automation.selectedDeviceId}
          disabled={
            disabled || automation.audioRunning || automation.audioBusy || recording
          }
          onChange={(event) => automation.setSelectedDeviceId(event.target.value)}
        >
          <option value="">Entrada predeterminada</option>
          {window.rekordboxCapture ? (
            <option value={SYSTEM_AUDIO_DEVICE_ID}>Audio del PC (Rekordbox)</option>
          ) : null}
          {automation.selectedDeviceId &&
          !automation.audioDevices.some(
            (device) => device.deviceId === automation.selectedDeviceId,
          ) &&
          (automation.selectedDeviceId !== SYSTEM_AUDIO_DEVICE_ID ||
            !window.rekordboxCapture) ? (
            <option value={automation.selectedDeviceId}>
              Entrada guardada no disponible
            </option>
          ) : null}
          {automation.audioDevices
            .filter((device) => device.deviceId)
            .map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Entrada de audio ${index + 1}`}
              </option>
            ))}
        </select>
        <ActionButton
          variant="secondary"
          size="small"
          isDisabled={disabled || automation.audioBusy || recording}
          onPress={() =>
            void (automation.audioRunning
              ? automation.stopAudio()
              : automation.startAudio())
          }
        >
          {automation.audioBusy
            ? "Abriendo audio…"
            : automation.audioRunning
              ? "Detener audio"
              : "Iniciar audio"}
        </ActionButton>
        <ActionButton
          variant="ghost"
          size="small"
          isDisabled={disabled || automation.audioBusy || recording}
          onPress={() => void automation.refreshAudioDevices()}
        >
          Actualizar entradas
        </ActionButton>
      </div>
      {recording && !sourceReady ? (
        <span {...stylex.props(styles.sourceWarning)} role="alert">
          La grabación sigue abierta, pero no llega señal. Reconecta el audio o finaliza
          la sesión antes de cambiar de fuente.
        </span>
      ) : null}
      {recording && !automation.audioRunning && !automation.status?.waveformConnected ? (
        <ActionButton
          variant="secondary"
          size="small"
          isDisabled={disabled || automation.audioBusy}
          onPress={() => void automation.startAudio()}
        >
          Reconectar audio
        </ActionButton>
      ) : null}
    </div>
  )
}
