import * as stylex from "@stylexjs/stylex"
import { useEffect, useState, type ReactNode } from "react"
import type {
  AutomationMidiCommand,
  AutomationMode,
  AutomationSettings,
  AutomationSocketCommand,
} from "../../../shared/automation-types"
import { Toast } from "../components/Toast"
import { ActionButton, StatusBadge, Surface } from "../ui-kit"
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
        .map((item) => item.trim())
        .filter(Boolean)
        .map(Number)
        .filter((item) => Number.isFinite(item)),
    ),
  ].map((item) => Math.max(0, Math.min(127, Math.round(item))))
}

/** Renders a duration the way a person reads it, next to the raw millisecond input. */
function formatMilliseconds(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "—"
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  if (milliseconds >= 60000) {
    const minutes = milliseconds / 60000
    const rounded = Math.round(minutes * 10) / 10
    return `${String(rounded).replace(".", ",")} min`
  }
  const seconds = milliseconds / 1000
  const rounded = seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10
  return `${String(rounded).replace(".", ",")} s`
}

/** One themed block of related rules, so the panel reads as four questions, not nine inputs. */
function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section {...stylex.props(styles.settingsGroup)}>
      <div {...stylex.props(styles.groupHeading)}>
        <span {...stylex.props(styles.groupTitle)}>{title}</span>
        <span {...stylex.props(styles.groupDescription)}>{description}</span>
      </div>
      <div {...stylex.props(styles.settingsGrid)}>{children}</div>
    </section>
  )
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  help,
  isDuration,
  isDisabled,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  help: string
  /** Renders the value and the accepted range in seconds and minutes, not raw ms. */
  isDuration?: boolean
  isDisabled?: boolean
  onChange: (value: number) => void
}) {
  const range = isDuration
    ? `${formatMilliseconds(value)} · entre ${formatMilliseconds(min)} y ${formatMilliseconds(max)}`
    : `Entre ${min} y ${max} ${unit}`

  return (
    <label {...stylex.props(styles.field, isDisabled && styles.fieldDisabled)}>
      <span {...stylex.props(styles.fieldLabel)}>
        {label}
        <span {...stylex.props(styles.fieldUnit)}>{unit}</span>
      </span>
      <input
        type="number"
        min={min}
        max={max}
        disabled={isDisabled}
        {...stylex.props(styles.input)}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span {...stylex.props(styles.fieldHelp)}>{help}</span>
      <span {...stylex.props(styles.fieldRange)}>{range}</span>
    </label>
  )
}

