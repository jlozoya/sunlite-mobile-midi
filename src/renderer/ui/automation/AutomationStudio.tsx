import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import type { AutomationSocketCommand } from "../../../shared/automation-types"
import { Toast } from "../components/Toast"
import { AnimatedDisclosure } from "../components/AnimatedDisclosure"
import { ActionButton, InfoTooltip, Notice, StatusBadge, Surface } from "../ui-kit"
import { DeckWaveforms } from "./DeckWaveforms"
import { RekordboxWaveforms } from "./RekordboxWaveforms"
import { SYSTEM_AUDIO_DEVICE_ID, useAutomationStudio } from "./useAutomationStudio"
import { styles } from "./AutomationStudio.styles"
import { formatDuration } from "./automation-format"
import { AutomationSettingsPanel } from "./AutomationSettingsPanel"
import { TrainingSessionsPanel } from "./TrainingSessionsPanel"
import { SessionReview } from "./SessionReview"
import { AutomationAudioSource } from "./AutomationAudioSource"
import { AutomationModeControls } from "./AutomationModeControls"
import { automationReadiness } from "./automation-readiness"

type Props = {
  sendAutomationCommand: (command: AutomationSocketCommand) => boolean
  captureVisible: boolean
  onShowController: () => void
}

export function AutomationStudio({
  sendAutomationCommand,
  captureVisible,
  onShowController,
}: Props) {
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const automation = useAutomationStudio(sendAutomationCommand, analysisOpen)
  const [sessionName, setSessionName] = useState("")
  const [startingTraining, setStartingTraining] = useState(false)

  const status = automation.status
  const controlsDisabled =
    !status || Boolean(automation.busy) || startingTraining || automation.audioBusy
  const latestBeat = status
    ? Object.values(status.latestBeats).sort((a, b) => b.receivedAt - a.receivedAt)[0]
    : null
  const connectedDecks = new Set(
    status?.devices.map((device) => device.deviceNumber) ?? [],
  )
  const waveforms = Object.values(status?.waveforms ?? {}).filter((waveform) =>
    connectedDecks.has(waveform.deviceNumber),
  )
  const { sourceReady } = automationReadiness(status, automation.audioRunning)
  const usesPcAudio =
    automation.selectedDeviceId === SYSTEM_AUDIO_DEVICE_ID ||
    (!automation.selectedDeviceId && Boolean(window.rekordboxCapture))
  const trainingDescription = status?.recording
    ? `${status.activeSession?.name ?? "Grabando sesión"} · ${formatDuration(status.activeSession?.durationMs ?? 0)} · usa los botones y sliders de Controlador`
    : sourceReady
      ? status?.waveformConnected
        ? "Usa el Controlador; tus acciones se guardarán con la música y el beat del CDJ."
        : "Usa el Controlador; tus acciones se guardarán con el audio que está sonando."
      : usesPcAudio
        ? "Al empezar se capturará el audio de este PC; después usa los controles de luces para enseñarle."
        : "Al empezar se abrirá la entrada de audio; después usa los controles de luces para enseñarle."

  async function beginTraining() {
    if (!status || startingTraining || automation.busy || automation.audioBusy) return
    setStartingTraining(true)
    try {
      if (status.mode !== "manual" && !(await automation.updateMode("manual"))) return
      if (!status.waveformConnected && (!sourceReady || !automation.audioRunning)) {
        const deviceId =
          automation.selectedDeviceId ||
          (window.rekordboxCapture ? SYSTEM_AUDIO_DEVICE_ID : "")
        if (!(await automation.startAudio(deviceId))) return
      }
      const startedAt = new Date()
      const defaultName = `Sesión ${startedAt.toLocaleDateString()} ${startedAt.toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        },
      )}`
      if (await automation.startSession(sessionName.trim() || defaultName))
        setSessionName("")
    } finally {
      setStartingTraining(false)
    }
  }

  return (
    <section {...stylex.props(styles.studio)}>
      <div {...stylex.props(styles.headingRow)}>
        <div>
          <div {...stylex.props(styles.labelWithHelp)}>
            <h2 {...stylex.props(styles.title)}>Entrenamiento y automatización</h2>
            <InfoTooltip
              label="Entrenamiento y automatización"
              content="Prepara una fuente de audio, graba tus acciones desde Controlador y finaliza la sesión para entrenar el modelo. Después prueba sus sugerencias en Asistido y activa Auto cuando estés listo."
            />
          </div>
        </div>
      </div>

      {automation.statusLoading || automation.statusError ? (
        <div
          {...stylex.props(styles.statusNotice)}
          role={automation.statusError ? "alert" : "status"}
        >
          <span>
            {automation.statusError
              ? `No se pudo actualizar Automation Studio. ${automation.statusError}`
              : "Cargando Automation Studio…"}
          </span>
          {automation.statusError ? (
            <ActionButton
              variant="secondary"
              size="small"
              onPress={() => void automation.refreshStatus()}
            >
              Reintentar
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {automation.error ? (
        <Notice tone="danger" role="alert" layout="stack">
          <strong>No se pudo completar la acción</strong>
          {automation.error}
        </Notice>
      ) : null}
      <AutomationAudioSource automation={automation} disabled={controlsDisabled} />

      <div {...stylex.props(styles.recordingBar)}>
        <div {...stylex.props(styles.recordingCopy)}>
          <div {...stylex.props(styles.labelWithHelp)}>
            <strong>2. Graba una sesión</strong>
            <InfoTooltip
              label="Grabar una sesión"
              content="Al empezar, la aplicación vuelve a Manual y prepara el audio si hace falta. Usa los botones y faders de Controlador para guardar ejemplos; Finalizar y aprender guarda la sesión y entrena el modelo."
            />
            {status?.recording ? (
              <StatusBadge tone="danger" dot>
                Grabando
              </StatusBadge>
            ) : null}
          </div>
          <span {...stylex.props(styles.cardDetail)}>{trainingDescription}</span>
        </div>
        <div {...stylex.props(styles.trainingControls)}>
          {status?.recording ? (
            <>
              <ActionButton variant="secondary" size="small" onPress={onShowController}>
                Ir al Controlador
              </ActionButton>
              <ActionButton
                variant="danger"
                isDisabled={controlsDisabled}
                onPress={() => void automation.stopSession()}
              >
                {automation.busy === "session"
                  ? "Guardando sesión…"
                  : "Finalizar y aprender"}
              </ActionButton>
            </>
          ) : (
            <ActionButton
              tone="cyan"
              isDisabled={controlsDisabled || automation.audioBusy}
              onPress={() => void beginTraining()}
            >
              {startingTraining || automation.audioBusy
                ? "Preparando audio…"
                : "Empezar entrenamiento"}
            </ActionButton>
          )}
        </div>
      </div>

      <Surface
        as="article"
        variant="subtle"
        padding="custom"
        {...stylex.props(styles.subPanel, styles.setupDetails)}
      >
        <AnimatedDisclosure
          summary="Opciones de entrenamiento"
          buttonProps={stylex.props(styles.disclosureTrigger, styles.setupSummary)}
        >
          <div {...stylex.props(styles.setupContent)}>
            <label {...stylex.props(styles.setupField)}>
              <span>Nombre de sesión (opcional)</span>
              <input
                {...stylex.props(styles.input)}
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="Se asigna uno automáticamente"
                maxLength={80}
                disabled={controlsDisabled || Boolean(status?.recording)}
              />
            </label>
            {status?.devices.length ? (
              <div {...stylex.props(styles.setupCdj)}>
                <span>
                  {status.devices.length} CDJ conectados
                  {latestBeat ? ` · ${latestBeat.bpm.toFixed(1)} BPM` : ""}
                </span>
                <ActionButton
                  variant="secondary"
                  size="small"
                  isDisabled={controlsDisabled}
                  onPress={() => void automation.restartBridge()}
                >
                  Reconectar CDJ
                </ActionButton>
              </div>
            ) : null}
            {status?.sessions.length ? (
              <ActionButton
                variant="secondary"
                size="small"
                isDisabled={controlsDisabled || Boolean(status?.recording)}
                onPress={() => void automation.train()}
              >
                {automation.busy === "train" ? "Entrenando…" : "Reentrenar modelo"}
              </ActionButton>
            ) : null}
          </div>
        </AnimatedDisclosure>
      </Surface>

      <AutomationModeControls automation={automation} disabled={controlsDisabled} />
      {status?.mode === "auto" && status.manualOverrideUntil ? (
        <Notice tone="info" role="status">
          Pausa por control manual · Auto volverá a actuar en{" "}
          {Math.max(1, Math.ceil((status.manualOverrideUntil - Date.now()) / 1000))} s si
          la señal sigue disponible.
        </Notice>
      ) : null}

      {!status?.devices.length ? (
        <AnimatedDisclosure
          summary="Conectar CDJ (opcional)"
          containerProps={stylex.props(styles.cdjDetails)}
          buttonProps={stylex.props(
            styles.disclosureTrigger,
            styles.disclosureTriggerCompact,
            styles.cdjSummary,
          )}
          indicatorPosition="start"
        >
          <div {...stylex.props(styles.cdjContent)}>
            <p {...stylex.props(styles.cardDetail)}>
              {status?.bridge.message ?? "Conecta tus CDJ a la misma red que este PC."}
            </p>
            <ActionButton
              variant="secondary"
              size="small"
              isDisabled={controlsDisabled}
              onPress={() => void automation.restartBridge()}
            >
              Reintentar conexión CDJ
            </ActionButton>
          </div>
        </AnimatedDisclosure>
      ) : null}

      {status?.devices.length ? (
        <DeckWaveforms waveforms={waveforms} />
      ) : (
        <RekordboxWaveforms enabled={captureVisible} />
      )}

      <SessionReview
        automation={automation}
        controlsDisabled={controlsDisabled}
        analysisOpen={analysisOpen}
        setAnalysisOpen={setAnalysisOpen}
      />

      {status?.lastSuggestion ? (
        <div {...stylex.props(styles.suggestion)}>
          <div>
            <span {...stylex.props(styles.cardDetail)}>Última decisión</span>
            <strong>{status.lastSuggestion.reason}</strong>
          </div>
          <div {...stylex.props(styles.suggestionResult)}>
            <strong>{Math.round(status.lastSuggestion.confidence * 100)}%</strong>
            <span>
              {status.lastSuggestion.executed
                ? "Ejecutada"
                : (status.lastSuggestion.blockedReason ?? "Sólo sugerencia")}
            </span>
          </div>
        </div>
      ) : null}

      <div {...stylex.props(styles.lowerGrid)}>
        <TrainingSessionsPanel
          automation={automation}
          controlsDisabled={controlsDisabled}
        />

        <AutomationSettingsPanel
          automation={automation}
          controlsDisabled={controlsDisabled}
        />
      </div>

      {automation.message ? (
        <Toast message={automation.message} onDismiss={automation.clearMessage} />
      ) : null}
    </section>
  )
}
