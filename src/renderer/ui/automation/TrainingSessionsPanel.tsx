import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { ActionButton, Surface } from "../ui-kit"
import { styles } from "./AutomationStudio.styles"
import { formatDuration } from "./automation-format"
import type { AutomationStudioState } from "./types"

export function TrainingSessionsPanel({
  automation,
  controlsDisabled,
}: {
  automation: AutomationStudioState
  controlsDisabled: boolean
}) {
  const status = automation.status
  const sessionControlsDisabled = controlsDisabled || Boolean(status?.recording)
  const reviewRef = "automation-session-review"
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)

  const [sessionNameDraft, setSessionNameDraft] = useState("")

  async function saveSessionName(id: string) {
    if (!sessionNameDraft.trim() || sessionControlsDisabled) return
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
  return (
    <Surface
      as="article"
      variant="subtle"
      padding="custom"
      {...stylex.props(styles.subPanel)}
    >
      <div {...stylex.props(styles.cardHeading)}>
        <strong>Sesiones guardadas</strong>
        <span {...stylex.props(styles.cardDetail)} role="status">
          {automation.busy === "timeline"
            ? "Cargando sesión…"
            : `${status?.sessions.length ?? 0} ${status?.sessions.length === 1 ? "sesión" : "sesiones"} · ${status?.modelExampleCount ?? 0} ${status?.modelExampleCount === 1 ? "ejemplo" : "ejemplos"}`}
        </span>
      </div>
      <div {...stylex.props(styles.sessionList)}>
        {status?.sessions.map((session) => {
          const isEditing = editingSessionId === session.id
          const isSelected = automation.selectedSessionId === session.id

          return (
            <div
              key={session.id}
              {...stylex.props(styles.sessionRow, isSelected && styles.sessionRowActive)}
            >
              {isEditing ? (
                <div {...stylex.props(styles.sessionEdit)}>
                  <input
                    autoFocus
                    {...stylex.props(styles.input, styles.sessionNameInput)}
                    value={sessionNameDraft}
                    disabled={sessionControlsDisabled}
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
                    isDisabled={!sessionNameDraft.trim() || sessionControlsDisabled}
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
                    disabled={sessionControlsDisabled}
                    aria-pressed={isSelected}
                    aria-controls={reviewRef}
                    onClick={() => void automation.loadSession(session.id)}
                  >
                    <span>{session.name}</span>
                    <small>
                      {formatDuration(session.durationMs)} ·{" "}
                      {session.endedAt
                        ? `${session.trainingExampleCount} ${session.trainingExampleCount === 1 ? "ejemplo" : "ejemplos"}`
                        : "Grabando"}
                    </small>
                  </button>
                  <div {...stylex.props(styles.sessionActions)}>
                    <ActionButton
                      variant="ghost"
                      size="small"
                      {...stylex.props(styles.sessionActionButton)}
                      isDisabled={sessionControlsDisabled}
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
                      isDisabled={sessionControlsDisabled}
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
            Finaliza una grabación para verla aquí y revisar sus acciones.
          </span>
        ) : null}
      </div>
    </Surface>
  )
}
