import * as stylex from "@stylexjs/stylex"
import { useEffect, useState } from "react"
import {
  PROGRAM_RECEIVE_PREFIX,
  PROGRAM_SEND_PREFIX,
  MIN_SLOTS,
} from "../../../shared/router-setup"
import { validateRouterConfig } from "../../../shared/router-config"
import type { RouterConfig } from "../../../shared/router-types"
import { Toast } from "../components/Toast"
import { ActionButton, InfoTooltip, Notice, StatusBadge, Surface } from "../ui-kit"
import { AnimatedDisclosure } from "../components/AnimatedDisclosure"
import { useRouterPanel } from "./useRouterPanel"
import { styles } from "./RouterPanel.styles"
import { RouterWizard } from "./RouterWizard"
import { ProgramConnectionGuide } from "./ProgramConnectionGuide"
import { RouterManualEditor } from "./RouterManualEditor"
import { MonitorList } from "./MonitorList"
import { programPortGroups } from "./router-presentation"

export function RouterPanel() {
  const router = useRouterPanel()
  const [draft, setDraft] = useState<RouterConfig | null>(null)
  const [dirty, setDirty] = useState(false)
  const [wizard, setWizard] = useState(false)
  const [manual, setManual] = useState(false)
  useEffect(() => {
    if (router.state && !dirty) setDraft(router.state.config)
  }, [router.state, dirty])
  const config = draft ?? router.state?.config ?? null,
    state = router.state
  function update(next: RouterConfig) {
    setDraft(next)
    setDirty(true)
  }
  if (!config || !state)
    return (
      <section {...stylex.props(styles.panel)} aria-busy={router.refreshing}>
        <div {...stylex.props(styles.headingRow)}>
          <h2 {...stylex.props(styles.title)}>Comparte un dispositivo MIDI</h2>
        </div>
        <Notice
          tone={router.error ? "warning" : "info"}
          role={router.error ? "alert" : "status"}
        >
          {router.error ?? "Cargando dispositivos y configuración…"}
          {router.error ? (
            <ActionButton
              variant="secondary"
              isDisabled={router.refreshing}
              onPress={() => void router.refresh()}
            >
              {router.refreshing ? "Actualizando…" : "Reintentar"}
            </ActionButton>
          ) : null}
        </Notice>
      </section>
    )
  const isEmpty = config.ports.length === 0 && config.routes.length === 0
  const showWizard = wizard || (isEmpty && !manual)
  const errors = validateRouterConfig(config)
  const canStart = config.routes.length > 0 && errors.length === 0
  const virtualPorts = config.ports.filter((port) => port.kind === "virtual")
  const programCount = virtualPorts.filter((port) => port.role === "input").length
  const hasProgramPairs =
    programCount >= MIN_SLOTS &&
    virtualPorts.length === programCount * 2 &&
    Array.from({ length: programCount }, (_, index) => index + 1).every(
      (slot) =>
        virtualPorts.some(
          (port) =>
            port.role === "input" && port.deviceName === `${PROGRAM_SEND_PREFIX} ${slot}`,
        ) &&
        virtualPorts.some(
          (port) =>
            port.role === "output" &&
            port.deviceName === `${PROGRAM_RECEIVE_PREFIX} ${slot}`,
        ),
    )
  const incomplete =
    state.provisioning?.ok === false ||
    (state.running && state.ports.some((port) => !port.connected))
  const progressLabel =
    router.busy === "stop"
      ? "Deteniendo router…"
      : router.busy === "start"
        ? "Preparando puertos…"
        : "Guardando…"
  const saveLabel = !canStart
    ? "Guardar borrador"
    : state.running
      ? "Aplicar cambios"
      : "Guardar y arrancar"
  async function save() {
    const result = await router.saveConfig(config!, !state!.running && canStart)
    if (result) {
      setDraft(result.state.config)
      setDirty(false)
    }
  }
  return (
    <section {...stylex.props(styles.panel)} aria-busy={router.busy !== null}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (dirty && !router.busy) void save()
        }}
      >
        <fieldset disabled={router.busy !== null} {...stylex.props(styles.wizardFields)}>
          <div {...stylex.props(styles.headingRow)}>
            <div {...stylex.props(styles.headingCopy)}>
              <div {...stylex.props(styles.labelRow)}>
                <h2 {...stylex.props(styles.title)}>Comparte un dispositivo MIDI</h2>
                <InfoTooltip
                  label="MIDI splitter y merger"
                  content="Reparte los mensajes de un dispositivo entre varios programas y combina sus respuestas. Cada programa utiliza su propio par de puertos virtuales."
                />
              </div>
            </div>
            <div {...stylex.props(styles.headingActions)}>
              <StatusBadge
                tone={incomplete ? "warning" : state.running ? "success" : "neutral"}
                dot
              >
                {incomplete
                  ? "Conexión incompleta"
                  : state.running
                    ? "En marcha"
                    : "Detenido"}
              </StatusBadge>
              {!showWizard && !isEmpty ? (
                <>
                  <ActionButton
                    variant="secondary"
                    size="small"
                    isDisabled={router.refreshing}
                    onPress={() => void router.refresh()}
                  >
                    {router.refreshing ? "Actualizando…" : "Actualizar dispositivos"}
                  </ActionButton>
                  <ActionButton
                    tone="cyan"
                    isDisabled={!state.running && (dirty || !canStart)}
                    onPress={() => void (state.running ? router.stop() : router.start())}
                  >
                    {router.busy
                      ? progressLabel
                      : state.running
                        ? "Detener"
                        : "Arrancar router"}
                  </ActionButton>
                </>
              ) : null}
            </div>
          </div>
          {router.error ? (
            <Notice tone="danger" layout="stack" role="alert">
              <strong>No se pudo completar la operación</strong>
              {router.error}
            </Notice>
          ) : null}
          {!showWizard && errors.length > 0 ? (
            <Notice tone="warning" layout="stack">
              <strong>Pendientes antes de arrancar</strong>
              <ul {...stylex.props(styles.noticeList)}>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {state.warnings.map((warning) => (
            <Notice key={warning} tone="warning" layout="stack">
              <strong>Conflicto con el controlador</strong>
              {warning}
            </Notice>
          ))}
          {state.provisioning && !state.provisioning.ok ? (
            <Notice tone="danger" layout="stack">
              <strong>Puertos virtuales</strong>
              {state.provisioning.message}
            </Notice>
          ) : null}
          {state.running && state.ports.some((port) => !port.connected) ? (
            <Notice tone="warning" layout="stack">
              <strong>Hay conexiones pendientes</strong>
              {state.ports
                .filter((port) => !port.connected)
                .map((port) => (
                  <span key={port.id}>
                    {port.deviceName}:{" "}
                    {port.error ?? "Comprueba el dispositivo y sus puertos MIDI."}
                  </span>
                ))}
            </Notice>
          ) : null}
          {showWizard ? (
            <RouterWizard
              initialConfig={config}
              devices={state.devices}
              busy={router.busy !== null}
              refreshing={router.refreshing}
              progressLabel={progressLabel}
              onRefresh={() => void router.refresh()}
              onCancel={
                wizard
                  ? () => {
                      setWizard(false)
                      if (isEmpty) setManual(true)
                    }
                  : undefined
              }
              onApply={(next) => {
                void router.saveConfig(next, true).then((result) => {
                  if (!result) return
                  setDraft(result.state.config)
                  setDirty(false)
                  setWizard(false)
                  setManual(false)
                })
              }}
            />
          ) : (
            <>
              {virtualPorts.length > 0 ? (
                <Surface
                  as="article"
                  variant="subtle"
                  padding="custom"
                  {...stylex.props(styles.card)}
                >
                  <div {...stylex.props(styles.cardHeading)}>
                    <div {...stylex.props(styles.labelRow)}>
                      <strong>
                        {dirty ? "Vista previa de puertos" : "Conecta tus programas"}
                      </strong>
                      <InfoTooltip
                        label="Conexión en los programas"
                        content="Selecciona los puertos de esta tabla en la configuración MIDI de cada programa. Los roles se muestran desde el programa: entrada recibe y salida envía."
                        detail="Desactiva MIDI Thru si el programa reenvía automáticamente lo que recibe."
                      />
                    </div>
                    <StatusBadge
                      tone={
                        incomplete ? "warning" : state.running ? "success" : "neutral"
                      }
                    >
                      {dirty
                        ? "Sin aplicar"
                        : incomplete
                          ? "Conexiones pendientes"
                          : state.running
                            ? "Puertos activos"
                            : "Router detenido"}
                    </StatusBadge>
                  </div>
                  {!state.running ? (
                    <span {...stylex.props(styles.fieldHelp)}>
                      Arranca el router para preparar estos puertos.
                    </span>
                  ) : null}
                  {hasProgramPairs ? (
                    <ProgramConnectionGuide slots={programCount} />
                  ) : (
                    <ul {...stylex.props(styles.noticeList)}>
                      {programPortGroups(virtualPorts).map((group) => (
                        <li key={group.label}>
                          {group.label}: {group.names.join(" · ")}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div {...stylex.props(styles.cardActions)}>
                    <ActionButton
                      variant="secondary"
                      size="small"
                      onPress={() => setWizard(true)}
                    >
                      Cambiar dispositivo o programas
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      size="small"
                      aria-pressed={manual}
                      onPress={() => setManual((current) => !current)}
                    >
                      {manual ? "Cerrar edición avanzada" : "Editar puertos y rutas"}
                    </ActionButton>
                  </div>
                </Surface>
              ) : !manual ? (
                <div {...stylex.props(styles.cardActions)}>
                  <ActionButton
                    variant="secondary"
                    size="small"
                    onPress={() => setWizard(true)}
                  >
                    Abrir asistente
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    size="small"
                    onPress={() => setManual(true)}
                  >
                    Editar puertos y rutas
                  </ActionButton>
                </div>
              ) : null}
              {manual ? (
                <RouterManualEditor
                  config={config}
                  state={state}
                  update={update}
                  onWizard={() => setWizard(true)}
                />
              ) : null}
              {dirty ? (
                <div {...stylex.props(styles.footer)}>
                  <span {...stylex.props(styles.dirtyHint)}>
                    Cambios sin guardar
                    {errors.length ? " · puedes guardarlos como borrador" : ""}.
                  </span>
                  <div {...stylex.props(styles.cardActions)}>
                    <ActionButton
                      variant="ghost"
                      onPress={() => {
                        setDraft(state.config)
                        setDirty(false)
                      }}
                    >
                      Descartar cambios
                    </ActionButton>
                    <ActionButton tone="cyan" type="submit">
                      {router.busy ? progressLabel : saveLabel}
                    </ActionButton>
                  </div>
                </div>
              ) : null}
              {!isEmpty ? (
                <Surface
                  as="article"
                  variant="subtle"
                  padding="custom"
                  {...stylex.props(styles.card)}
                >
                  <AnimatedDisclosure
                    summary={
                      <span {...stylex.props(styles.monitorHeading)}>
                        <strong>Monitor MIDI</strong>
                        <span {...stylex.props(styles.cardDetail)}>
                          {state.stats.received} recibidos · {state.stats.sent} enviados
                        </span>
                      </span>
                    }
                    summaryActions={
                      <InfoTooltip
                        label="Monitor MIDI"
                        content={`Muestra los últimos mensajes. Filtrados: ${state.stats.dropped}. Sin entregar: ${state.stats.undelivered}.`}
                      />
                    }
                    buttonProps={stylex.props(styles.disclosure)}
                  >
                    <div {...stylex.props(styles.monitorContent)}>
                      <MonitorList events={router.monitor} />
                      {router.monitor.length ? (
                        <div {...stylex.props(styles.cardActions)}>
                          <ActionButton
                            variant="ghost"
                            size="small"
                            onPress={router.clearMonitor}
                          >
                            Limpiar monitor
                          </ActionButton>
                        </div>
                      ) : null}
                    </div>
                  </AnimatedDisclosure>
                </Surface>
              ) : null}
            </>
          )}
        </fieldset>
      </form>
      {isEmpty && !manual && !wizard ? (
        <button
          type="button"
          disabled={router.busy !== null}
          {...stylex.props(styles.manualLink)}
          onClick={() => setManual(true)}
        >
          Configurar puertos y rutas manualmente
        </button>
      ) : null}
      {router.message ? (
        <Toast message={router.message} onDismiss={router.clearMessage} />
      ) : null}
    </section>
  )
}