function MidiListField({
  label,
  values,
  help,
  kind,
  onChange,
}: {
  label: string
  values: number[]
  help: string
  kind: "notas" | "CC"
  onChange: (values: number[]) => void
}) {
  const serialized = values.join(",")
  const [draft, setDraft] = useState(serialized)
  useEffect(() => setDraft(serialized), [serialized])
  return (
    <label {...stylex.props(styles.field)}>
      <span {...stylex.props(styles.fieldLabel)}>{label}</span>
      <input
        {...stylex.props(styles.input)}
        value={draft}
        placeholder="Ej. 36,37"
        onChange={(event) => {
          setDraft(event.target.value)
          onChange(parseMidiList(event.target.value))
        }}
        onBlur={() => {
          const parsed = parseMidiList(draft)
          setDraft(parsed.join(","))
          onChange(parsed)
        }}
      />
      <span {...stylex.props(styles.fieldHelp)}>{help}</span>
      <span {...stylex.props(styles.fieldRange)}>
        {values.length === 0 ? "Ninguno" : `${values.length} en la lista`} · {kind} 0–127
      </span>
    </label>
  )
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
        <Surface
          as="article"
          variant="subtle"
          padding="custom"
          {...stylex.props(styles.statusCard)}
        >
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
          <ActionButton
            tone="cyan"
            isDisabled={automation.busy === "audio"}
            onPress={() =>
              automation.audioRunning
                ? automation.stopAudio()
                : void automation.startAudio()
            }
          >
            {automation.audioRunning ? "Detener audio" : "Activar audio"}
          </ActionButton>
          <span {...stylex.props(styles.cardDetail)}>
            {status?.audioConnected
              ? "Señal recibida y analizada localmente"
              : status?.waveformConnected
                ? "Opcional: el waveform PRO DJ LINK ya puede entrenar el modelo"
                : "Selecciona el USB/REC OUT del mixer"}
          </span>
        </Surface>

        <Surface
          as="article"
          variant="subtle"
          padding="custom"
          {...stylex.props(styles.statusCard)}
        >
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
          <ActionButton
            variant="secondary"
            tone="cyan"
            isDisabled={automation.busy === "bridge"}
            onPress={() => void automation.restartBridge()}
          >
            Reiniciar listener
          </ActionButton>
          <span {...stylex.props(styles.cardDetail)}>
            {status?.bridge.message ?? "Buscando los CDJ en la red Ethernet"}
          </span>
        </Surface>

        <Surface
          as="article"
          variant="subtle"
          padding="custom"
          {...stylex.props(styles.statusCard)}
        >
          <div {...stylex.props(styles.cardHeading)}>
            <span {...stylex.props(styles.cardIcon)}>AI</span>
            <strong>Modelo local</strong>
          </div>
          <div {...stylex.props(styles.metric)}>
            <span>Ejemplos</span>
            <strong>{status?.modelExampleCount ?? 0}</strong>
          </div>
          <ActionButton
            variant="secondary"
            tone="cyan"
            isDisabled={automation.busy === "train"}
            onPress={() => void automation.train()}
          >
            Reentrenar ahora
          </ActionButton>
          <span {...stylex.props(styles.cardDetail)}>
            Se actualiza automáticamente al terminar cada sesión
          </span>
        </Surface>
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
          <ActionButton
            variant="danger"
            isDisabled={automation.busy === "session"}
            onPress={() => void automation.stopSession()}
          >
            Finalizar y aprender
          </ActionButton>
        ) : (
          <div {...stylex.props(styles.trainingControls)}>
            <StatusBadge tone={sourceReady ? "info" : "neutral"} dot={sourceReady}>
              {sourceLabel}
            </StatusBadge>
            <input
              {...stylex.props(styles.input)}
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              placeholder="Nombre (opcional)"
              disabled={!sourceReady}
            />
            <ActionButton
              tone="cyan"
              isDisabled={automation.busy === "session" || !sourceReady}
              onPress={() =>
                void automation.startSession(
                  sessionName || `Sesión ${new Date().toLocaleDateString()}`,
                )
              }
            >
              Empezar entrenamiento
            </ActionButton>
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
                    <ActionButton
                      variant="secondary"
                      size="small"
                      {...stylex.props(styles.curveButton)}
                      onPress={() => setEditingSliderGestureId(gesture.id)}
                    >
                      Editar curva
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      size="small"
                      {...stylex.props(styles.curveButton)}
                      isDisabled={automation.busy === "edit-examples"}
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
                    beat {event.beatWithinBar || "—"} · {event.bpm?.toFixed(1) || "—"} BPM
                  </small>
                  <ActionButton
                    variant="danger"
                    size="small"
                    {...stylex.props(styles.excludeButton)}
                    isDisabled={automation.busy === `exclude-${event.example?.id}`}
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
        <Surface
          as="article"
          variant="subtle"
          padding="custom"
          {...stylex.props(styles.subPanel)}
        >
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
                      <ActionButton
                        variant="secondary"
                        size="small"
                        {...stylex.props(styles.sessionActionButton)}
                        isDisabled={
                          !sessionNameDraft.trim() ||
                          automation.busy === `rename-${session.id}`
                        }
                        onPress={() => void saveSessionName(session.id)}
                      >
                        Guardar
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        size="small"
                        {...stylex.props(styles.sessionActionButton)}
                        onPress={() => setEditingSessionId(null)}
                      >
                        Cancelar
                      </ActionButton>
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
                        <ActionButton
                          variant="ghost"
                          size="small"
                          {...stylex.props(styles.sessionActionButton)}
                          onPress={() => {
                            setEditingSessionId(session.id)
                            setSessionNameDraft(session.name)
                          }}
                        >
                          Renombrar
                        </ActionButton>
                        <ActionButton
                          variant="danger"
                          size="small"
                          {...stylex.props(styles.sessionActionButton)}
                          isDisabled={automation.busy === `delete-${session.id}`}
                          onPress={() => void removeSession(session.id, session.name)}
                        >
                          Eliminar
                        </ActionButton>
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
        </Surface>

        <Surface
          as="article"
          variant="subtle"
          padding="custom"
          {...stylex.props(styles.subPanel)}
        >
          <div {...stylex.props(styles.rulesHeading)}>
            <strong>Reglas de seguridad</strong>
            <span {...stylex.props(styles.cardDetail)}>
              Cada acción que propone la automatización tiene que pasar estos filtros
              antes de que se envíe MIDI. Si no pasa uno, se descarta y verás el motivo en
              la sugerencia.
            </span>
          </div>
          {settings ? (
            <>
              <SettingsGroup
                title="Cuándo puede actuar"
                description="Evita que la automatización dispare de más o con poca certeza."
              >
                <NumberField
                  label="Confianza mínima"
                  unit="%"
                  min={25}
                  max={98}
                  value={Math.round(settings.confidenceThreshold * 100)}
                  help="Descarta la sugerencia si el modelo está menos seguro que esto."
                  onChange={(value) => setSetting("confidenceThreshold", value / 100)}
                />
                <NumberField
                  label="Intervalo mínimo"
                  unit="ms"
                  min={250}
                  max={30000}
                  value={settings.minActionIntervalMs}
                  isDuration
                  help="Tiempo que debe pasar entre dos acciones automáticas cualesquiera."
                  onChange={(value) => setSetting("minActionIntervalMs", value)}
                />
                <NumberField
                  label="Espera para repetir"
                  unit="ms"
                  min={500}
                  max={120000}
                  value={settings.repeatActionCooldownMs}
                  isDuration
                  help="Igual que el anterior, pero solo para repetir la misma nota o CC."
                  onChange={(value) => setSetting("repeatActionCooldownMs", value)}
                />
              </SettingsGroup>

              <SettingsGroup
                title="Qué no debe tocar nunca"
                description="Números MIDI de tu mapeo de luces, separados por comas."
              >
                <MidiListField
                  label="Notas protegidas"
                  kind="notas"
                  values={settings.blockedNotes}
                  help="La automatización nunca envía estas notas. Reserva aquí lo que quieras controlar solo a mano."
                  onChange={(values) => setSetting("blockedNotes", values)}
                />
                <MidiListField
                  label="CC protegidos"
                  kind="CC"
                  values={settings.blockedControllers}
                  help="Controles continuos que la automatización nunca mueve, como el máster de intensidad."
                  onChange={(values) => setSetting("blockedControllers", values)}
                />
              </SettingsGroup>

              <SettingsGroup
                title="Strobe"
                description="Los strobes llevan su propio límite, aparte del resto de acciones."
              >
                <MidiListField
                  label="Notas strobe"
                  kind="notas"
                  values={settings.strobeNotes}
                  help="Notas que se tratan como strobe y quedan sujetas a la espera de abajo."
                  onChange={(values) => setSetting("strobeNotes", values)}
                />
                <NumberField
                  label="Espera entre strobes"
                  unit="ms"
                  min={1000}
                  max={120000}
                  value={settings.strobeCooldownMs}
                  isDuration
                  isDisabled={settings.strobeNotes.length === 0}
                  help={
                    settings.strobeNotes.length === 0
                      ? "Sin efecto mientras no haya ninguna nota strobe declarada."
                      : "Tiempo mínimo entre dos disparos de cualquier nota strobe."
                  }
                  onChange={(value) => setSetting("strobeCooldownMs", value)}
                />
              </SettingsGroup>

              <SettingsGroup
                title="Control manual y deck"
                description="Quién manda cuando intervienes tú, y de qué deck se lee el audio."
              >
                <NumberField
                  label="Pausa tras control manual"
                  unit="ms"
                  min={1000}
                  max={60000}
                  value={settings.manualOverrideMs}
                  isDuration
                  help="Al tocar un control a mano, la automatización se detiene este tiempo."
                  onChange={(value) => setSetting("manualOverrideMs", value)}
                />
                <label {...stylex.props(styles.field)}>
                  <span {...stylex.props(styles.fieldLabel)}>Deck preferido</span>
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
                  <span {...stylex.props(styles.fieldHelp)}>
                    Automático sigue al deck que esté sonando. Fíjalo si siempre pinchas
                    desde el mismo.
                  </span>
                </label>
              </SettingsGroup>

              <div {...stylex.props(styles.rulesFooter)}>
                <span {...stylex.props(styles.dirtyHint)}>
                  {settingsDirty
                    ? "Tienes cambios sin guardar; se aplican al pulsar Guardar."
                    : "Sin cambios pendientes."}
                </span>
                <ActionButton
                  tone="cyan"
                  isDisabled={!settingsDirty || automation.busy === "settings"}
                  onPress={() => void saveSettings()}
                >
                  Guardar reglas
                </ActionButton>
              </div>
            </>
          ) : null}
        </Surface>
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
    width: "112px",
    textAlign: "center",
    whiteSpace: "nowrap",
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
    width: "112px",
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
    width: "82px",
    fontSize: "0.7rem",
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
  rulesHeading: { display: "grid", gap: "4px" },
  settingsGroup: {
    marginTop: "12px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "rgba(255, 255, 255, 0.07)",
    paddingTop: "11px",
  },
  groupHeading: { display: "grid", gap: "2px", marginBottom: "9px" },
  groupTitle: { color: "#e2e8f0", fontSize: "0.78rem", fontWeight: 700 },
  groupDescription: { color: "#7c8ba1", fontSize: "0.72rem", lineHeight: 1.4 },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(216px, 1fr))",
    alignItems: "start",
    gap: "12px",
  },
  field: {
    display: "grid",
    gap: "4px",
    alignContent: "start",
    color: "#94a3b8",
    fontSize: "0.74rem",
  },
  fieldDisabled: { opacity: 0.5 },
  fieldLabel: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "6px",
    color: "#cbd5e1",
    fontWeight: 600,
  },
  fieldUnit: { color: "#64748b", fontSize: "0.68rem", fontWeight: 500 },
  fieldHelp: { color: "#8496ad", fontSize: "0.7rem", lineHeight: 1.35 },
  fieldRange: { color: "#5c6b82", fontSize: "0.66rem" },
  rulesFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "9px",
    marginTop: "14px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "rgba(255, 255, 255, 0.07)",
    paddingTop: "12px",
  },
  dirtyHint: { color: "#94a3b8", fontSize: "0.72rem" },
})
