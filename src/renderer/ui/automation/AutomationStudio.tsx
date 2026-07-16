import * as stylex from "@stylexjs/stylex"
import { useEffect, useState } from "react"
import type {
  AutomationMidiCommand,
  AutomationMode,
  AutomationSettings,
  AutomationSocketCommand,
} from "../../../shared/automation-types"
import { Toast } from "../components/Toast"
import { DeckWaveforms } from "./DeckWaveforms"
import { SliderCurveEditor } from "./SliderCurveEditor"
import { SpectrogramTimeline } from "./SpectrogramTimeline"
import { detectSliderGestures } from "./slider-curves"
import { useAutomationStudio } from "./useAutomationStudio"

type Props = {
  sendAutomationCommand: (command: AutomationSocketCommand) => boolean
}

function parseMidiList(value: string): number[] {
  return [
    ...new Set(
      value
        .split(",")
        .map(Number)
        .filter((item) => Number.isFinite(item)),
    ),
  ].map((item) => Math.max(0, Math.min(127, Math.round(item))))
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = Math.floor((milliseconds % 60000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatCommand(command: AutomationMidiCommand | undefined): string {
  if (!command) return "Acción MIDI"
  if (command.type === "note" || command.type === "noteon") return `Nota ${command.note}`
  if (command.type === "noteoff") return `Nota ${command.note} off`
  if (command.type === "cc") return `CC ${command.controller} = ${command.value}`
  return `Programa ${command.number}`
}

export function AutomationStudio({ sendAutomationCommand }: Props) {
  const automation = useAutomationStudio(sendAutomationCommand)
  const [sessionName, setSessionName] = useState("")
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [sessionNameDraft, setSessionNameDraft] = useState("")
  const [editingSliderGestureId, setEditingSliderGestureId] = useState<string | null>(
    null,
  )
  const [settingsDraft, setSettingsDraft] = useState<AutomationSettings | null>(null)
  const [settingsDirty, setSettingsDirty] = useState(false)

  useEffect(() => {
    if (automation.status && !settingsDirty) {
      setSettingsDraft(automation.status.settings)
    }
  }, [automation.status, settingsDirty])

  const status = automation.status
  const settings = settingsDraft ?? status?.settings ?? null
  const latestBeat = status
    ? Object.values(status.latestBeats).sort((a, b) => b.receivedAt - a.receivedAt)[0]
    : null
  const waveforms = Object.values(status?.waveforms ?? {})
  const sourceReady = Boolean(status?.audioConnected || status?.waveformConnected)
  const sourceLabel = status?.waveformConnected
    ? status.audioConnected
      ? "Waveform + audio listos"
      : "Waveform listo"
    : status?.audioConnected
      ? "Audio listo"
      : "Sin fuente"
  const trainingDescription = status?.recording
    ? `${formatDuration(status.activeSession?.durationMs ?? 0)} · usa los botones y sliders de Controlador`
    : sourceReady
      ? "Usa los botones y sliders de Controlador; cada acción se asociará con la música y el beat actual."
      : "Carga un track analizado en un CDJ o activa la entrada de audio."
  const showSpectrogram = Boolean(
    status?.audioConnected ||
    automation.liveFrames.length > 0 ||
    automation.timeline.length > 0,
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

  function setSetting<K extends keyof AutomationSettings>(
    key: K,
    value: AutomationSettings[K],
  ) {
    if (!settings) return
    setSettingsDraft({ ...settings, [key]: value })
    setSettingsDirty(true)
  }

  async function saveSettings() {
    if (!settingsDraft) return
    await automation.updateSettings(settingsDraft)
    setSettingsDirty(false)
  }

  async function saveSessionName(id: string) {
    if (!sessionNameDraft.trim()) return
    if (await automation.renameSession(id, sessionNameDraft)) {
      setEditingSessionId(null)
      setSessionNameDraft("")
    }
  }

  async function removeSession(id: string, name: string) {
    if (
      !window.confirm(`¿Eliminar "${name}"? Sus ejemplos también se quitarán del modelo.`)
    ) {
      return
    }
    if (await automation.deleteSession(id)) {
      setEditingSessionId(null)
      setSessionNameDraft("")
    }
  }

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
    <section {...stylex.props(styles.studio)}>
      <div {...stylex.props(styles.headingRow)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>Automation Studio</p>
          <h2 {...stylex.props(styles.title)}>Entrenamiento y control automático</h2>
          <p {...stylex.props(styles.description)}>
            Usa el waveform recibido de los CDJ o el audio del mixer, aprende tus acciones
            MIDI y sincroniza los cambios con cada compás.
          </p>
        </div>
        <div {...stylex.props(styles.modeGroup)}>
          {(["manual", "assist", "auto"] as AutomationMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              {...stylex.props(
                styles.modeButton,
                status?.mode === mode && styles.modeButtonActive,
                mode === "auto" && status?.mode === mode && styles.modeButtonAuto,
              )}
              disabled={automation.busy === "mode"}
              onClick={() => void automation.updateMode(mode)}
            >
              {mode === "manual" ? "Manual" : mode === "assist" ? "Asistido" : "Auto"}
            </button>
          ))}
        </div>
      </div>

      <div {...stylex.props(styles.statusGrid)}>
        <article {...stylex.props(styles.statusCard)}>
          <div {...stylex.props(styles.cardHeading)}>
            <span {...stylex.props(styles.cardIcon)}>AUDIO</span>
            <strong>Entrada del mixer</strong>
          </div>
          <select
            {...stylex.props(styles.select)}
            value={automation.selectedDeviceId}
            onChange={(event) => automation.setSelectedDeviceId(event.target.value)}
            disabled={automation.audioRunning}
          >
            {automation.audioDevices.length ? (
              automation.audioDevices.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `Entrada de audio ${index + 1}`}
                </option>
              ))
            ) : (
              <option value="">Entrada predeterminada</option>
            )}
          </select>
          <button
            type="button"
            {...stylex.props(styles.primaryButton)}
            disabled={automation.busy === "audio"}
            onClick={() =>
              automation.audioRunning
                ? automation.stopAudio()
                : void automation.startAudio()
            }
          >
            {automation.audioRunning ? "Detener audio" : "Activar audio"}
          </button>
          <span {...stylex.props(styles.cardDetail)}>
            {status?.audioConnected
              ? "Señal recibida y analizada localmente"
              : status?.waveformConnected
                ? "Opcional: el waveform PRO DJ LINK ya puede entrenar el modelo"
                : "Selecciona el USB/REC OUT del mixer"}
          </span>
        </article>

        <article {...stylex.props(styles.statusCard)}>
          <div {...stylex.props(styles.cardHeading)}>
            <span {...stylex.props(styles.cardIcon)}>LINK</span>
            <strong>PRO DJ LINK</strong>
          </div>
          <div {...stylex.props(styles.metric)}>
            <span>{status?.devices.length ?? 0} decks</span>
            <strong>
              {latestBeat ? `${latestBeat.bpm.toFixed(1)} BPM` : "Sin beat"}
            </strong>
          </div>
          <button
            type="button"
            {...stylex.props(styles.secondaryButton)}
            disabled={automation.busy === "bridge"}
            onClick={() => void automation.restartBridge()}
          >
            Reiniciar listener
          </button>
          <span {...stylex.props(styles.cardDetail)}>
            {status?.bridge.message ?? "Buscando los CDJ en la red Ethernet"}
          </span>
        </article>

        <article {...stylex.props(styles.statusCard)}>
          <div {...stylex.props(styles.cardHeading)}>
            <span {...stylex.props(styles.cardIcon)}>AI</span>
            <strong>Modelo local</strong>
          </div>
          <div {...stylex.props(styles.metric)}>
            <span>Ejemplos</span>
            <strong>{status?.modelExampleCount ?? 0}</strong>
          </div>
          <button
            type="button"
            {...stylex.props(styles.secondaryButton)}
            disabled={automation.busy === "train"}
            onClick={() => void automation.train()}
          >
            Reentrenar ahora
          </button>
          <span {...stylex.props(styles.cardDetail)}>
            Se actualiza automáticamente al terminar cada sesión
          </span>
        </article>
      </div>

      <DeckWaveforms waveforms={waveforms} />

      <div
        {...stylex.props(
          styles.recordingBar,
          status?.recording && styles.recordingActive,
        )}
      >
        <div {...stylex.props(styles.recordingCopy)}>
          <span
            {...stylex.props(
              styles.recordingDot,
              sourceReady && styles.sourceReadyDot,
              status?.recording && styles.recordingActiveDot,
            )}
          />
          <div {...stylex.props(styles.recordingText)}>
            <strong>
              {status?.recording
                ? (status.activeSession?.name ?? "Grabando sesión")
                : sourceReady
                  ? "Enséñale cómo controlas las luces"
                  : "Primero conecta una fuente musical"}
            </strong>
            <span>{trainingDescription}</span>
          </div>
        </div>
        {status?.recording ? (
          <button
            type="button"
            {...stylex.props(styles.stopButton)}
            disabled={automation.busy === "session"}
            onClick={() => void automation.stopSession()}
          >
            Finalizar y aprender
          </button>
        ) : (
          <div {...stylex.props(styles.trainingControls)}>
            <span
              {...stylex.props(
                styles.sourceBadge,
                sourceReady && styles.sourceBadgeReady,
              )}
            >
              {sourceLabel}
            </span>
            <input
              {...stylex.props(styles.input)}
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              placeholder="Nombre (opcional)"
              disabled={!sourceReady}
            />
            <button
              type="button"
              {...stylex.props(
                styles.primaryButton,
                !sourceReady && styles.disabledButton,
              )}
              disabled={automation.busy === "session" || !sourceReady}
              onClick={() =>
                void automation.startSession(
                  sessionName || `Sesión ${new Date().toLocaleDateString()}`,
                )
              }
            >
              Empezar entrenamiento
            </button>
          </div>
        )}
      </div>

      {showSpectrogram ? (
        <div {...stylex.props(styles.timelinePanel)}>
          <div {...stylex.props(styles.legend)}>
            <span>Espectrograma del mixer</span>
            <span {...stylex.props(styles.manualLegend)}>Notas editables</span>
            <span {...stylex.props(styles.sliderLegend)}>Curvas de sliders</span>
            <span {...stylex.props(styles.autoLegend)}>MIDI automático</span>
            <span>líneas blancas: beats/compases</span>
          </div>
          <SpectrogramTimeline
            liveFrames={automation.liveFrames}
            timeline={automation.timeline}
            editable={Boolean(automation.selectedSessionId)}
            busy={automation.busy === "edit-examples"}
            onMoveExample={(id, t) =>
              automation.updateTrainingExamples(
                [{ id, t }],
                `Acción movida a ${formatDuration(t)}`,
              )
            }
          />
        </div>
      ) : null}

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
                      {gesture.points.length} mensajes · {formatDuration(gesture.start)}–
                      {formatDuration(gesture.end)}
                    </span>
                  </div>
                  <div {...stylex.props(styles.sliderGestureActions)}>
                    <button
                      type="button"
                      {...stylex.props(styles.curveButton)}
                      onClick={() => setEditingSliderGestureId(gesture.id)}
                    >
                      Editar curva
                    </button>
                    <button
                      type="button"
                      {...stylex.props(styles.curveButton, styles.deleteCurveButton)}
                      disabled={automation.busy === "edit-examples"}
                      onClick={() =>
                        void removeSliderGesture(
                          gesture.controller,
                          gesture.points.map((point) => point.id),
                        )
                      }
                    >
                      Eliminar
                    </button>
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
                    beat {event.beatWithinBar || "—"} · {event.bpm?.toFixed(1) || "—"} BPM
                  </small>
                  <button
                    type="button"
                    {...stylex.props(styles.excludeButton)}
                    disabled={automation.busy === `exclude-${event.example?.id}`}
                    onClick={() =>
                      event.example && void automation.excludeExample(event.example.id)
                    }
                  >
                    Excluir
                  </button>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {editingSliderGesture ? (
        <SliderCurveEditor
          gesture={editingSliderGesture}
          busy={automation.busy === "edit-examples"}
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
        <article {...stylex.props(styles.subPanel)}>
          <div {...stylex.props(styles.cardHeading)}>
            <strong>Sesiones guardadas</strong>
            <span {...stylex.props(styles.cardDetail)}>
              {status?.sessions.length ?? 0} sesiones
            </span>
          </div>
          <div {...stylex.props(styles.sessionList)}>
            {status?.sessions.map((session) => {
              const isEditing = editingSessionId === session.id
              const isSelected = automation.selectedSessionId === session.id

              return (
                <div
                  key={session.id}
                  {...stylex.props(
                    styles.sessionRow,
                    isSelected && styles.sessionRowActive,
                  )}
                >
                  {isEditing ? (
                    <div {...stylex.props(styles.sessionEdit)}>
                      <input
                        autoFocus
                        {...stylex.props(styles.input, styles.sessionNameInput)}
                        value={sessionNameDraft}
                        maxLength={80}
                        onChange={(event) => setSessionNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveSessionName(session.id)
                          if (event.key === "Escape") setEditingSessionId(null)
                        }}
                        aria-label="Nombre de la sesión"
                      />
                      <button
                        type="button"
                        {...stylex.props(styles.sessionActionButton)}
                        disabled={
                          !sessionNameDraft.trim() ||
                          automation.busy === `rename-${session.id}`
                        }
                        onClick={() => void saveSessionName(session.id)}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        {...stylex.props(styles.sessionActionButton)}
                        onClick={() => setEditingSessionId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        {...stylex.props(styles.sessionButton)}
                        onClick={() => void automation.loadSession(session.id)}
                      >
                        <span>{session.name}</span>
                        <small>
                          {formatDuration(session.durationMs)} ·{" "}
                          {session.trainingExampleCount} ejemplos
                        </small>
                      </button>
                      <div {...stylex.props(styles.sessionActions)}>
                        <button
                          type="button"
                          {...stylex.props(styles.sessionActionButton)}
                          onClick={() => {
                            setEditingSessionId(session.id)
                            setSessionNameDraft(session.name)
                          }}
                        >
                          Renombrar
                        </button>
                        <button
                          type="button"
                          {...stylex.props(
                            styles.sessionActionButton,
                            styles.sessionDeleteButton,
                          )}
                          disabled={automation.busy === `delete-${session.id}`}
                          onClick={() => void removeSession(session.id, session.name)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            {!status?.sessions.length ? (
              <span {...stylex.props(styles.emptyText)}>
                Aún no hay sesiones grabadas.
              </span>
            ) : null}
          </div>
        </article>

        <article {...stylex.props(styles.subPanel)}>
          <div {...stylex.props(styles.cardHeading)}>
            <strong>Reglas de seguridad</strong>
            <span {...stylex.props(styles.cardDetail)}>
              Se aplican antes de enviar MIDI
            </span>
          </div>
          {settings ? (
            <div {...stylex.props(styles.settingsGrid)}>
              <label {...stylex.props(styles.field)}>
                Confianza mínima
                <input
                  type="number"
                  min="25"
                  max="98"
                  {...stylex.props(styles.input)}
                  value={Math.round(settings.confidenceThreshold * 100)}
                  onChange={(event) =>
                    setSetting("confidenceThreshold", Number(event.target.value) / 100)
                  }
                />
              </label>
              <label {...stylex.props(styles.field)}>
                Intervalo mínimo (ms)
                <input
                  type="number"
                  min="250"
                  {...stylex.props(styles.input)}
                  value={settings.minActionIntervalMs}
                  onChange={(event) =>
                    setSetting("minActionIntervalMs", Number(event.target.value))
                  }
                />
              </label>
              <label {...stylex.props(styles.field)}>
                Notas protegidas
                <input
                  {...stylex.props(styles.input)}
                  value={settings.blockedNotes.join(",")}
                  onChange={(event) =>
                    setSetting("blockedNotes", parseMidiList(event.target.value))
                  }
                />
              </label>
              <label {...stylex.props(styles.field)}>
                Notas strobe
                <input
                  {...stylex.props(styles.input)}
                  value={settings.strobeNotes.join(",")}
                  onChange={(event) =>
                    setSetting("strobeNotes", parseMidiList(event.target.value))
                  }
                />
              </label>
              <label {...stylex.props(styles.field)}>
                Deck preferido
                <select
                  {...stylex.props(styles.select)}
                  value={settings.preferredDeck ?? ""}
                  onChange={(event) =>
                    setSetting(
                      "preferredDeck",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Automático</option>
                  {[1, 2, 3, 4, 5, 6].map((deck) => (
                    <option key={deck} value={deck}>
                      Deck {deck}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                {...stylex.props(styles.primaryButton, styles.saveButton)}
                disabled={!settingsDirty || automation.busy === "settings"}
                onClick={() => void saveSettings()}
              >
                Guardar reglas
              </button>
            </div>
          ) : null}
        </article>
      </div>

      {automation.message ? (
        <Toast message={automation.message} onDismiss={automation.clearMessage} />
      ) : null}
    </section>
  )
}

const styles = stylex.create({
  studio: {
    marginTop: "16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34, 211, 238, 0.2)",
    borderRadius: "24px",
    backgroundColor: "rgba(11, 17, 31, 0.94)",
    boxShadow: "0 22px 70px rgba(0, 0, 0, 0.34)",
    padding: "18px",
  },
  headingRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: "0 0 5px",
    color: "#22d3ee",
    fontSize: "0.72rem",
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: { margin: 0, fontSize: "1.35rem" },
  description: {
    maxWidth: "720px",
    margin: "7px 0 0",
    color: "#94a3b8",
    lineHeight: 1.5,
    fontSize: "0.88rem",
  },
  modeGroup: {
    display: "flex",
    borderRadius: "14px",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: "4px",
  },
  modeButton: {
    display: "inline-grid",
    placeItems: "center",
    minHeight: "38px",
    boxSizing: "border-box",
    borderWidth: 0,
    borderRadius: "10px",
    backgroundColor: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontWeight: 800,
    padding: "9px 13px",
  },
  modeButtonActive: { backgroundColor: "#334155", color: "#fff" },
  modeButtonAuto: { backgroundColor: "#0891b2" },
  statusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "12px",
    marginTop: "16px",
  },
  statusCard: {
    display: "grid",
    gap: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: "18px",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: "14px",
  },
  cardHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  cardIcon: {
    marginRight: "auto",
    borderRadius: "7px",
    backgroundColor: "rgba(34,211,238,0.12)",
    color: "#67e8f9",
    fontSize: "0.64rem",
    fontWeight: 900,
    padding: "5px 7px",
  },
  cardDetail: { color: "#94a3b8", fontSize: "0.74rem", lineHeight: 1.4 },
  metric: { display: "flex", justifyContent: "space-between", color: "#cbd5e1" },
  select: {
    width: "100%",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: "10px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    padding: "9px 10px",
  },
  input: {
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: "10px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    padding: "9px 10px",
  },
  primaryButton: {
    display: "inline-grid",
    placeItems: "center",
    minHeight: "38px",
    boxSizing: "border-box",
    borderWidth: 0,
    borderRadius: "11px",
    backgroundColor: "#0891b2",
    color: "white",
    cursor: "pointer",
    fontWeight: 850,
    padding: "10px 13px",
  },
  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  secondaryButton: {
    display: "inline-grid",
    placeItems: "center",
    minHeight: "38px",
    boxSizing: "border-box",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34,211,238,0.35)",
    borderRadius: "11px",
    backgroundColor: "rgba(34,211,238,0.06)",
    color: "#a5f3fc",
    cursor: "pointer",
    fontWeight: 800,
    padding: "9px 12px",
  },
  recordingBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    flexWrap: "wrap",
    marginTop: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: "18px",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: "13px",
  },
  recordingActive: {
    borderColor: "rgba(248,113,113,0.38)",
    backgroundColor: "rgba(127,29,29,0.16)",
  },
  recordingCopy: { display: "flex", alignItems: "center", gap: "11px" },
  recordingText: {
    display: "grid",
    gap: "3px",
  },
  recordingDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#475569",
    boxShadow: "none",
  },
  sourceReadyDot: {
    backgroundColor: "#22d3ee",
    boxShadow: "0 0 14px rgba(34,211,238,0.72)",
  },
  recordingActiveDot: {
    backgroundColor: "#ef4444",
    boxShadow: "0 0 16px rgba(239,68,68,0.8)",
  },
  trainingControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    flexWrap: "wrap",
  },
  sourceBadge: {
    borderRadius: "999px",
    backgroundColor: "rgba(71, 85, 105, 0.16)",
    color: "#94a3b8",
    padding: "7px 10px",
    fontSize: "0.72rem",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  sourceBadgeReady: {
    backgroundColor: "rgba(34, 211, 238, 0.12)",
    color: "#a5f3fc",
  },
  stopButton: {
    display: "inline-grid",
    placeItems: "center",
    minHeight: "38px",
    boxSizing: "border-box",
    borderWidth: 0,
    borderRadius: "11px",
    backgroundColor: "#dc2626",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 850,
    padding: "10px 14px",
  },
  timelinePanel: {
    marginTop: "12px",
    borderRadius: "18px",
    backgroundColor: "#070a12",
    padding: "10px",
  },
  legend: {
    display: "flex",
    gap: "14px",
    flexWrap: "wrap",
    padding: "2px 4px 9px",
    color: "#64748b",
    fontSize: "0.72rem",
  },
  manualLegend: { color: "#f59e0b" },
  sliderLegend: { color: "#a78bfa" },
  autoLegend: { color: "#22d3ee" },
  suggestion: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    marginTop: "12px",
    borderRadius: "15px",
    backgroundColor: "rgba(139,92,246,0.1)",
    padding: "12px 14px",
  },
  exampleEditor: {
    marginTop: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(245,158,11,0.18)",
    borderRadius: "15px",
    backgroundColor: "rgba(245,158,11,0.035)",
    padding: "12px",
  },
  exampleList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "7px",
    marginTop: "10px",
  },
  sliderGestureList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "7px",
    marginTop: "10px",
  },
  sliderGestureRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    borderRadius: "11px",
    backgroundColor: "rgba(139,92,246,0.1)",
    color: "#ddd6fe",
    padding: "9px 10px",
  },
  sliderGestureCopy: {
    display: "grid",
    gap: "5px",
    minWidth: 0,
  },
  sliderGestureActions: {
    display: "flex",
    gap: "7px",
    flexShrink: 0,
  },
  curveButton: {
    flexShrink: 0,
    display: "inline-grid",
    placeItems: "center",
    width: "112px",
    minHeight: "38px",
    boxSizing: "border-box",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(167,139,250,0.35)",
    borderRadius: "9px",
    backgroundColor: "rgba(139,92,246,0.1)",
    color: "#ddd6fe",
    cursor: "pointer",
    fontWeight: 800,
    padding: "7px 10px",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  deleteCurveButton: {
    borderColor: "rgba(248,113,113,0.35)",
    backgroundColor: "rgba(127,29,29,0.12)",
    color: "#fca5a5",
  },
  exampleRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: "4px 9px",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#cbd5e1",
    padding: "8px",
  },
  excludeButton: {
    gridColumn: "3",
    gridRow: "1 / span 2",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(248,113,113,0.35)",
    borderRadius: "8px",
    backgroundColor: "rgba(127,29,29,0.15)",
    color: "#fca5a5",
    cursor: "pointer",
    width: "68px",
    minHeight: "32px",
    boxSizing: "border-box",
    padding: "6px 8px",
  },
  suggestionResult: { display: "grid", justifyItems: "end", color: "#c4b5fd" },
  lowerGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 960px)": "0.8fr 1.2fr",
    },
    gap: "12px",
    marginTop: "12px",
  },
  subPanel: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: "17px",
    backgroundColor: "rgba(255,255,255,0.025)",
    padding: "13px",
  },
  sessionList: {
    display: "grid",
    gap: "6px",
    maxHeight: "360px",
    marginTop: "10px",
    overflowY: "auto",
  },
  sessionRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "6px",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: "4px",
  },
  sessionRowActive: {
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  sessionButton: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    minWidth: 0,
    borderWidth: 0,
    borderRadius: "8px",
    backgroundColor: "transparent",
    color: "#cbd5e1",
    cursor: "pointer",
    padding: "7px 8px",
    textAlign: "left",
  },
  sessionActions: {
    display: "flex",
    gap: "4px",
  },
  sessionActionButton: {
    display: "inline-grid",
    placeItems: "center",
    width: "82px",
    minHeight: "32px",
    boxSizing: "border-box",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: "8px",
    backgroundColor: "rgba(255,255,255,0.035)",
    color: "#cbd5e1",
    cursor: "pointer",
    padding: "6px 8px",
    fontSize: "0.7rem",
    fontWeight: 750,
  },
  sessionDeleteButton: {
    borderColor: "rgba(248,113,113,0.24)",
    color: "#fca5a5",
  },
  sessionEdit: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    gap: "5px",
  },
  sessionNameInput: {
    width: "100%",
  },
  emptyText: { color: "#64748b", fontSize: "0.8rem", padding: "10px 2px" },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    alignItems: "end",
    gap: "9px",
    marginTop: "10px",
  },
  field: { display: "grid", gap: "5px", color: "#94a3b8", fontSize: "0.74rem" },
  saveButton: { alignSelf: "end" },
})
